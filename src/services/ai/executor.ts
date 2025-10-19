/*
  File: src/services/ai/executor.ts
  Overview: Maps tool calls from the LLM to canvas operations (stubs for now).
  Notes:
    - Implementation will integrate with hooks/services in PR #13.
*/

import type { ToolName } from './tools';
import { validateParams } from './tools';
import { loadCanvas } from '../canvas';
import { db } from '../firebase';
import { doc, setDoc, serverTimestamp } from 'firebase/firestore';
import { auth } from '../firebase';
import { generateId } from '../../utils/helpers';
import { handleCreateShape, handleCreateText, handleMoveShape, handleResizeShape, handleDeleteShape, handleSelectShapes, handleRotateShape, handleRecolorShape, handleCreateGrid } from './toolHandlers';
import { DEFAULT_RECT_WIDTH, DEFAULT_RECT_HEIGHT, DEFAULT_RECT_FILL } from '../../utils/constants';

export type ToolCall = {
  name: ToolName;
  arguments: Record<string, unknown>;
};

export type ExecutionResult = { ok: true; data?: unknown } | { ok: false; error: string };
async function logAiEvent(kind: string, payload: Record<string, unknown> & { id?: string; type?: string }) {
  try {
    const uid = auth.currentUser?.uid;
    if (!uid) return;
    const ref = doc(db, 'users', uid, 'aiMemory', 'recent');
    const entry = { kind, payload, at: serverTimestamp() } as any;
    await setDoc(ref, { last: entry, history: { [Date.now()]: entry } }, { merge: true } as any);
  } catch {}
}

/** Execute a single tool call (stub). */
export async function execute(call: ToolCall): Promise<ExecutionResult> {
  const { name } = call;
  // Make a mutable copy so we can apply defaults prior to validation
  const args = { ...(call.arguments || {}) } as Record<string, unknown>;

  // Apply defaults for createShape prior to validation to avoid missing-parameter failures
  if (name === 'createShape') {
    const t = (args.type as string) || 'rectangle';
    // Default size
    if (t === 'circle') {
      const w = typeof args.width === 'number' ? (args.width as number) : DEFAULT_RECT_WIDTH;
      const h = typeof args.height === 'number' ? (args.height as number) : w;
      args.width = Math.max(1, w);
      args.height = Math.max(1, h);
    } else {
      const w = typeof args.width === 'number' ? (args.width as number) : DEFAULT_RECT_WIDTH;
      const h = typeof args.height === 'number' ? (args.height as number) : DEFAULT_RECT_HEIGHT;
      args.width = Math.max(1, w);
      args.height = Math.max(1, h);
    }
    // Default color
    if (typeof args.color !== 'string' || !(args.color as string)) {
      args.color = DEFAULT_RECT_FILL;
    }
  }

  const valid = validateParams(name, args);
  if (!valid.ok) return { ok: false, error: valid.error };

  try {
    if (name === 'createShape') {
      const data = await handleCreateShape(args, generateId);
      await logAiEvent('create', { id: data.id, type: (args as any).type, fill: (args as any).color });
      return { ok: true, data };
    }

    if (name === 'createGrid') {
      const data = await handleCreateGrid(args, generateId);
      await logAiEvent('create', { type: 'grid', count: (data as any)?.created });
      return { ok: true, data };
    }

    if (name === 'createText') {
      const data = await handleCreateText(args, generateId);
      await logAiEvent('create', { id: data.id, type: 'text', fill: (args as any).color, text: (args as any).text });
      return { ok: true, data };
    }

    if (name === 'moveShape') {
      await handleMoveShape(args);
      await logAiEvent('move', { id: (args as any).id, type: 'shape', x: (args as any).x, y: (args as any).y });
      return { ok: true };
    }

    if (name === 'resizeShape') {
      await handleResizeShape(args);
      await logAiEvent('resize', { id: (args as any).id, type: 'shape', width: (args as any).width, height: (args as any).height });
      return { ok: true };
    }

    if (name === 'deleteShape') {
      await handleDeleteShape(args);
      await logAiEvent('delete', { id: (args as any).id });
      return { ok: true };
    }

    if (name === 'getCanvasState') {
      const state = await loadCanvas();
      return { ok: true, data: state };
    }

    if (name === 'selectShapes') {
      const data = await handleSelectShapes(args);
      return { ok: true, data };
    }

    if (name === 'rotateShape') {
      await handleRotateShape(args);
      await logAiEvent('rotate', { id: (args as any).id, type: 'shape', rotation: (args as any).rotation });
      return { ok: true };
    }

    if (name === 'recolorShape') {
      await handleRecolorShape(args);
      await logAiEvent('recolor', { id: (args as any).id, type: 'shape', fill: (args as any).color });
      return { ok: true };
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
