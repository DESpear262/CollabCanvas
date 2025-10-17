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

export type StepStatus = 'pending' | 'running' | 'succeeded' | 'failed';

export type PlanStep = ToolCall & { id: string; status: StepStatus };

export type Plan = {
  steps: PlanStep[];
};

/** Detect if a prompt requires multi-step execution (heuristic). */
export type Classification = { kind: 'simple' | 'complex' | 'chat'; message?: string };

/**
 * Classify a prompt using the LLM: "simple" | "complex" | "chat: ...".
 * - simple: can be done in one tool call (create/move/resize/delete/recolor)
 * - complex: requires multiple steps/planning
 * - chat: regular conversational response; return message without the prefix
 */
export async function classifyPrompt(prompt: string): Promise<Classification> {
  const openai = getOpenAI();
  const system =
    'You are an orchestration classifier inside a Figma-like canvas app.\n' +
    'TOOLS CURRENTLY AVAILABLE (single-step): createShape(rectangle|circle), createText, moveShape, resizeShape, deleteShape, recolor (via create/updates).\n' +
    'CLASSIFY the user prompt into EXACTLY ONE of:\n' +
    '- simple  (one tool call from the above suffices)\n' +
    '- complex (requires multiple steps/sequence/planning)\n' +
    '- chat: <freeform reply> (when it is not an actionable canvas command).\n' +
    'Rules: respond strictly with simple, complex, or chat: <text>. No explanations, no quotes, no markdown.';

  const res = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    temperature: 0,
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: prompt },
    ],
  } as any);

  const raw = res.choices?.[0]?.message?.content?.trim() || '';
  if (import.meta.env.DEV) console.log('[planner] classify raw', raw);
  const lc = raw.toLowerCase();
  if (lc === 'simple' || lc === 'complex') return { kind: lc as 'simple' | 'complex' };
  if (lc.startsWith('chat:')) return { kind: 'chat', message: raw.slice(raw.indexOf(':') + 1).trim() };
  // Fallback: heuristic
  const heuristic = /login form|grid|row|column|toolbar|menu|list of|create \d+|in a row|in a column/i.test(prompt) ? 'complex' : 'simple';
  return { kind: heuristic } as Classification;
}

/** Async version that returns true if planning is needed. */
export async function needsPlanning(prompt: string): Promise<boolean> {
  try {
    const cls = await classifyPrompt(prompt);
    return cls.kind === 'complex';
  } catch {
    // Fallback to heuristic on error
    return /login form|grid|row|column|toolbar|menu|list of|create \d+|in a row|in a column/i.test(prompt);
  }
}

/** Build a plan using the LLM function-calling hints. */
export async function buildPlan(prompt: string): Promise<Plan> {
  const openai = getOpenAI();
  // Fetch canvas state up-front so the model can resolve referents and compute absolute coordinates.
  // We use a compact JSON to keep tokens low.
  let canvasBrief = '';
  try {
    const state = await loadCanvas();
    if (state) canvasBrief = JSON.stringify(state);
  } catch {}

  // Load per-user recent AI memory and expose to the planner for pronoun resolution
  let recentMemory: any = {};
  try {
    const uid = auth.currentUser?.uid;
    if (uid) {
      const snap = await getDoc(doc(db, 'users', uid, 'aiMemory', 'recent'));
      recentMemory = snap.exists() ? (snap.data() || {}) : {};
    }
  } catch {}
  // Expose only actionable tools (state is already injected; selection is deprecated)
  const allowedToolSpecs = toolSpecs.filter((t) => t.name !== 'getCanvasState' && t.name !== 'selectShapes');
  const tools = allowedToolSpecs.map((t) => ({
    type: 'function',
    function: { name: t.name, description: t.description, parameters: t.parameters },
  }));
  // Pre-parse deterministic relative move commands to avoid LLM role reversal
  const pre = preparseRelativeMove(prompt);
  if (pre) {
    const state = await loadCanvas().catch(() => null);
    const preCalls = buildRelativeMoveFromPrompt(pre.canonical, state || undefined);
    if (preCalls && preCalls.length > 0) return { steps: preCalls.map((c, i) => ({ id: `${i + 1}`, status: 'pending', ...c })) };
  }
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
      '2) Allowed tools: createShape, createText, moveShape, resizeShape, deleteShape, rotateShape.\n' +
      '3) Do NOT call getCanvasState or selectShapes. Resolve ids from CANVAS_STATE yourself.\n' +
      '4) If a target is ambiguous or missing, stop and return no tool calls.'
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
    } as any);
    if (import.meta.env.DEV) console.log('[planner] buildPlan raw (required)', res);
    calls = parseCalls(res);
  }

  // Heuristic fallback for relative move intents ("move the red square next to the blue circle")
  if (calls.length === 0 || isLikelyRelativeMove(prompt)) {
    try {
      const state = await loadCanvas();
      const rel = buildRelativeMoveFromPrompt(prompt, state || undefined);
      if (rel) calls = rel;
    } catch {}
  }

  const steps: PlanStep[] = calls.map((c, i) => ({ id: `${i + 1}`, status: 'pending', ...c }));
  // Guardrails: if prompt implies a singular pronoun and multiple tool calls target different ids, narrow to last-of-type
  if (impliesSingular(prompt) && steps.length > 1) {
    const typ = inferTypeFromPrompt(prompt);
    const lastId = typ ? recentMemory?.lastByType?.[typ]?.id : undefined;
    if (lastId) {
      const filtered = steps.filter((s) => (s.arguments as any)?.id === lastId);
      if (filtered.length > 0) return { steps: [{ ...filtered[0], id: '1' }] };
      const first = steps.find((s) => (s.name === 'moveShape' || s.name === 'resizeShape' || s.name === 'rotateShape'));
      if (first) return { steps: [{ id: '1', status: 'pending', name: first.name, arguments: { ...(first.arguments as any), id: lastId } }] as any };
    }
  }
  return { steps };
}

