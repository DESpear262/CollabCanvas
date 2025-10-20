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
type BriefRect = { id: string; kind: 'rectangle'; x: number; y: number; w: number; h: number; fill?: string; z: number; colorName?: string; area?: number; centerX?: number; centerY?: number };
type BriefCircle = { id: string; kind: 'circle'; cx: number; cy: number; r: number; fill?: string; z: number; colorName?: string; area?: number; centerX?: number; centerY?: number };
type BriefText = { id: string; kind: 'text'; x: number; y: number; w: number; h: number; fill?: string; text?: string; z: number; colorName?: string };
type BriefShape = BriefRect | BriefCircle | BriefText;

function toBrief(state: any, limit = 80, emphasizeIds?: string[] | null): { shapes: BriefShape[] } {
  const rnd = (n: number) => Math.round(n);
  const trunc = (s: string, n = 60) => (s && s.length > n ? s.slice(0, n) : s);
  function toRgb(hex?: string): { r: number; g: number; b: number } | null {
    if (!hex || typeof hex !== 'string') return null;
    const m = hex.trim().match(/^#?([0-9a-f]{6})$/i);
    if (!m) return null;
    const v = m[1];
    const r = parseInt(v.slice(0, 2), 16);
    const g = parseInt(v.slice(2, 4), 16);
    const b = parseInt(v.slice(4, 6), 16);
    return { r, g, b };
  }
  const palette: { name: string; rgb: [number, number, number] }[] = [
    { name: 'red', rgb: [220, 38, 38] },
    { name: 'orange', rgb: [249, 115, 22] },
    { name: 'yellow', rgb: [234, 179, 8] },
    { name: 'green', rgb: [34, 197, 94] },
    { name: 'blue', rgb: [59, 130, 246] },
    { name: 'purple', rgb: [147, 51, 234] },
    { name: 'pink', rgb: [236, 72, 153] },
    { name: 'cyan', rgb: [6, 182, 212] },
    { name: 'magenta', rgb: [217, 70, 239] },
    { name: 'brown', rgb: [120, 72, 48] },
    { name: 'black', rgb: [24, 24, 27] },
    { name: 'white', rgb: [245, 245, 244] },
    { name: 'gray', rgb: [107, 114, 128] },
  ];
  function nearestColorName(hex?: string): string | undefined {
    const c = toRgb(hex);
    if (!c) return undefined;
    let best: string | undefined;
    let bestD = Number.POSITIVE_INFINITY;
    for (const p of palette) {
      const dr = c.r - p.rgb[0];
      const dg = c.g - p.rgb[1];
      const db = c.b - p.rgb[2];
      const d = dr * dr + dg * dg + db * db;
      if (d < bestD) { bestD = d; best = p.name; }
    }
    return best;
  }
  const rects: BriefRect[] = (state?.rects || []).map((r: any) => ({
    id: r.id,
    kind: 'rectangle',
    x: rnd(r.x),
    y: rnd(r.y),
    w: rnd(r.width),
    h: rnd(r.height),
    fill: r.fill,
    z: (r?.z as number) ?? 0,
    colorName: nearestColorName(r.fill),
    area: Math.max(0, (r.width || 0) * (r.height || 0)),
    centerX: rnd(r.x + (r.width || 0) / 2),
    centerY: rnd(r.y + (r.height || 0) / 2),
  }));
  const circles: BriefCircle[] = (state?.circles || []).map((c: any) => ({
    id: c.id,
    kind: 'circle',
    cx: rnd(c.cx),
    cy: rnd(c.cy),
    r: rnd(c.radius),
    fill: c.fill,
    z: (c?.z as number) ?? 0,
    colorName: nearestColorName(c.fill),
    area: Math.PI * Math.pow(c.radius || 0, 2),
    centerX: rnd(c.cx),
    centerY: rnd(c.cy),
  }));
  const texts: BriefText[] = (state?.texts || []).map((t: any) => ({
    id: t.id,
    kind: 'text',
    x: rnd(t.x),
    y: rnd(t.y),
    w: rnd(t.width),
    h: rnd(t.height ?? 24),
    fill: t.fill,
    text: trunc(t.text || ''),
    z: (t?.z as number) ?? 0,
    colorName: nearestColorName(t.fill),
  }));
  let shapes: BriefShape[] = [...rects, ...circles, ...texts].sort((a: any, b: any) => (a.z ?? 0) - (b.z ?? 0));
  if (Array.isArray(emphasizeIds) && emphasizeIds.length > 0) {
    const emph = new Set(emphasizeIds);
    const selectedFirst: BriefShape[] = [];
    const rest: BriefShape[] = [];
    for (const s of shapes) {
      if (emph.has(s.id)) selectedFirst.push(s); else rest.push(s);
    }
    // Keep order within groups stable
    shapes = [...selectedFirst, ...rest];
  }
  shapes = shapes.slice(0, limit);
  return { shapes };
}

export type RouteContext = {
  freezeAction?: 'move' | 'resize' | 'rotate' | 'delete' | 'recolor';
  selection?: { ids: string[]; idToKind: Record<string, 'rect' | 'circle' | 'text'> };
};

export type RouteResult =
  | { kind: 'chat'; message: string }
  | { kind: 'plan'; plan: Plan };

export type StepStatus = 'pending' | 'running' | 'succeeded' | 'failed';

export type PlanStep = ToolCall & { id: string; status: StepStatus };

export type Plan = {
  steps: PlanStep[];
};

/** Detect if a prompt requires multi-step execution (heuristic). */
export type Classification = { kind: 'simple' | 'complex' | 'chat' | 'ambiguous'; message?: string };

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
    'TOOLS (single-step): createShape(rectangle|circle), createText, moveShape, resizeShape, deleteShape, rotateShape, recolorShape.\n' +
    'CLASSIFY the user prompt into EXACTLY ONE of:\n' +
    '- simple  (one tool call suffices)\n' +
    '- complex (requires multiple steps/planning)\n' +
    '- chat: <freeform reply> (not an actionable canvas command).\n' +
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
    // Fallback: heuristic
    const heuristic = /login form|grid|row|column|toolbar|menu|list of|create \d+|in a row|in a column/i.test(prompt) ? 'complex' : 'simple';
    result = { kind: heuristic } as Classification;
  }
  // Defer detailed logging to router/buildPlan where tool call count is known
  return result;
}

