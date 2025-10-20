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
import { enqueueWrite } from '../firestoreQueue';
import { auth } from '../firebase';
import { generateId } from '../../utils/helpers';
import { handleCreateShape, handleCreateText, handleMoveShape, handleResizeShape, handleDeleteShape, handleSelectShapes, handleRotateShape, handleRecolorShape, handleCreateGrid } from './toolHandlers';
import { routePreparseGrid, routePreparseRelativeMove, routeBuildRelativeMove } from './preparseRouter';
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
    await enqueueWrite(() => setDoc(ref, { last: entry, history: { [Date.now()]: entry } }, { merge: true } as any));
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
    // Default position
    if (typeof args.x !== 'number') args.x = 64;
    if (typeof args.y !== 'number') args.y = 64;
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

  // Apply defaults for createText
  if (name === 'createText') {
    if (typeof args.text !== 'string' || !(args.text as string)) args.text = 'Text';
    if (typeof args.x !== 'number') args.x = 64;
    if (typeof args.y !== 'number') args.y = 64;
    if (typeof args.color !== 'string' || !(args.color as string)) args.color = '#e5e7eb';
  }

  // Apply defaults for createGrid
  if (name === 'createGrid') {
    if (typeof args.shape !== 'string' || !['rectangle','circle'].includes(String(args.shape))) args.shape = 'rectangle';
    if (typeof args.rows !== 'number' || (args.rows as number) < 1) args.rows = 1;
    if (typeof args.cols !== 'number' || (args.cols as number) < 1) args.cols = 1;
    if (typeof args.x !== 'number') args.x = 64;
    if (typeof args.y !== 'number') args.y = 64;
    if (typeof args.cellWidth !== 'number' || (args.cellWidth as number) <= 0) args.cellWidth = 32;
    if (typeof args.cellHeight !== 'number' || (args.cellHeight as number) <= 0) args.cellHeight = 32;
    if (typeof args.gapX !== 'number') args.gapX = 8;
    if (typeof args.gapY !== 'number') args.gapY = 8;
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

    if (name === 'preparseGrid') {
      const data = await routePreparseGrid(args);
      return { ok: true, data };
    }

    if (name === 'preparseRelativeMove') {
      const data = await routePreparseRelativeMove(args);
      return { ok: true, data };
    }

    if (name === 'buildRelativeMoveFromPrompt') {
      const data = await routeBuildRelativeMove(args);
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
