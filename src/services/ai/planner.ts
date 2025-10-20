/*
  File: src/services/ai/planner.ts
  Overview: Multi-step planning utilities for complex AI commands.
  Examples:
    - "create a login form" -> plan becomes a sequence of tool calls
*/

import type { ToolCall } from './executor';
import { execute } from './executor';
import { toolSpecs } from './tools';
import { validateParams } from './tools';
import { getOpenAI } from './openai';
import { loadCanvas } from '../canvas';
import { db, auth } from '../firebase';
import { getDoc, doc } from 'firebase/firestore';
import { logClassification } from './classificationLog';

// --- Brief canvas utilities and router types ---
type BriefRect = { id: string; kind: 'rectangle'; x: number; y: number; w: number; h: number; fill?: string; z: number };
type BriefCircle = { id: string; kind: 'circle'; cx: number; cy: number; r: number; fill?: string; z: number };
type BriefText = { id: string; kind: 'text'; x: number; y: number; w: number; h: number; fill?: string; text?: string; z: number };
type BriefShape = BriefRect | BriefCircle | BriefText;

function toBrief(state: any, limit = 80): { shapes: BriefShape[] } {
  const rnd = (n: number) => Math.round(n);
  const trunc = (s: string, n = 60) => (s && s.length > n ? s.slice(0, n) : s);
  const rects: BriefRect[] = (state?.rects || []).map((r: any) => ({ id: r.id, kind: 'rectangle', x: rnd(r.x), y: rnd(r.y), w: rnd(r.width), h: rnd(r.height), fill: r.fill, z: (r?.z as number) ?? 0 }));
  const circles: BriefCircle[] = (state?.circles || []).map((c: any) => ({ id: c.id, kind: 'circle', cx: rnd(c.cx), cy: rnd(c.cy), r: rnd(c.radius), fill: c.fill, z: (c?.z as number) ?? 0 }));
  const texts: BriefText[] = (state?.texts || []).map((t: any) => ({ id: t.id, kind: 'text', x: rnd(t.x), y: rnd(t.y), w: rnd(t.width), h: rnd(t.height ?? 24), fill: t.fill, text: trunc(t.text || ''), z: (t?.z as number) ?? 0 }));
  const shapes = [...rects, ...circles, ...texts].sort((a: any, b: any) => (a.z ?? 0) - (b.z ?? 0)).slice(0, limit);
  return { shapes };
}

export type RouteResult =
  | { kind: 'chat'; message: string }
  | { kind: 'plan'; plan: Plan };

export type StepStatus = 'pending' | 'running' | 'succeeded' | 'failed';

export type PlanStep = ToolCall & { id: string; status: StepStatus };

export type Plan = {
  steps: PlanStep[];
};

/** Detect if a prompt requires multi-step execution (heuristic). */
export type Classification = { kind: 'simple' | 'complex' | 'chat'; message?: string };

/**
 * Classify a prompt using the LLM: "simple" | "complex" | "chat: ...".
 * - simple: can be done in one tool call (create/move/resize/delete/recolorSelected)
 * - complex: requires multiple steps/planning
 * - chat: regular conversational response; return message without the prefix
 */
export async function classifyPrompt(prompt: string): Promise<Classification> {
  const openai = getOpenAI();
  const modelVersion = 'gpt-4o-mini';
  const system =
    'You are an orchestration classifier inside a Figma-like canvas app.\n' +
    'TOOLS CURRENTLY AVAILABLE (single-step): createShape(rectangle|circle), createText, moveShape, resizeShape, deleteShape, rotateShape, recolorShape.\n' +
    'CLASSIFY the user prompt into EXACTLY ONE of:\n' +
    '- simple  (one tool call from the above suffices)\n' +
    '- complex (requires multiple steps/sequence/planning)\n' +
    '- chat: <freeform reply> (when it is not an actionable canvas command).\n' +
    'Rules: respond strictly with simple, complex, or chat: <text>. No explanations, no quotes, no markdown.';

  const res = await openai.chat.completions.create({
    model: modelVersion,
    temperature: 0,
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: prompt },
    ],
  } as any);

  const raw = res.choices?.[0]?.message?.content?.trim() || '';
  if (import.meta.env.DEV) console.log('[planner] classify raw', raw);
  const lc = raw.toLowerCase();
  let result: Classification;
  if (lc === 'simple' || lc === 'complex') {
    result = { kind: lc as 'simple' | 'complex' };
  } else if (lc.startsWith('chat:')) {
    result = { kind: 'chat', message: raw.slice(raw.indexOf(':') + 1).trim() };
  } else {
    // Fallback: avoid heuristics; let downstream planner decide via tools
    result = { kind: 'simple' } as Classification;
  }
  // Defer detailed logging to router/buildPlan where tool call count is known
  return result;
}

