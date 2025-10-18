/*
  File: toolHandlers.ts
  Overview: Small, single-purpose handlers for each AI tool call. Keeps `execute` thin and testable.
*/

import type { RectData, CircleData, TextData } from '../canvas';
import { upsertRect, upsertCircle, upsertText, deleteRect, deleteCircle, deleteText, loadCanvas } from '../canvas';

/** Create a rectangle or circle. Returns created id. */
export async function handleCreateShape(args: any, genId: (prefix: string) => string) {
  const { type, x, y, width, height, color } = args as any;
  const id = genId(type);
  if (type === 'rectangle') {
    const rect: RectData = { id, x, y, width, height, fill: color, rotation: 0, z: 0 };
    await upsertRect(rect);
    return { id };
  }
  if (type === 'circle') {
    const size = Math.max(width, height);
    const circle: CircleData = { id, cx: x + size / 2, cy: y + size / 2, radius: size / 2, fill: color, z: 0 };
    await upsertCircle(circle);
    return { id };
  }
  throw new Error('Unsupported shape type');
}

/** Create a text node. Returns created id. */
export async function handleCreateText(args: any, genId: (prefix: string) => string) {
  const { text, x, y, color } = args as any;
  const id = genId('text');
  const node: TextData = { id, x, y, width: 160, height: 26, text, fill: color, rotation: 0, z: 0 };
  await upsertText(node);
  return { id };
}

/** Move shape to absolute position. */
export async function handleMoveShape(args: any) {
  const { id, x, y } = args as any;
  await transformShape(id, {
    rect: (r) => ({ ...r, x, y }),
    circle: (c) => ({ ...c, cx: x, cy: y }),
    text: (t) => ({ ...t, x, y }),
  });
}

/** Resize shape by absolute width/height. Circles preserve 1:1. */
export async function handleResizeShape(args: any) {
  const { id, width, height } = args as any;
  await transformShape(id, {
    rect: (r) => ({ ...r, width, height }),
    circle: (c) => ({ ...c, radius: Math.max(width, height) / 2 }),
    text: (t) => ({ ...t, width, height }),
  });
}

/** Delete all variants by id (no-op if not found). */
export async function handleDeleteShape(args: any) {
  const { id } = args as any;
  await deleteRect(id).catch(() => Promise.resolve());
  await deleteCircle(id).catch(() => Promise.resolve());
  await deleteText(id).catch(() => Promise.resolve());
}

/** Return ids of shapes matching basic filters. */
export async function handleSelectShapes(args: any): Promise<string[]> {
  const { type, color } = args as any;
  const state = await loadCanvas();
  if (!state) return [];
  const results: string[] = [];
  if (!type || type === 'rectangle' || type === 'any') for (const r of state.rects) if (!color || r.fill === color) results.push(r.id);
  if (!type || type === 'circle' || type === 'any') for (const c of state.circles) if (!color || c.fill === color) results.push(c.id);
  if (type === 'text' || type === 'any') for (const t of state.texts) if (!color || t.fill === color) results.push(t.id);
  return results;
}

/** Rotate supported shapes (rect/text). */
export async function handleRotateShape(args: any) {
  const { id, rotation } = args as any;
  await transformShape(id, {
    rect: (r) => ({ ...r, rotation: typeof rotation === 'number' ? rotation : (r.rotation ?? 0) }),
    text: (t) => ({ ...t, rotation: typeof rotation === 'number' ? rotation : (t.rotation ?? 0) }),
  });
}

/** Recolor any shape variant by id. */
export async function handleRecolorShape(args: any) {
  const { id, color } = args as any;
  if (!color || typeof color !== 'string') throw new Error('Invalid color');
  await transformShape(id, {
    rect: (r) => ({ ...r, fill: color }),
    circle: (c) => ({ ...c, fill: color }),
    text: (t) => ({ ...t, fill: color }),
  });
}

/** Transform function type for shape modifications. */
type ShapeTransform<T> = (shape: T) => T;

/** Generic shape transformation that finds and updates a shape by id. */
async function transformShape(
  id: string,
  transformers: {
    rect?: ShapeTransform<RectData>;
    circle?: ShapeTransform<CircleData>;
    text?: ShapeTransform<TextData>;
  }
): Promise<void> {
  const state = await loadCanvas();
  if (!state) throw new Error('Canvas not loaded');

  const rect = state.rects.find((r) => r.id === id);
  if (rect && transformers.rect) {
    const next = transformers.rect(rect);
    await upsertRect(next);
    return;
  }

  const circle = state.circles.find((c) => c.id === id);
  if (circle && transformers.circle) {
    const next = transformers.circle(circle);
    await upsertCircle(next);
    return;
  }

  const text = state.texts.find((t) => t.id === id);
  if (text && transformers.text) {
    const next = transformers.text(text);
    await upsertText(next);
    return;
  }

  throw new Error('Shape not found');
}


