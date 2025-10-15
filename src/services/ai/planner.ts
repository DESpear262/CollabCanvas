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
  const tools = toolSpecs.map((t) => ({
    type: 'function',
    function: { name: t.name, description: t.description, parameters: t.parameters },
  }));
  const res = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    messages: [
      { role: 'system', content: 'You are a planner that outputs a sequence of function calls to manipulate a canvas.' },
      { role: 'user', content: `Plan the steps for: ${prompt}` },
    ],
    tools: tools as any,
    temperature: 0.2,
  } as any);

  if (import.meta.env.DEV) console.log('[planner] buildPlan raw', res);
  // Extract tool calls (flatten), fallback to empty plan
  const calls: ToolCall[] = [];
  const choice: any = res.choices?.[0];
  const toolCalls: any[] = choice?.message?.tool_calls || [];
  for (const c of toolCalls) {
    if (c?.function?.name) {
      try {
        const args = c.function.arguments ? JSON.parse(c.function.arguments) : {};
        calls.push({ name: c.function.name, arguments: args });
      } catch {
        // ignore malformed
      }
    }
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