/** Build a plan using the LLM function-calling hints. */
export async function buildPlan(prompt: string): Promise<Plan> {
  const openai = getOpenAI();
  // Fetch canvas state up-front so the model can resolve referents and compute absolute coordinates.
  // We use a compact JSON to keep tokens low.
  let state: any = null;
  let canvasBrief = '';
  try {
    state = await loadCanvas();
    if (state) canvasBrief = JSON.stringify(toBrief(state));
  } catch {}

  // Load per-user recent AI memory and expose to the planner for pronoun resolution
  let recentMemory: any = {};
  try {
    const uid = auth.currentUser?.uid;
    if (uid) {
      const snap = await getDoc(doc(db, 'users', uid, 'aiMemory', 'recent'));
      const rm = snap.exists() ? (snap.data() || {}) : {};
      // Trim to essentials
      recentMemory = { last: rm.last, lastByType: rm.lastByType };
    }
  } catch {}
  // Expose only actionable tools (state is already injected; selection is deprecated)
  const allowedToolSpecs = toolSpecs.filter((t) => t.name !== 'getCanvasState' && t.name !== 'selectShapes');
  const tools = allowedToolSpecs.map((t) => ({
    type: 'function',
    function: { name: t.name, description: t.description, parameters: t.parameters },
  }));
  // Note: Deterministic pre-parsers are available as callable tools (preparseGrid, preparseRelativeMove, buildRelativeMove)
  // and should be invoked by the LLM when appropriate. No local regex/heuristics here.
  // Helper to parse tool calls from a completion response
  function parseCalls(resp: any): ToolCall[] {
    const out: ToolCall[] = [];
    const choice: any = resp?.choices?.[0];
    const msg: any = choice?.message || {};
    const tcs: any[] = msg?.tool_calls || [];
    if (Array.isArray(tcs) && tcs.length > 0) {
      for (const c of tcs) {
        if (c?.function?.name) {
          try {
            const args = c.function.arguments ? JSON.parse(c.function.arguments) : {};
            out.push({ name: c.function.name, arguments: args });
          } catch {
            // skip malformed
          }
        }
      }
      return out;
    }
    // Legacy/single function_call fallback
    if (msg?.function_call?.name) {
      try {
        const args = msg.function_call.arguments ? JSON.parse(msg.function_call.arguments) : {};
        out.push({ name: msg.function_call.name, arguments: args });
      } catch {
        // ignore
      }
    }
    // Content JSON fallback (e.g., model emitted JSON array of {name, arguments})
    const text: string = String(msg?.content || '').trim();
    if (out.length === 0 && text.startsWith('[')) {
      try {
        const arr = JSON.parse(text);
        if (Array.isArray(arr)) {
          for (const item of arr) {
            if (item?.name && item?.arguments) out.push({ name: item.name, arguments: item.arguments });
          }
        }
      } catch {
        // ignore
      }
    }
    return out;
  }

  // First attempt: suggest tools and allow auto selection
  const baseMessages = [
    { role: 'system', content: (
      'You are a planner for a Figma-like canvas. Use the provided CANVAS_STATE to resolve references (colors, types, text) and output concrete function calls.\n' +
      'Rules:\n' +
      '1) Use CANVAS_STATE (already provided) to compute absolute numeric coordinates for move/resize.\n' +
      '2) Allowed tools: createShape, createText, recolorShape, moveShape, resizeShape, deleteShape, rotateShape, createGrid, preparseGrid, preparseRelativeMove, buildRelativeMove.\n' +
      '3) Do NOT call getCanvasState or selectShapes. Resolve ids from CANVAS_STATE yourself.\n' +
      '4) Ambiguity policy:\n' +
      '   - For CREATION requests, proceed with sensible defaults (size, color, position) when underspecified—do not ask for clarification.\n' +
      '   - For TRANSFORMATION of an existing element (move/resize/rotate/recolor/delete), ONLY ask for clarification if the target cannot be uniquely resolved from CANVAS_STATE and RECENT_MEMORY.\n' +
      '   - If a single unique target is identifiable, execute the transformation without asking.\n' +
      '5) Use RECENT_MEMORY to resolve pronouns like "it/that/the <type>" (e.g., lastByType).\n' +
      '6) You may call preparseGrid/preparseRelativeMove/buildRelativeMove when helpful.'
    ) },
    { role: 'user', content: `CANVAS_STATE: ${canvasBrief || '{}'}` },
    { role: 'user', content: `RECENT_MEMORY: ${JSON.stringify(recentMemory || {})}` },
    { role: 'user', content: `Plan the steps for: ${prompt}` },
  ];
  let res = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    messages: baseMessages as any,
    tools: tools as any,
    tool_choice: 'auto',
    temperature: 0.1,
    max_tokens: 256,
  } as any);

  if (import.meta.env.DEV) console.log('[planner] buildPlan raw (auto)', res);
  let calls: ToolCall[] = parseCalls(res);

  // Second attempt: require at least one tool call if none found
  if (calls.length === 0) {
    res = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: baseMessages as any,
      tools: tools as any,
      tool_choice: 'required',
      temperature: 0.0,
      max_tokens: 256,
    } as any);
    if (import.meta.env.DEV) console.log('[planner] buildPlan raw (required)', res);
    calls = parseCalls(res);
  }

  // No heuristic fallbacks; if the LLM cannot produce tool calls, we'll handle at routing stage.

  const steps: PlanStep[] = calls.map((c, i) => ({ id: `${i + 1}`, status: 'pending', ...c }));
  // Fire-and-forget logging with toolCallCount and derived label
  try {
    const label = steps.length > 0 ? (steps.length > 1 ? 'complex' : 'simple') : 'chat';
    void logClassification({ prompt, label: label as any, modelVersion: 'gpt-4o-mini', meta: { toolCallCount: steps.length } });
  } catch {}
  return { steps };
}

