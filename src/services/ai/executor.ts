/*
  File: src/services/ai/executor.ts
  Overview: Maps tool calls from the LLM to canvas operations (stubs for now).
  Notes:
    - Implementation will integrate with hooks/services in PR #13.
*/

import type { ToolName } from './tools';
import { validateParams } from './tools';
import { upsertRect, upsertCircle, upsertText, deleteRect, deleteCircle, deleteText, loadCanvas } from '../canvas';
import type { RectData, CircleData, TextData } from '../canvas';
import { generateId } from '../../utils/helpers';

export type ToolCall = {
  name: ToolName;
  arguments: Record<string, unknown>;
};

export type ExecutionResult = { ok: true; data?: unknown } | { ok: false; error: string };

/** Execute a single tool call (stub). */
export async function execute(call: ToolCall): Promise<ExecutionResult> {
  const { name, arguments: args } = call;
  const valid = validateParams(name, args);
  if (!valid.ok) return { ok: false, error: valid.error };

  try {
    if (name === 'createShape') {
      const { type, x, y, width, height, color } = args as any;
      const id = generateId(type);
      if (type === 'rectangle') {
        const rect: RectData = { id, x, y, width, height, fill: color };
        await upsertRect(rect);
        return { ok: true, data: { id } };
      }
      if (type === 'circle') {
        const size = Math.max(width, height);
        const circle: CircleData = { id, cx: x + size / 2, cy: y + size / 2, radius: size / 2, fill: color };
        await upsertCircle(circle);
        return { ok: true, data: { id } };
      }
      return { ok: false, error: 'Unsupported shape type' };
    }

    if (name === 'createText') {
      const { text, x, y, color } = args as any;
      const id = generateId('text');
      const node: TextData = { id, x, y, width: 160, height: 26, text, fill: color };
      await upsertText(node);
      return { ok: true, data: { id } };
    }

    if (name === 'moveShape') {
      const { id, x, y } = args as any;
      // Try as rect → circle → text
      await upsertRect({ id, x, y, width: 0 as any, height: 0 as any, fill: '' as any } as RectData).catch(() => Promise.resolve());
      await upsertCircle({ id, cx: x, cy: y, radius: 0 as any, fill: '' as any } as CircleData).catch(() => Promise.resolve());
      await upsertText({ id, x, y, width: 0 as any, height: 0 as any, text: '' as any, fill: '' as any } as TextData).catch(() => Promise.resolve());
      return { ok: true };
    }

    if (name === 'resizeShape') {
      const { id, width, height } = args as any;
      await upsertRect({ id, x: 0 as any, y: 0 as any, width, height, fill: '' as any } as RectData).catch(() => Promise.resolve());
      const size = Math.max(width, height);
      await upsertCircle({ id, cx: 0 as any, cy: 0 as any, radius: size / 2, fill: '' as any } as CircleData).catch(() => Promise.resolve());
      await upsertText({ id, x: 0 as any, y: 0 as any, width, height, text: '' as any, fill: '' as any } as TextData).catch(() => Promise.resolve());
      return { ok: true };
    }

    if (name === 'deleteShape') {
      const { id } = args as any;
      await deleteRect(id).catch(() => Promise.resolve());
      await deleteCircle(id).catch(() => Promise.resolve());
      await deleteText(id).catch(() => Promise.resolve());
      return { ok: true };
    }

    if (name === 'getCanvasState') {
      const state = await loadCanvas();
      return { ok: true, data: state };
    }

    if (name === 'selectShapes') {
      const { type, color } = args as any;
      const state = await loadCanvas();
      if (!state) return { ok: true, data: [] };
      const results: string[] = [];
      if (!type || type === 'rectangle' || type === 'any') {
        for (const r of state.rects) if (!color || r.fill === color) results.push(r.id);
      }
      if (!type || type === 'circle' || type === 'any') {
        for (const c of state.circles) if (!color || c.fill === color) results.push(c.id);
      }
      if (type === 'text' || type === 'any') {
        for (const t of state.texts) if (!color || t.fill === color) results.push(t.id);
      }
      return { ok: true, data: results };
    }

    return { ok: false, error: 'Unsupported tool' };
  } catch (e: any) {
    return { ok: false, error: e?.message || 'Execution failed' };
  }
}

/** Execute multiple tool calls sequentially (stub). */
export async function executeSequence(calls: ToolCall[]): Promise<ExecutionResult[]> {
  const results: ExecutionResult[] = [];
  for (const c of calls) {
    // eslint-disable-next-line no-await-in-loop
    results.push(await execute(c));
  }
  return results;
}
