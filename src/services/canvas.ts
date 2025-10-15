/*
  File: canvas.ts
  Overview: Firestore-backed collaborative canvas model with granular upserts for rects, circles, and texts.
  Schema:
    - Document `canvas/default` uses maps: rectsById, circlesById, textsById. Legacy arrays are merged for back-compat.
  Concurrency:
    - Upserts record revision, server lastUpdated, lastClientId, and optional mutationId used by clients to avoid echo.
*/
import { db } from './firebase';
import { doc, getDoc, onSnapshot, serverTimestamp, updateDoc, deleteField } from 'firebase/firestore';

export type RectData = { id: string; x: number; y: number; width: number; height: number; fill: string };
export type CircleData = { id: string; cx: number; cy: number; radius: number; fill: string };
export type TextData = { id: string; x: number; y: number; width: number; height: number; text: string; fill: string };

type ObjectMeta = {
  // For client-side diagnostics only; conflict resolution uses lastUpdated (server time)
  revision?: number;
  lastUpdated?: unknown;
  lastClientId?: string;
  mutationId?: string;
};

type RectRecord = RectData & ObjectMeta;
type CircleRecord = CircleData & ObjectMeta;
type TextRecord = TextData & ObjectMeta;

export type CanvasState = {
  rects: RectData[];
  circles: CircleData[];
  texts: TextData[];
};

type CanvasDoc = {
  // New granular schema
  rectsById?: Record<string, RectRecord>;
  circlesById?: Record<string, CircleRecord>;
  textsById?: Record<string, TextRecord>;
  // Legacy fields for back-compat hydration
  rects?: RectData[];
  circles?: CircleData[];
  texts?: TextData[];
  // Optional top-level metadata (legacy)
  updatedAt?: unknown;
  client?: string;
};

const CANVAS_DOC_ID = 'default';
const clientId = (() => Math.random().toString(36).slice(2) + Date.now().toString(36))();

function canvasRef() {
  return doc(db, 'canvas', CANVAS_DOC_ID);
}

/** Load the entire canvas state (preferring map schema, falling back to legacy arrays). */
export async function loadCanvas(): Promise<CanvasState | null> {
  const snap = await getDoc(canvasRef());
  if (!snap.exists()) return null;
  const data = snap.data() as CanvasDoc;
  // Prefer new map-based schema; fall back to legacy arrays if needed
  if (data.rectsById || data.circlesById || data.textsById) {
    return {
      rects: Object.values(data.rectsById || {}).map(({ id, x, y, width, height, fill }) => ({ id, x, y, width, height, fill })),
      circles: Object.values(data.circlesById || {}).map(({ id, cx, cy, radius, fill }) => ({ id, cx, cy, radius, fill })),
      texts: Object.values(data.textsById || {}).map(({ id, x, y, width, height, text, fill }) => ({ id, x, y, width, height: (height as number) ?? 24, text, fill })),
    };
  }
  // Legacy arrays (no height for text), provide sane default height
  return {
    rects: data.rects || [],
    circles: data.circles || [],
    texts: (data.texts || []).map((t: any) => ({ ...t, height: (t?.height as number) ?? 24 })),
  };
}

