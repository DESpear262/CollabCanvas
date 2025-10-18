/*
  File: canvas.ts
  Overview: Firestore-backed collaborative canvas model with granular upserts for rects, circles, texts, and groups.
  Schema:
    - Document `canvas/default` uses maps: rectsById, circlesById, textsById. Legacy arrays are merged for back-compat.
  Concurrency:
    - Upserts record revision, server lastUpdated, lastClientId, and optional mutationId used by clients to avoid echo.
  Rotation:
    - `rotation` persisted for rects and texts only (circles not rotatable). Defaults to 0 when missing.
  Z-order:
    - `z` persisted for all shapes (0 = bottom; higher renders on top). Defaults to 0 when missing.
*/
import { db } from './firebase';
import { doc, getDoc, onSnapshot, serverTimestamp, updateDoc, deleteField } from 'firebase/firestore';

export type RectData = { id: string; x: number; y: number; width: number; height: number; fill: string; rotation?: number; z: number };
export type CircleData = { id: string; cx: number; cy: number; radius: number; fill: string; z: number };
export type TextData = { id: string; x: number; y: number; width: number; height: number; text: string; fill: string; rotation?: number; z: number };
export type GroupChild = { id: string; kind: 'rect' | 'circle' | 'text' };
export type GroupData = { id: string; children: GroupChild[]; z: number; name: string };

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
type GroupRecord = GroupData & ObjectMeta;

export type CanvasState = {
  rects: RectData[];
  circles: CircleData[];
  texts: TextData[];
  groups: GroupData[];
};

type CanvasDoc = {
  // New granular schema
  rectsById?: Record<string, RectRecord>;
  circlesById?: Record<string, CircleRecord>;
  textsById?: Record<string, TextRecord>;
  groupsById?: Record<string, GroupRecord>;
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
  if (data.rectsById || data.circlesById || data.textsById || data.groupsById) {
    return {
      rects: Object.values(data.rectsById || {}).map(({ id, x, y, width, height, fill, rotation, z }) => ({ id, x, y, width, height, fill, rotation: (rotation as number) ?? 0, z: (z as number) ?? 0 })),
      circles: Object.values(data.circlesById || {}).map(({ id, cx, cy, radius, fill, z }) => ({ id, cx, cy, radius, fill, z: (z as number) ?? 0 })),
      texts: Object.values(data.textsById || {}).map(({ id, x, y, width, height, text, fill, rotation, z }) => ({ id, x, y, width, height: (height as number) ?? 24, text, fill, rotation: (rotation as number) ?? 0, z: (z as number) ?? 0 })),
      groups: Object.values(data.groupsById || {}).map(({ id, children, z, name }) => ({ id, children: (children as GroupChild[]) || [], z: (z as number) ?? 0, name: (name as string) ?? '' })),
    };
  }
  // Legacy arrays (no height for text), provide sane default height
  return {
    rects: (data.rects || []).map((r: any) => ({ ...r, z: (r?.z as number) ?? 0 })),
    circles: (data.circles || []).map((c: any) => ({ ...c, z: (c?.z as number) ?? 0 })),
    texts: (data.texts || []).map((t: any) => ({ ...t, height: (t?.height as number) ?? 24, z: (t?.z as number) ?? 0 })),
    groups: Object.values((data as any).groupsById || {}).map((g: any) => ({ id: g.id, children: g.children || [], z: (g?.z as number) ?? 0, name: (g?.name as string) ?? '' })),
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
    const groupMap = data.groupsById || {};
    const rectsFromMap = Object.values(rectMap).map(({ id, x, y, width, height, fill, rotation, z }) => ({ id, x, y, width, height, fill, rotation: (rotation as number) ?? 0, z: (z as number) ?? 0 }));
    const circlesFromMap = Object.values(circleMap).map(({ id, cx, cy, radius, fill, z }) => ({ id, cx, cy, radius, fill, z: (z as number) ?? 0 }));
    const textsFromMap = Object.values(textMap).map(({ id, x, y, width, height, text, fill, rotation, z }) => ({ id, x, y, width, height: (height as number) ?? 24, text, fill, rotation: (rotation as number) ?? 0, z: (z as number) ?? 0 }));
    const groupsFromMap = Object.values(groupMap).map(({ id, children, z, name }) => ({ id, children: (children as GroupChild[]) || [], z: (z as number) ?? 0, name: (name as string) ?? '' }));
    const rectIds = new Set(rectsFromMap.map((r) => r.id));
    const circleIds = new Set(circlesFromMap.map((c) => c.id));
    const textIds = new Set(textsFromMap.map((t) => t.id));
    const mergedRects = [...rectsFromMap, ...((data.rects || []).filter((r) => !rectIds.has(r.id))).map((r: any) => ({ ...r, z: (r?.z as number) ?? 0 }))];
    const mergedCircles = [...circlesFromMap, ...((data.circles || []).filter((c) => !circleIds.has(c.id))).map((c: any) => ({ ...c, z: (c?.z as number) ?? 0 }))];
    const mergedTexts = [
      ...textsFromMap,
      ...((data.texts || []).filter((t) => !textIds.has(t.id))).map((t: any) => ({ ...t, height: (t?.height as number) ?? 24, z: (t?.z as number) ?? 0 })),
    ];
    // Keep arrays stable; final render order is determined by z in Canvas.tsx
    const state: CanvasState = { rects: mergedRects, circles: mergedCircles, texts: mergedTexts, groups: groupsFromMap };
    const mutationIds = [
      ...Object.values(data.rectsById || {}).map((r) => r.mutationId).filter(Boolean),
      ...Object.values(data.circlesById || {}).map((c) => c.mutationId).filter(Boolean),
      ...Object.values(data.textsById || {}).map((t) => t.mutationId).filter(Boolean),
      ...Object.values(data.groupsById || {}).map((g: any) => g.mutationId).filter(Boolean),
    ] as string[];
    handler({ state, client: data.client, mutationIds });
  });
}

