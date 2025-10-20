/*
  File: geometrySelection.ts
  Overview: Geometry and selection helper functions for the canvas. Pure or minimally stateful utilities.
*/

import type { RectData, CircleData, TextData } from '../../../services/canvas';
import { XRAY_AREA_MAX_HITS } from '../../../utils/constants';

export type Kind = 'rect' | 'circle' | 'text';

/** Test if two axis-aligned rectangles intersect. */
export function rectIntersects(ax1: number, ay1: number, ax2: number, ay2: number, bx1: number, by1: number, bx2: number, by2: number) {
  return ax1 <= bx2 && ax2 >= bx1 && ay1 <= by2 && ay2 >= by1;
}

/** Compute the squared distance from point (px, py) to the axis-aligned rectangle [rx1,ry1]-[rx2,ry2]. */
function pointToRectDistanceSq(px: number, py: number, rx1: number, ry1: number, rx2: number, ry2: number) {
  const dx = px < rx1 ? (rx1 - px) : (px > rx2 ? (px - rx2) : 0);
  const dy = py < ry1 ? (ry1 - py) : (py > ry2 ? (py - ry2) : 0);
  return dx * dx + dy * dy;
}

/** Test if a circle intersects an axis-aligned rectangle. */
export function circleIntersectsRect(cx: number, cy: number, r: number, rx1: number, ry1: number, rx2: number, ry2: number) {
  // Quick reject using AABBs
  if (!rectIntersects(cx - r, cy - r, cx + r, cy + r, rx1, ry1, rx2, ry2)) return false;
  // Exact using closest point on rect to circle center
  const distSq = pointToRectDistanceSq(cx, cy, rx1, ry1, rx2, ry2);
  return distSq <= r * r;
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
  xRay?: boolean;
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

  type Cand = { id: string; kind: Kind; z: number; ix1: number; iy1: number; ix2: number; iy2: number };
  const cands: Cand[] = [];

  function pushIfIntersect(id: string, kind: Kind, z: number, ax1: number, ay1: number, ax2: number, ay2: number) {
    if (!rectIntersects(ax1, ay1, ax2, ay2, bx1, by1, bx2, by2)) return;
    const ix1 = Math.max(ax1, bx1);
    const iy1 = Math.max(ay1, by1);
    const ix2 = Math.min(ax2, bx2);
    const iy2 = Math.min(ay2, by2);
    if (ix2 <= ix1 || iy2 <= iy1) return;
    cands.push({ id, kind, z, ix1, iy1, ix2, iy2 });
  }

  for (const r of data.rects) pushIfIntersect(r.id, 'rect', r.z ?? 0, r.x, r.y, r.x + r.width, r.y + r.height);
  // For circles, require actual circle-rect intersection, not just AABB
  for (const c of data.circles) {
    if (circleIntersectsRect(c.cx, c.cy, c.radius, bx1, by1, bx2, by2)) {
      const ax1 = c.cx - c.radius, ay1 = c.cy - c.radius, ax2 = c.cx + c.radius, ay2 = c.cy + c.radius;
      pushIfIntersect(c.id, 'circle', c.z ?? 0, ax1, ay1, ax2, ay2);
    }
  }
  for (const t of data.texts) pushIfIntersect(t.id, 'text', t.z ?? 0, t.x, t.y, t.x + t.width, t.y + (t.height || 24));

  if (opts.xRay) {
    // x-ray: include all intersecting
    const nextIds = cands.map((c) => c.id);
    const nextKinds: Record<string, Kind> = {};
    cands.forEach((c) => { nextKinds[c.id] = c.kind; });
    if (nextIds.length > XRAY_AREA_MAX_HITS) {
      const capped = nextIds.slice(0, XRAY_AREA_MAX_HITS);
      const kinds: Record<string, Kind> = {};
      for (const id of capped) kinds[id] = nextKinds[id];
      combineSelectionWithMode(capped, kinds, opts);
      return;
    }
    combineSelectionWithMode(nextIds, nextKinds, opts);
    return;
  }

  // Non x-ray: include only if intersection area is not completely contained by a higher-z candidate
  cands.sort((a, b) => a.z - b.z);
  function contains(a: Cand, b: Cand): boolean {
    return a.ix1 <= b.ix1 && a.iy1 <= b.iy1 && a.ix2 >= b.ix2 && a.iy2 >= b.iy2;
  }
  const accepted: Cand[] = [];
  for (let i = 0; i < cands.length; i++) {
    const cand = cands[i];
    let fullyCovered = false;
    for (let j = i + 1; j < cands.length; j++) {
      const higher = cands[j];
      if (contains(higher, cand)) { fullyCovered = true; break; }
    }
    if (!fullyCovered) accepted.push(cand);
  }
  const nextIds = accepted.map((c) => c.id);
  const nextKinds: Record<string, Kind> = {};
  accepted.forEach((c) => { nextKinds[c.id] = c.kind; });
  if (nextIds.length > XRAY_AREA_MAX_HITS) {
    const capped = nextIds.slice(0, XRAY_AREA_MAX_HITS);
    const kinds: Record<string, Kind> = {};
    for (const id of capped) kinds[id] = nextKinds[id];
    combineSelectionWithMode(capped, kinds, opts);
    return;
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


