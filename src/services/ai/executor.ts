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
import { handleCreateShape, handleCreateText, handleMoveShape, handleResizeShape, handleDeleteShape, handleSelectShapes, handleRotateShape, handleRecolorShape } from './toolHandlers';

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
  const { name, arguments: args } = call;
  const valid = validateParams(name, args);
  if (!valid.ok) return { ok: false, error: valid.error };

  try {
    if (name === 'createShape') {
      const data = await handleCreateShape(args, generateId);
      await logAiEvent('create', { id: data.id, type: (args as any).type, fill: (args as any).color });
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