// New granular APIs
/** Upsert a rectangle by id. Optionally attach a `mutationId` for echo suppression. */
export async function upsertRect(rect: RectData, mutationId?: string): Promise<void> {
  const fieldPath = `rectsById.${rect.id}`;
  const base = { ...rect, revision: Date.now(), lastUpdated: serverTimestamp(), lastClientId: clientId } as any;
  if (mutationId) base.mutationId = mutationId;
  await updateDoc(canvasRef(), {
    [fieldPath]: base,
    updatedAt: serverTimestamp(),
    client: clientId,
  } as any);
}

/** Upsert a circle by id. Optionally attach a `mutationId` for echo suppression. */
export async function upsertCircle(circle: CircleData, mutationId?: string): Promise<void> {
  const fieldPath = `circlesById.${circle.id}`;
  const base = { ...circle, revision: Date.now(), lastUpdated: serverTimestamp(), lastClientId: clientId } as any;
  if (mutationId) base.mutationId = mutationId;
  await updateDoc(canvasRef(), {
    [fieldPath]: base,
    updatedAt: serverTimestamp(),
    client: clientId,
  } as any);
}

/** Upsert a text node by id. Optionally attach a `mutationId` for echo suppression. */
export async function upsertText(text: TextData, mutationId?: string): Promise<void> {
  const fieldPath = `textsById.${text.id}`;
  const base = { ...text, revision: Date.now(), lastUpdated: serverTimestamp(), lastClientId: clientId } as any;
  if (mutationId) base.mutationId = mutationId;
  await updateDoc(canvasRef(), {
    [fieldPath]: base,
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
    groupsById: {},
    // Also clear legacy arrays so fallback merge doesn't repopulate
    rects: [],
    circles: [],
    texts: [],
    updatedAt: serverTimestamp(),
    client: clientId,
  } as any);
}

/**
 * Backfill any missing `z` fields to 0 for all shapes in Firestore.
 * Safe to call multiple times; performs no-op updates when all shapes have z.
 */
export async function backfillMissingZ(): Promise<void> {
  const snap = await getDoc(canvasRef());
  if (!snap.exists()) return;
  const data = (snap.data() || {}) as CanvasDoc;
  const updates: Record<string, unknown> = {};

  // Map-based schema
  for (const [id, r] of Object.entries(data.rectsById || {})) {
    const z = (r as any)?.z;
    if (typeof z !== 'number') updates[`rectsById.${id}.z`] = 0;
  }
  for (const [id, c] of Object.entries(data.circlesById || {})) {
    const z = (c as any)?.z;
    if (typeof z !== 'number') updates[`circlesById.${id}.z`] = 0;
  }
  for (const [id, t] of Object.entries(data.textsById || {})) {
    const z = (t as any)?.z;
    if (typeof z !== 'number') updates[`textsById.${id}.z`] = 0;
  }

  // Legacy arrays: normalize by writing back same arrays with z=0 where missing
  if (Array.isArray(data.rects)) {
    const next = (data.rects as any[]).map((r) => ({ ...r, z: (typeof r?.z === 'number' ? r.z : 0) }));
    if (JSON.stringify(next) !== JSON.stringify(data.rects)) updates['rects'] = next;
  }
  if (Array.isArray(data.circles)) {
    const next = (data.circles as any[]).map((c) => ({ ...c, z: (typeof c?.z === 'number' ? c.z : 0) }));
    if (JSON.stringify(next) !== JSON.stringify(data.circles)) updates['circles'] = next;
  }
  if (Array.isArray(data.texts)) {
    const next = (data.texts as any[]).map((t) => ({ ...t, z: (typeof t?.z === 'number' ? t.z : 0) }));
    if (JSON.stringify(next) !== JSON.stringify(data.texts)) updates['texts'] = next;
  }

  if (Object.keys(updates).length === 0) return;
  updates['updatedAt'] = serverTimestamp();
  updates['client'] = clientId;
  await updateDoc(canvasRef(), updates as any);
}

/** Upsert a group by id. */
export async function upsertGroup(group: GroupData, mutationId?: string): Promise<void> {
  const fieldPath = `groupsById.${group.id}`;
  const base = { ...group, revision: Date.now(), lastUpdated: serverTimestamp(), lastClientId: clientId } as any;
  if (mutationId) base.mutationId = mutationId;
  await updateDoc(canvasRef(), {
    [fieldPath]: base,
    updatedAt: serverTimestamp(),
    client: clientId,
  } as any);
}

/** Delete a group by id. */
export async function deleteGroup(id: string): Promise<void> {
  await updateDoc(canvasRef(), { [`groupsById.${id}`]: deleteField(), updatedAt: serverTimestamp(), client: clientId } as any);
}