// -------- Relative move heuristics (minimal, deterministic) --------
const COLOR_ALIASES: Record<string, string> = {
  'light blue': 'blue',
  'sky blue': 'blue',
  'navy': 'blue',
  'magenta': 'magenta',
  'cyan': 'cyan',
  'purple': 'purple',
  'lime': 'lime',
  'brown': 'brown',
  'orange': 'orange',
  'pink': 'pink',
  'red': 'red',
  'green': 'green',
  'yellow': 'yellow',
  'blue': 'blue',
  'black': 'black',
  'white': 'white',
};

function normalizeColorWords(text: string): string[] {
  const lc = text.toLowerCase();
  const words = Object.keys(COLOR_ALIASES).filter((c) => lc.includes(c));
  // map to canonical names
  const out = words.map((w) => COLOR_ALIASES[w]);
  // de-dup
  return Array.from(new Set(out));
}

function detectTypes(text: string): string[] {
  const lc = text.toLowerCase();
  const types: string[] = [];
  if (/rectangle|rect|square/.test(lc)) types.push('rectangle');
  if (/circle/.test(lc)) types.push('circle');
  if (/text|label/.test(lc)) types.push('text');
  return types;
}

function isLikelyRelativeMove(text: string): boolean {
  const lc = text.toLowerCase();
  return /(next to|to the left of|left of|to the right of|right of|above|below|near)/.test(lc);
}

type AnyShape = { id: string; kind: 'rectangle' | 'circle' | 'text'; x: number; y: number; width: number; height: number; cx?: number; cy?: number; radius?: number; fill?: string; text?: string };

function flattenState(state?: any): AnyShape[] {
  if (!state) return [];
  const out: AnyShape[] = [];
  for (const r of state.rects || []) out.push({ id: r.id, kind: 'rectangle', x: r.x, y: r.y, width: r.width, height: r.height, fill: r.fill });
  for (const c of state.circles || []) out.push({ id: c.id, kind: 'circle', x: (c.cx ?? 0) - (c.radius ?? 0), y: (c.cy ?? 0) - (c.radius ?? 0), width: (c.radius ?? 0) * 2, height: (c.radius ?? 0) * 2, cx: c.cx, cy: c.cy, radius: c.radius, fill: c.fill });
  for (const t of state.texts || []) out.push({ id: t.id, kind: 'text', x: t.x, y: t.y, width: t.width, height: t.height, fill: t.fill, text: t.text });
  return out;
}

// find best match by type/color; now inlined where needed via candidate filtering and position scoring

function relationFromPrompt(text: string): 'right' | 'left' | 'above' | 'below' | 'near' | 'over' {
  const lc = text.toLowerCase();
  if (/on top of|on top/.test(lc)) return 'over';
  if (/to the left of|left of/.test(lc)) return 'left';
  if (/to the right of|right of|next to/.test(lc)) return 'right';
  if (/above/.test(lc)) return 'above';
  if (/below/.test(lc)) return 'below';
  if (/\bto\b/.test(lc)) return 'over';
  return 'near';
}

function computeMovePosition(subject: AnyShape, anchor: AnyShape, relation: 'right' | 'left' | 'above' | 'below' | 'near' | 'over'): { x: number; y: number } {
  const GAP = 10;
  const anchorCenterX = anchor.x + anchor.width / 2;
  const anchorCenterY = anchor.y + anchor.height / 2;
  let x = subject.x;
  let y = subject.y;
  switch (relation) {
    case 'over':
      x = anchorCenterX - subject.width / 2;
      y = anchorCenterY - subject.height / 2;
      break;
    case 'right':
      x = anchor.x + anchor.width + GAP;
      y = anchorCenterY - subject.height / 2;
      break;
    case 'left':
      x = anchor.x - subject.width - GAP;
      y = anchorCenterY - subject.height / 2;
      break;
    case 'above':
      x = anchorCenterX - subject.width / 2;
      y = anchor.y - subject.height - GAP;
      break;
    case 'below':
      x = anchorCenterX - subject.width / 2;
      y = anchor.y + anchor.height + GAP;
      break;
    case 'near':
    default:
      x = anchor.x + anchor.width + GAP;
      y = anchor.y;
  }
  // For circles, executor expects center coords; convert where needed
  if (subject.kind === 'circle') {
    return { x: x + subject.width / 2, y: y + subject.height / 2 };
  }
  return { x, y };
}

