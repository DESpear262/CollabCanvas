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
  // Expose only actionable tools (state is already injected; selection is deprecated)
  const allowedToolSpecs = toolSpecs.filter((t) => t.name !== 'getCanvasState' && t.name !== 'selectShapes');
  const tools = allowedToolSpecs.map((t) => ({
    type: 'function',
    function: { name: t.name, description: t.description, parameters: t.parameters },
  }));
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

  const steps: PlanStep[] = calls.map((c, i) => ({ id: `${i + 1}`, status: 'pending', ...c }));
  return { steps };
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