export function subscribeCanvas(
  handler: (payload: { state: CanvasState; client?: string; mutationIds?: string[] }) => void
): () => void {
  return onSnapshot(canvasRef(), (snap) => {
    const data = (snap.data() || {}) as CanvasDoc;
    // Build state by merging map-based schema with any legacy arrays (maps win)
    const rectMap = data.rectsById || {};
    const circleMap = data.circlesById || {};
    const textMap = data.textsById || {};
    const rectsFromMap = Object.values(rectMap).map(({ id, x, y, width, height, fill }) => ({ id, x, y, width, height, fill }));
    const circlesFromMap = Object.values(circleMap).map(({ id, cx, cy, radius, fill }) => ({ id, cx, cy, radius, fill }));
    const textsFromMap = Object.values(textMap).map(({ id, x, y, width, height, text, fill }) => ({ id, x, y, width, height: (height as number) ?? 24, text, fill }));
    const rectIds = new Set(rectsFromMap.map((r) => r.id));
    const circleIds = new Set(circlesFromMap.map((c) => c.id));
    const textIds = new Set(textsFromMap.map((t) => t.id));
    const mergedRects = [...rectsFromMap, ...((data.rects || []).filter((r) => !rectIds.has(r.id)))];
    const mergedCircles = [...circlesFromMap, ...((data.circles || []).filter((c) => !circleIds.has(c.id)))];
    const mergedTexts = [
      ...textsFromMap,
      ...((data.texts || []).filter((t) => !textIds.has(t.id))).map((t: any) => ({ ...t, height: (t?.height as number) ?? 24 })),
    ];
    // Stable ordering by id to prevent React re-mounts and jitter
    mergedRects.sort((a, b) => a.id.localeCompare(b.id));
    mergedCircles.sort((a, b) => a.id.localeCompare(b.id));
    mergedTexts.sort((a, b) => a.id.localeCompare(b.id));
    const state: CanvasState = { rects: mergedRects, circles: mergedCircles, texts: mergedTexts };
    const mutationIds = [
      ...Object.values(data.rectsById || {}).map((r) => r.mutationId).filter(Boolean),
      ...Object.values(data.circlesById || {}).map((c) => c.mutationId).filter(Boolean),
      ...Object.values(data.textsById || {}).map((t) => t.mutationId).filter(Boolean),
    ] as string[];
    handler({ state, client: data.client, mutationIds });
  });
}

// New granular APIs
/** Upsert a rectangle by id. Optionally attach a `mutationId` for echo suppression. */
export async function upsertRect(rect: RectData, mutationId?: string): Promise<void> {
  const fieldPath = `rectsById.${rect.id}`;
  await updateDoc(canvasRef(), {
    [fieldPath]: { ...rect, revision: Date.now(), lastUpdated: serverTimestamp(), lastClientId: clientId, mutationId },
    updatedAt: serverTimestamp(),
    client: clientId,
  } as any);
}

/** Upsert a circle by id. Optionally attach a `mutationId` for echo suppression. */
export async function upsertCircle(circle: CircleData, mutationId?: string): Promise<void> {
  const fieldPath = `circlesById.${circle.id}`;
  await updateDoc(canvasRef(), {
    [fieldPath]: { ...circle, revision: Date.now(), lastUpdated: serverTimestamp(), lastClientId: clientId, mutationId },
    updatedAt: serverTimestamp(),
    client: clientId,
  } as any);
}

/** Upsert a text node by id. Optionally attach a `mutationId` for echo suppression. */
export async function upsertText(text: TextData, mutationId?: string): Promise<void> {
  const fieldPath = `textsById.${text.id}`;
  await updateDoc(canvasRef(), {
    [fieldPath]: { ...text, revision: Date.now(), lastUpdated: serverTimestamp(), lastClientId: clientId, mutationId },
    updatedAt: serverTimestamp(),
    client: clientId,
  } as any);
}

/** Delete a rectangle by id. */
export async function deleteRect(id: string): Promise<void> {
  await updateDoc(canvasRef(), { [`rectsById.${id}`]: deleteField(), updatedAt: serverTimestamp(), client: clientId } as any);
}

/** Delete a circle by id. */
export async function deleteCircle(id: string): Promise<void> {
  await updateDoc(canvasRef(), { [`circlesById.${id}`]: deleteField(), updatedAt: serverTimestamp(), client: clientId } as any);
}

/** Delete a text node by id. */
export async function deleteText(id: string): Promise<void> {
  await updateDoc(canvasRef(), { [`textsById.${id}`]: deleteField(), updatedAt: serverTimestamp(), client: clientId } as any);
}

export function getClientId() {
  return clientId;
}

export async function clearCanvas(): Promise<void> {
  await updateDoc(canvasRef(), {
    rectsById: {},
    circlesById: {},
    textsById: {},
    // Also clear legacy arrays so fallback merge doesn't repopulate
    rects: [],
    circles: [],
    texts: [],
    updatedAt: serverTimestamp(),
    client: clientId,
  } as any);
}


