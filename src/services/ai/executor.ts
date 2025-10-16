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
        const rect: RectData = { id, x, y, width, height, fill: color, rotation: 0, z: 0 };
        await upsertRect(rect);
        return { ok: true, data: { id } };
      }
      if (type === 'circle') {
        const size = Math.max(width, height);
        const circle: CircleData = { id, cx: x + size / 2, cy: y + size / 2, radius: size / 2, fill: color, z: 0 };
        await upsertCircle(circle);
        return { ok: true, data: { id } };
      }
      return { ok: false, error: 'Unsupported shape type' };
    }

    if (name === 'createText') {
      const { text, x, y, color } = args as any;
      const id = generateId('text');
      const node: TextData = { id, x, y, width: 160, height: 26, text, fill: color, rotation: 0, z: 0 };
      await upsertText(node);
      return { ok: true, data: { id } };
    }

    if (name === 'moveShape') {
      const { id, x, y } = args as any;
      const state = await loadCanvas();
      if (!state) return { ok: false, error: 'Canvas not loaded' };
      const rect = state.rects.find((r) => r.id === id);
      if (rect) {
        const next: RectData = { id: rect.id, x, y, width: rect.width, height: rect.height, fill: rect.fill, rotation: rect.rotation ?? 0, z: rect.z ?? 0 };
        await upsertRect(next);
        return { ok: true };
      }
      const circle = state.circles.find((c) => c.id === id);
      if (circle) {
        const next: CircleData = { id: circle.id, cx: x, cy: y, radius: circle.radius, fill: circle.fill, z: circle.z ?? 0 };
        await upsertCircle(next);
        return { ok: true };
      }
      const text = state.texts.find((t) => t.id === id);
      if (text) {
        const next: TextData = { id: text.id, x, y, width: text.width, height: text.height, text: text.text, fill: text.fill, rotation: text.rotation ?? 0, z: text.z ?? 0 };
        await upsertText(next);
        return { ok: true };
      }
      return { ok: false, error: 'Shape not found' };
    }

    if (name === 'resizeShape') {
      const { id, width, height } = args as any;
      const state = await loadCanvas();
      if (!state) return { ok: false, error: 'Canvas not loaded' };
      const rect = state.rects.find((r) => r.id === id);
      if (rect) {
        const next: RectData = { id: rect.id, x: rect.x, y: rect.y, width, height, fill: rect.fill, rotation: rect.rotation ?? 0, z: rect.z ?? 0 };
        await upsertRect(next);
        return { ok: true };
      }
      const circle = state.circles.find((c) => c.id === id);
      if (circle) {
        const size = Math.max(width, height);
        const next: CircleData = { id: circle.id, cx: circle.cx, cy: circle.cy, radius: size / 2, fill: circle.fill, z: circle.z ?? 0 };
        await upsertCircle(next);
        return { ok: true };
      }
      const text = state.texts.find((t) => t.id === id);
      if (text) {
        const next: TextData = { id: text.id, x: text.x, y: text.y, width, height, text: text.text, fill: text.fill, rotation: text.rotation ?? 0, z: text.z ?? 0 };
        await upsertText(next);
        return { ok: true };
      }
      return { ok: false, error: 'Shape not found' };
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

    if (name === 'rotateShape') {
      const { id, rotation } = args as any;
      const state = await loadCanvas();
      if (!state) return { ok: false, error: 'Canvas not loaded' };
      const rect = state.rects.find((r) => r.id === id);
      if (rect) {
        const next: RectData = { ...rect, rotation: typeof rotation === 'number' ? rotation : (rect.rotation ?? 0) };
        await upsertRect(next);
        return { ok: true };
      }
      const text = state.texts.find((t) => t.id === id);
      if (text) {
        const next: TextData = { ...text, rotation: typeof rotation === 'number' ? rotation : (text.rotation ?? 0) };
        await upsertText(next);
        return { ok: true };
      }
      return { ok: false, error: 'Shape not rotatable or not found' };
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
