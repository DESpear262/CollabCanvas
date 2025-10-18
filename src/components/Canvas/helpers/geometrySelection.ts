/*
  File: geometrySelection.ts
  Overview: Geometry and selection helper functions for the canvas. Pure or minimally stateful utilities.
*/

import type { RectData, CircleData, TextData } from '../../../services/canvas';

export type Kind = 'rect' | 'circle' | 'text';

/** Test if two axis-aligned rectangles intersect. */
export function rectIntersects(ax1: number, ay1: number, ax2: number, ay2: number, bx1: number, by1: number, bx2: number, by2: number) {
  return ax1 <= bx2 && ax2 >= bx1 && ay1 <= by2 && ay2 >= by1;
}

/** Convert stage pointer to world space using stage position/scale. */
export function getWorldPointer(stage: any): { x: number; y: number } | null {
  const p = stage?.getPointerPosition?.();
  if (!p) return null;
  const sx = stage.x?.() ?? stage.x;
  const sy = stage.y?.() ?? stage.y;
  const sc = stage.scaleX?.() ?? stage.scaleX;
  return { x: (p.x - sx) / sc, y: (p.y - sy) / sc };
}

type SelectionOpts = {
  booleanMode: 'new' | 'union' | 'intersect' | 'difference';
  selectionDragBaseRef: React.MutableRefObject<{ ids: string[]; kinds: Record<string, Kind> } | null>;
  multiSelectedIds: string[] | null | undefined;
  multiIdToKind: Record<string, Kind>;
  setSelection: (ids: string[], kinds: Record<string, Kind>) => void;
};

/**
 * Combine a set of candidate ids/kinds with the current selection according to boolean mode.
 */
export function combineSelectionWithMode(nextIds: string[], nextKinds: Record<string, Kind>, opts: SelectionOpts) {
  const baseIds = opts.selectionDragBaseRef.current ? opts.selectionDragBaseRef.current.ids : (opts.multiSelectedIds || []);
  const baseKinds = opts.selectionDragBaseRef.current ? opts.selectionDragBaseRef.current.kinds : (opts.multiIdToKind as Record<string, Kind>);
  const mode = opts.booleanMode;
  if (mode === 'new') {
    if (nextIds.length === 0) return; // keep current selection when empty
    opts.setSelection(nextIds, nextKinds);
    return;
  }
  if (mode === 'union') {
    const set = new Set<string>([...baseIds, ...nextIds]);
    const ids = Array.from(set);
    const kinds = { ...baseKinds, ...nextKinds };
    opts.setSelection(ids, kinds);
    return;
  }
  if (mode === 'intersect') {
    const set = new Set<string>(baseIds);
    const ids = nextIds.filter((x) => set.has(x));
    const kinds: Record<string, Kind> = {};
    for (const id of ids) kinds[id] = nextKinds[id] || baseKinds[id];
    opts.setSelection(ids, kinds);
    return;
  }
  // difference (XOR)
  const set = new Set<string>(baseIds);
  const kinds: Record<string, Kind> = { ...baseKinds };
  for (const id of nextIds) {
    if (set.has(id)) {
      set.delete(id);
      delete kinds[id];
    } else {
      set.add(id);
      kinds[id] = nextKinds[id];
    }
  }
  opts.setSelection(Array.from(set), kinds);
}

type AreaSelectionData = {
  rects: RectData[];
  circles: CircleData[];
  texts: TextData[];
};

/** Apply rectangular area selection to shapes and merge with current selection by mode. */
export function applyAreaSelectionRect(bounds: { x: number; y: number; w: number; h: number }, data: AreaSelectionData, opts: SelectionOpts) {
  const bx1 = Math.min(bounds.x, bounds.x + bounds.w);
  const by1 = Math.min(bounds.y, bounds.y + bounds.h);
  const bx2 = Math.max(bounds.x, bounds.x + bounds.w);
  const by2 = Math.max(bounds.y, bounds.y + bounds.h);
  const nextIds: string[] = [];
  const nextKinds: Record<string, Kind> = {};
  for (const r of data.rects) {
    const ax1 = r.x, ay1 = r.y, ax2 = r.x + r.width, ay2 = r.y + r.height;
    if (rectIntersects(ax1, ay1, ax2, ay2, bx1, by1, bx2, by2)) { nextIds.push(r.id); nextKinds[r.id] = 'rect'; }
  }
  for (const c of data.circles) {
    const ax1 = c.cx - c.radius, ay1 = c.cy - c.radius, ax2 = c.cx + c.radius, ay2 = c.cy + c.radius;
    if (rectIntersects(ax1, ay1, ax2, ay2, bx1, by1, bx2, by2)) { nextIds.push(c.id); nextKinds[c.id] = 'circle'; }
  }
  for (const t of data.texts) {
    const ax1 = t.x, ay1 = t.y, ax2 = t.x + t.width, ay2 = t.y + t.height;
    if (rectIntersects(ax1, ay1, ax2, ay2, bx1, by1, bx2, by2)) { nextIds.push(t.id); nextKinds[t.id] = 'text'; }
  }
  combineSelectionWithMode(nextIds, nextKinds, opts);
}

/** Apply lasso (approx via bounding box) selection. */
export function applyAreaSelectionLasso(points: Array<{ x: number; y: number }>, data: AreaSelectionData, opts: SelectionOpts) {
  if (!points.length) return;
  let minX = points[0].x, maxX = points[0].x, minY = points[0].y, maxY = points[0].y;
  for (const p of points) {
    if (p.x < minX) minX = p.x;
    if (p.x > maxX) maxX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.y > maxY) maxY = p.y;
  }
  applyAreaSelectionRect({ x: minX, y: minY, w: maxX - minX, h: maxY - minY }, data, opts);
}