// Removed needsPlanning per user directive; rely on router. If the LLM fails,
// we will ask it for an explanation and a better prompt in the router path.

// Ambiguity handling removed per new rules (no questioning).

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
  // LLM ambiguity is handled in router; buildPlan assumes prompt is actionable
  // Expose only actionable tools (state is already injected; selection is deprecated)
  const allowedToolSpecs = toolSpecs.filter((t) => t.name !== 'getCanvasState' && t.name !== 'selectShapes');
  const tools = allowedToolSpecs.map((t) => ({
    type: 'function',
    function: { name: t.name, description: t.description, parameters: t.parameters },
  }));
  // Deterministic grid creation pre-parse (handles NxM grids and row/column phrasing)
  const grid = preparseGrid(prompt);
  if (grid) {
    return { steps: [{ id: '1', status: 'pending', name: 'createGrid' as any, arguments: grid }] };
  }
  // Pre-parse deterministic relative move commands to avoid LLM role reversal
  const pre = preparseRelativeMove(prompt);
  if (pre) {
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
      '4) If a target is ambiguous or missing, stop and return no tool calls.\n' +
      '5) Use RECENT_MEMORY to resolve pronouns like "it/that/the <type>" (e.g., lastByType).'
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

  // No heuristic fallback here; the planner should either emit tool calls directly
  // or ask for clarification via the router path.

  const steps: PlanStep[] = calls.map((c, i) => ({ id: `${i + 1}`, status: 'pending', ...c }));
  // Removed singular-pronoun narrowing; disambiguation handled by LLM + clarification flow.
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
export async function routeAndPlanWithContext(prompt: string, ctx: RouteContext = {}): Promise<RouteResult> {
  const openai = getOpenAI();

  // Load once; reuse
  let state: any = null;
  try { state = await loadCanvas(); } catch {}
  // Emphasize selected ids (from ctx or parsed from prompt) at the top of the brief to steer the LLM
  let selectionFromPrompt: { ids: string[]; idToKind: Record<string, 'rect' | 'circle' | 'text'> } | null = null;
  try {
    const m0 = prompt.match(/SELECTION_STATE:\s*(\{[\s\S]*\})/);
    if (m0 && m0[1]) {
      const obj = JSON.parse(m0[1]);
      const ids = Array.isArray(obj?.ids) ? obj.ids : [];
      const idToKind = typeof obj?.idToKind === 'object' && obj?.idToKind ? obj.idToKind : {};
      selectionFromPrompt = { ids, idToKind } as any;
    }
  } catch {}
  const selForBrief = (selectionFromPrompt || ctx.selection)?.ids || [];
  const canvasBrief = JSON.stringify(toBrief(state || {}, 80, selForBrief));
  try {
    const brief = JSON.parse(canvasBrief) as any;
    console.log('[router] canvasBrief shapes', Array.isArray(brief?.shapes) ? brief.shapes.length : 0);
  } catch (e) {
    console.log('[router] failed to parse canvasBrief');
  }

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

  // selectionFromPrompt is computed above (for brief ordering) and reused here
  console.log('[router] ctx.freezeAction', ctx.freezeAction);
  console.log('[router] selection (ctx)', ctx.selection);
  console.log('[router] selection (from prompt)', selectionFromPrompt);
  console.log('[router] prompt', prompt);

  const allowedToolSpecs = toolSpecs.filter((t) => t.name !== 'getCanvasState' && t.name !== 'selectShapes');
  const tools = allowedToolSpecs.map((t) => ({ type: 'function', function: { name: t.name, description: t.description, parameters: t.parameters } }));

  const messages = [
    { role: 'system', content:
      (
        'You are a planner for a Figma-like canvas. Use CANVAS_STATE and SELECTION_STATE.\n' +
        '- CREATION TASKS: For createShape/createText/createGrid (and similar creation), ALWAYS emit the creation tool calls immediately regardless of selection or ambiguity. Do not defer or ask questions.\n' +
        '- If selection exists, RESTRICT all actions to the selected ids only.\n' +
        '- FILTER strictly by ALL constraints in the instruction (shape/kind, color names, size qualifiers like largest/smallest, text content, ABSOLUTE POSITION like top-left/top-right/bottom-left/bottom-right, and RELATIVE RELATIONS like next to/left of/right of/above/below). Do NOT broaden.\n' +
        '- Size qualifiers apply RELATIVELY within the already filtered subset (e.g., "largest red square" means the largest among red squares).\n' +
        '- If a COLOR is specified, ONLY affect items whose fill maps to that color family by common name; do NOT modify differently-colored items.\n' +
        '- If an ANCHOR is referenced for a relation, resolve it from CANVAS_STATE/SELECTION_STATE and apply the relation strictly.\n' +
        '- Example: "rotate a gray rectangle 45 degrees" with a selection of [red rectangle, gray rectangle, blue circle] MUST rotate ONLY the gray rectangle.\n' +
        '- If selection is empty and the instruction uniquely identifies EXACTLY ONE candidate across the whole canvas, act on it.\n' +
        '- If the instruction targets 0 or >=2 candidates AND selection is empty, DO NOT plan. Reply with: "Please select the target(s) and repeat the request.".\n' +
        '- If selection exists, APPLY the instruction to ALL selected items that match ALL constraints; ignore non-matching selected items.\n' +
        '- If, after applying ALL constraints (including selection), there are ZERO matching objects, reply with a concise message indicating no matching objects were found for the instruction. Do NOT ask questions.\n' +
        '- Do not ask questions. Never output hex codes or low-level details to users.\n' +
        '- SELECTION_STATE may be included in the user message; if present, use it.\n' +
        '- You may call helper tools like preparseGrid, preparseRelativeMove, buildRelativeMoveFromPrompt when useful.\n' +
        '- Synonyms: treat "square" as "rectangle" when matching kinds.\n' +
        '- IMPORTANT: When rotating, emit rotateShape with numeric rotation (degrees) and a concrete id.'
      ) + (ctx.freezeAction ? ` Intention: ${ctx.freezeAction}. Do NOT change this action.` : '')
    },
    { role: 'user', content: `CANVAS_STATE: ${canvasBrief || '{}'}` },
    { role: 'user', content: `SELECTION_STATE: ${JSON.stringify(selectionFromPrompt || ctx.selection || { ids: [], idToKind: {} })}` },
    { role: 'user', content: `RECENT_MEMORY: ${JSON.stringify(recentMemory || {})}` },
    { role: 'user', content: `Handle this: ${prompt}. If parsing fails, do not guess - return no tool calls.` },
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
  console.log('[router] raw content', content);
  try { console.log('[router] tool_calls', tcs.map((c: any) => ({ name: c?.function?.name, args: c?.function?.arguments })) ); } catch {}

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
    console.log('[router] parsed calls', calls.map((c) => ({ name: c.name, args: c.arguments })));

    // Normalize tool names/args to our schema (LLM may emit aliases)
    const normalizeCall = (c: ToolCall): ToolCall => {
      const name = String(c.name || '').trim();
      const a = { ...(c.arguments || {}) } as any;
      const lower = name.toLowerCase();
      // Name aliases
      let normName: string = name;
      if (lower === 'rotate' || lower === 'rotateshape' || lower === 'setrotation') normName = 'rotateShape';
      if (lower === 'move' || lower === 'moveshapeabsolute') normName = 'moveShape';
      if (lower === 'resize' || lower === 'resizeshape') normName = 'resizeShape';
      if (lower === 'recolor' || lower === 'setcolor' || lower === 'setfill' || lower === 'recolorshape') normName = 'recolorShape';
      // Arg key aliases
      if (normName === 'rotateShape') {
        if (typeof a.rotation !== 'number' && typeof a.angle === 'number') a.rotation = a.angle;
        if (typeof a.rotation === 'string') {
          const m = a.rotation.match?.(/\d+/);
          if (m) a.rotation = parseInt(m[0], 10);
        }
      }
      if (normName === 'moveShape') {
        if (typeof a.x === 'string') a.x = Number(a.x);
        if (typeof a.y === 'string') a.y = Number(a.y);
      }
      if (normName === 'resizeShape') {
        if (typeof a.width === 'string') a.width = Number(a.width);
        if (typeof a.height === 'string') a.height = Number(a.height);
      }
      if (normName === 'recolorShape') {
        if (typeof a.color === 'string') a.color = a.color.trim();
        if (!a.color && typeof a.fill === 'string') a.color = a.fill.trim();
      }
      return { name: normName as any, arguments: a };
    };
    const normalized = calls.map(normalizeCall);
    console.log('[router] normalized calls', normalized.map((c) => ({ name: c.name, args: c.arguments })));
    // Post-filter: if selection exists, restrict id-based actions to selected ids only
    let filtered = normalized;
    const sel = selectionFromPrompt || ctx.selection;
    if (sel && Array.isArray(sel.ids) && sel.ids.length > 0) {
      const selSet = new Set(sel.ids);
      filtered = normalized.filter((c) => {
        const nm = c.name as string;
        const argId = (c.arguments as any)?.id as string | undefined;
        // Only filter tools that operate on a single target id
        if (argId && ['moveShape','resizeShape','rotateShape','recolorShape','deleteShape'].includes(nm)) {
          return selSet.has(argId);
        }
        return true;
      });
      console.log('[router] selection ids', sel.ids);
      console.log('[router] calls after selection filter', filtered.map((c) => ({ name: c.name, id: (c.arguments as any)?.id })));
      if (filtered.length === 0) {
        console.log('[router] no matches after selection filter');
        return { kind: 'chat', message: 'No matching selected objects were found for this instruction.' };
      }
    }
    const steps: PlanStep[] = filtered.map((c, i) => ({ id: `${i + 1}`, status: 'pending', ...c }));
    console.log('[router] planning steps', steps.map((s) => ({ id: s.id, name: s.name })));
    return { kind: 'plan', plan: { steps } };
  }

  if (content) {
    return { kind: 'chat', message: content };
  }

  // No tool calls returned: decide message based on selection presence
  const sel = selectionFromPrompt || ctx.selection;
  if (!sel || !Array.isArray(sel.ids) || sel.ids.length === 0) {
    console.log('[router] no selection and no tool calls — asking for selection');
    return { kind: 'chat', message: 'Please select the target(s) and repeat the request.' };
  }
  console.log('[router] selection exists but no tool calls — no matches');
  return { kind: 'chat', message: 'No matching selected objects were found for this instruction.' };
}

export async function routeAndPlan(prompt: string): Promise<RouteResult> {
  return routeAndPlanWithContext(prompt, {});
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

// removed isLikelyRelativeMove (no longer used)

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

// removed impliesSingular (no longer used)

// removed inferTypeFromPrompt (no longer used)

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

// -------- Grid pre-parser (deterministic) --------
function preparseGrid(prompt: string): null | {
  shape: 'rectangle' | 'circle';
  rows: number;
  cols: number;
  count?: number;
  x: number;
  y: number;
  cellWidth: number;
  cellHeight: number;
  gapX: number;
  gapY: number;
  colors?: string[];
} {
  const lc = prompt.toLowerCase();

  const detectShape = (): 'rectangle' | 'circle' => {
    if (/circle/.test(lc)) return 'circle';
    if (/square|rect|rectangle/.test(lc)) return 'rectangle';
    return 'rectangle';
  };

  // Defaults; could be tuned or read from constants
  const x = 64, y = 64, cellWidth = 32, cellHeight = 32, gapX = 8, gapY = 8;
  const shape = detectShape();

  // Palette if the user asks for various/different colors
  const wantsVaried = /(various|different|many|random|rainbow) colors?/.test(lc) || /colorful/.test(lc);
  const palette = wantsVaried ? ['#ef4444','#f59e0b','#eab308','#22c55e','#06b6d4','#3b82f6','#8b5cf6','#ec4899'] : undefined;

  // Case 1: explicit NxM grid (e.g., 4x6 grid, 4 by 6 grid, 4 * 6 grid)
  const mGrid = lc.match(/(\d+)\s*(x|by|\*)\s*(\d+)\s*grid/);
  // Optional count override: "make 24 squares in a 4x6 grid"
  const mCount = lc.match(/(?:make|create|add)\s+(\d+)\s+(?:square|squares|rectangle|rectangles|circle|circles)/);
  if (mGrid) {
    const rows = parseInt(mGrid[1], 10);
    const cols = parseInt(mGrid[3], 10);
    const count = mCount ? parseInt(mCount[1], 10) : undefined;
    if (rows >= 1 && cols >= 1) return { shape, rows, cols, count, x, y, cellWidth, cellHeight, gapX, gapY, colors: palette };
  }

  // Case 2: row/column phrasing: "30 circles in a row", "in a column", "row of 30 ...", "column of 30 ..."
  const mRowCountA = lc.match(/(\d+)\s+(?:square|squares|rectangle|rectangles|circle|circles)\s+in\s+a\s+row/);
  const mColCountA = lc.match(/(\d+)\s+(?:square|squares|rectangle|rectangles|circle|circles)\s+in\s+a\s+column/);
  const mRowCountB = lc.match(/row\s+of\s+(\d+)\s+(?:square|squares|rectangle|rectangles|circle|circles)/);
  const mColCountB = lc.match(/column\s+of\s+(\d+)\s+(?:square|squares|rectangle|rectangles|circle|circles)/);
  const rowCount = mRowCountA ? parseInt(mRowCountA[1], 10) : (mRowCountB ? parseInt(mRowCountB[1], 10) : undefined);
  const colCount = mColCountA ? parseInt(mColCountA[1], 10) : (mColCountB ? parseInt(mColCountB[1], 10) : undefined);
  if (rowCount && rowCount >= 1) {
    return { shape, rows: 1, cols: rowCount, count: rowCount, x, y, cellWidth, cellHeight, gapX, gapY, colors: palette };
  }
  if (colCount && colCount >= 1) {
    return { shape, rows: colCount, cols: 1, count: colCount, x, y, cellWidth, cellHeight, gapX, gapY, colors: palette };
  }

  // Case 3: only a total count specified; choose near-square grid
  const mOnlyCount = lc.match(/(?:make|create|add)\s+(\d+)\s+(?:square|squares|rectangle|rectangles|circle|circles)/);
  if (mOnlyCount) {
    const n = parseInt(mOnlyCount[1], 10);
    if (n >= 1) {
      const cols = Math.max(1, Math.ceil(Math.sqrt(n)));
      const rows = Math.max(1, Math.ceil(n / cols));
      return { shape, rows, cols, count: n, x, y, cellWidth, cellHeight, gapX, gapY, colors: palette };
    }
  }

  // Case 4: explicit "Nx1 grid" or "1xN grid" without the word grid (rare); keep conservative
  const mNxM = lc.match(/\b(\d+)\s*(x|by|\*)\s*(\d+)\b/);
  if (mNxM && /row|column/.test(lc)) {
    const rows = parseInt(mNxM[1], 10);
    const cols = parseInt(mNxM[3], 10);
    if (rows >= 1 && cols >= 1) return { shape, rows, cols, x, y, cellWidth, cellHeight, gapX, gapY, colors: palette };
  }

  return null;
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
