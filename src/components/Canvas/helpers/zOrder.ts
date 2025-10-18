/*
  File: zOrder.ts
  Overview: Z-order reordering utilities for selections across kinds while preserving relative order.
*/

import type { RectData, CircleData, TextData } from '../../../services/canvas';

type Kind = 'rect' | 'circle' | 'text';
type Item = { id: string; kind: Kind; z: number };

export type Selection = { ids: string[]; idToKind: Record<string, Kind> };

/** Build a flat z-list of items for all shapes. */
export function buildZItems(rects: RectData[], circles: CircleData[], texts: TextData[]): Item[] {
  return [
    ...rects.map((r) => ({ id: r.id, kind: 'rect' as const, z: r.z ?? 0 })),
    ...circles.map((c) => ({ id: c.id, kind: 'circle' as const, z: c.z ?? 0 })),
    ...texts.map((t) => ({ id: t.id, kind: 'text' as const, z: t.z ?? 0 })),
  ].sort((a, b) => (a.z - b.z) || a.id.localeCompare(b.id));
}

/** Compute the next z-order after applying a group action. */
export function reorderZGroup(action: 'toBack' | 'down' | 'up' | 'toTop', items: Item[], selection: Selection): Item[] {
  const selSet = new Set(selection.ids);
  const selectedItems = items.filter((it) => selSet.has(it.id));
  if (selectedItems.length === 0) return items;
  const others = items.filter((it) => !selSet.has(it.id));
  let nextOrder: Item[] = items;
  if (action === 'toBack') {
    nextOrder = [...selectedItems, ...others];
  } else if (action === 'toTop') {
    nextOrder = [...others, ...selectedItems];
  } else if (action === 'down') {
    const firstIdx = items.findIndex((it) => selSet.has(it.id));
    if (firstIdx <= 0) return items;
    let pivotIdx = -1;
    for (let i = firstIdx - 1; i >= 0; i--) if (!selSet.has(items[i].id)) { pivotIdx = i; break; }
    if (pivotIdx < 0) return items;
    const pivot = items[pivotIdx];
    const pivotInOthers = others.findIndex((it) => it.id === pivot.id);
    if (pivotInOthers < 0) return items;
    nextOrder = [ ...others.slice(0, pivotInOthers), ...selectedItems, ...others.slice(pivotInOthers) ];
  } else if (action === 'up') {
    let lastIdx = -1;
    for (let i = items.length - 1; i >= 0; i--) if (selSet.has(items[i].id)) { lastIdx = i; break; }
    if (lastIdx < 0 || lastIdx >= items.length - 1) return items;
    let pivotIdx = -1;
    for (let i = lastIdx + 1; i < items.length; i++) if (!selSet.has(items[i].id)) { pivotIdx = i; break; }
    if (pivotIdx < 0) return items;
    const pivot = items[pivotIdx];
    const pivotInOthers = others.findIndex((it) => it.id === pivot.id);
    if (pivotInOthers < 0) return items;
    nextOrder = [ ...others.slice(0, pivotInOthers + 1), ...selectedItems, ...others.slice(pivotInOthers + 1) ];
  }
  return nextOrder.map((it, i) => ({ ...it, z: i }));
}