function buildRelativeMoveFromPrompt(prompt: string, state?: any): ToolCall[] | null {
  const shapes = flattenState(state);
  if (shapes.length === 0) return null;
  const colors = normalizeColorWords(prompt);
  const types = detectTypes(prompt);
  const lc = prompt.toLowerCase();
  // subject selection
  let subject: AnyShape | undefined;
  const subjectType = types[0];
  const subjectColor = colors[0];
  if (subjectType === 'text' && /longest/.test(lc)) {
    const texts = shapes.filter((s) => s.kind === 'text');
    subject = texts.sort((a, b) => (b.text?.length || 0) - (a.text?.length || 0))[0];
  }
  if (!subject) {
    // If multiple candidates exist, apply positional qualifier (top-left, bottom-right, etc.)
    const candidates = shapes.filter((s) => (!subjectType || s.kind === subjectType) && (!subjectColor || (s.fill || '').toLowerCase().includes(subjectColor)));
    if (candidates.length > 1) {
      const sorted = candidates.sort((a, b) => positionScore(a, lc) - positionScore(b, lc));
      subject = sorted[0];
    } else {
      subject = candidates[0];
    }
  }

  // anchor selection
  const anchorType = types[1] || types[0];
  const anchorColor = colors[1] || colors[0];
  let anchor: AnyShape | undefined;
  if (anchorType === 'rectangle' && /biggest|largest/.test(lc)) {
    const rects = shapes.filter((s) => s.kind === 'rectangle' && (!anchorColor || (s.fill || '').toLowerCase().includes(anchorColor)));
    anchor = rects.sort((a, b) => b.width * b.height - a.width * a.height)[0];
  }
  if (!anchor) {
    const candidates = shapes.filter((s) => (!anchorType || s.kind === anchorType) && (!anchorColor || (s.fill || '').toLowerCase().includes(anchorColor)));
    if (candidates.length > 1) {
      const sorted = candidates.sort((a, b) => positionScore(a, lc) - positionScore(b, lc));
      anchor = sorted[0];
    } else {
      anchor = candidates[0];
    }
  }
  if (!subject || !anchor || subject.id === anchor.id) return null;
  const relation = relationFromPrompt(prompt);
  const pos = computeMovePosition(subject, anchor, relation);
  return [{ name: 'moveShape' as any, arguments: { id: subject.id, x: pos.x, y: pos.y } }];
}

// Pre-parse grammar like "move <subject> (next to|left of|right of|above|below) <anchor>"
function preparseRelativeMove(prompt: string): { canonical: string } | null {
  const lc = prompt.toLowerCase().trim();
  const m = lc.match(/^(move|place|put)\s+(.+?)\s+(next to|to the left of|left of|to the right of|right of|above|below|to)\s+(.+)$/);
  if (!m) return null;
  const subject = m[2];
  const rel = m[3];
  const anchor = m[4];
  return { canonical: `move ${subject} ${rel} ${anchor}` };
}

function impliesSingular(text: string): boolean {
  return /\b(that|it|the\s+(rectangle|circle|text(box)?))\b/i.test(text);
}

function inferTypeFromPrompt(text: string): 'rectangle' | 'circle' | 'text' | undefined {
  const lc = text.toLowerCase();
  if (/rectangle|square|rect/.test(lc)) return 'rectangle';
  if (/circle/.test(lc)) return 'circle';
  if (/text|textbox|label/.test(lc)) return 'text';
  return undefined;
}

// Score shapes by how well they match positional qualifiers in the prompt.
function positionScore(s: AnyShape, lcPrompt: string): number {
  const centerX = s.x + s.width / 2;
  const centerY = s.y + s.height / 2;
  // Lower score is better
  if (/top-left/.test(lcPrompt)) return centerY * 100000 + centerX;
  if (/top-right/.test(lcPrompt)) return centerY * 100000 + (-centerX);
  if (/bottom-left/.test(lcPrompt)) return (-centerY) * 100000 + centerX;
  if (/bottom-right/.test(lcPrompt)) return (-centerY) * 100000 + (-centerX);
  if (/top\b/.test(lcPrompt)) return centerY;
  if (/bottom\b/.test(lcPrompt)) return -centerY;
  if (/left\b/.test(lcPrompt)) return centerX;
  if (/right\b/.test(lcPrompt)) return -centerX;
  return 0; // no preference
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