/**
 * routeAndPlan: single-call router. Returns either chat content or a concrete plan.
 * Also logs classification with toolCallCount after the LLM result is known.
 */
export async function routeAndPlan(prompt: string): Promise<RouteResult> {
  const openai = getOpenAI();

  // Load once; reuse
  let state: any = null;
  try { state = await loadCanvas(); } catch {}
  const canvasBrief = JSON.stringify(toBrief(state || {}, 80));

  // Trim memory to essentials
  let recentMemory: any = {};
  try {
    const uid = auth.currentUser?.uid;
    if (uid) {
      const snap = await getDoc(doc(db, 'users', uid, 'aiMemory', 'recent'));
      const rm = snap.exists() ? (snap.data() || {}) : {};
      recentMemory = { last: rm.last, lastByType: rm.lastByType };
    }
  } catch {}

  const allowedToolSpecs = toolSpecs.filter((t) => t.name !== 'getCanvasState' && t.name !== 'selectShapes');
  const tools = allowedToolSpecs.map((t) => ({ type: 'function', function: { name: t.name, description: t.description, parameters: t.parameters } }));

  const messages = [
    { role: 'system', content:
      'You are a planner for a Figma-like canvas. If the prompt is actionable, emit function tool calls. If it is conversational, reply normally and DO NOT call any tools. Use CANVAS_STATE to resolve ids/coordinates. Ambiguity policy: For CREATION requests, proceed with defaults when underspecified; for TRANSFORMATION of an existing element, ONLY ask for a brief clarification if the target cannot be uniquely resolved from CANVAS_STATE/RECENT_MEMORY. If a unique target exists, execute without asking.'
    },
    { role: 'user', content: `CANVAS_STATE: ${canvasBrief || '{}'}` },
    { role: 'user', content: `RECENT_MEMORY: ${JSON.stringify(recentMemory || {})}` },
    { role: 'user', content: `Handle this: ${prompt}` },
  ];

  const res = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    messages: messages as any,
    tools: tools as any,
    tool_choice: 'auto',
    temperature: 0.1,
    max_tokens: 256,
  } as any);

  const msg: any = res?.choices?.[0]?.message || {};
  const tcs: any[] = Array.isArray(msg?.tool_calls) ? msg.tool_calls : [];
  const content: string = String(msg?.content || '').trim();

  // Log outcome with toolCallCount and derived label (defer, non-blocking)
  try {
    const label = tcs.length > 0 ? (tcs.length > 1 ? 'complex' : 'simple') : 'chat';
    void logClassification({ prompt, label: label as any, modelVersion: 'gpt-4o-mini', meta: { toolCallCount: tcs.length } });
  } catch {}

  if (tcs.length > 0) {
    const calls: ToolCall[] = [];
    for (const c of tcs) {
      if (c?.function?.name) {
        try {
          const args = c.function.arguments ? JSON.parse(c.function.arguments) : {};
          calls.push({ name: c.function.name, arguments: args });
        } catch {}
      }
    }
    const steps: PlanStep[] = calls.map((c, i) => ({ id: `${i + 1}`, status: 'pending', ...c }));
    return { kind: 'plan', plan: { steps } };
  }

  if (content) {
    return { kind: 'chat', message: content };
  }

  // Ask the model to explain what is missing and suggest an improved prompt
  try {
    const explain = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      temperature: 0,
      messages: [
        ...messages,
        { role: 'system', content: 'If you cannot emit any tool calls, reply in plain text with: 1) what information is missing or ambiguous, and 2) one improved prompt suggestion. Do not call any tools.' },
      ] as any,
    } as any);
    const fallback = String(explain?.choices?.[0]?.message?.content || '').trim();
    return { kind: 'chat', message: fallback || 'I need more detail. Please rephrase with concrete targets or counts.' };
  } catch {
    return { kind: 'chat', message: 'I need more detail. Please rephrase with concrete targets or counts.' };
  }
}

export type ProgressCallbacks = {
  onStepStart?: (step: PlanStep, index: number) => void;
  onStepSuccess?: (step: PlanStep, index: number, data?: unknown) => void;
  onStepError?: (step: PlanStep, index: number, error: string) => void;
};

export type PlanOptions = {
  maxSteps?: number;       // hard cap on steps executed
  timeoutMs?: number;      // per-step timeout
};

function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  if (!ms || ms <= 0) return p;
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`Timeout: ${label}`)), ms);
    p.then((v) => { clearTimeout(t); resolve(v); }, (e) => { clearTimeout(t); reject(e); });
  });
}

/**
 * Execute a plan step-by-step with guardrails and progress callbacks.
 * - Validates parameters before each step
 * - Applies maxSteps and per-step timeout
 * - Stops on first failure
 */
export async function runPlan(plan: Plan, cb: ProgressCallbacks = {}, opts: PlanOptions = {}): Promise<{ ok: true } | { ok: false; error: string; failedStep?: PlanStep }>{
  const { maxSteps = 20, timeoutMs = 5000 } = opts;
  const steps = plan.steps.slice(0, Math.max(0, Math.min(maxSteps, plan.steps.length)));
  for (let i = 0; i < steps.length; i++) {
    const step = steps[i];
    // Param revalidation
    const v = validateParams(step.name as any, step.arguments as any);
    if (!v.ok) {
      cb.onStepError?.(step, i, v.error);
      return { ok: false, error: v.error, failedStep: step };
    }
    cb.onStepStart?.(step, i);
    try {
      const res = await withTimeout(execute({ name: step.name, arguments: step.arguments }), timeoutMs, step.name);
      if (!res.ok) {
        cb.onStepError?.(step, i, res.error);
        return { ok: false, error: res.error, failedStep: step };
      }
      cb.onStepSuccess?.(step, i, res.data);
    } catch (e: any) {
      const msg = e?.message || 'Step failed';
      cb.onStepError?.(step, i, msg);
      return { ok: false, error: msg, failedStep: step };
    }
  }
  return { ok: true };
}
