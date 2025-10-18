/*
  File: SelectionContext.tsx
  Overview: Centralized selection state with first-class multi-select support.
  Responsibilities:
    - Track selected shape ids and their kinds (rect | circle | text)
    - Provide single-select, toggle (add/remove), and box-selection APIs
    - Expose helpers for queries (isSelected, getPrimary)
  Coordinate system: All bounds passed to setBoxSelection() are in WORLD space
    (unscaled/untranslated canvas coordinates). Callers must convert from
    screen coordinates using the active canvas transform before invoking.
  Performance: Context value is memoized; only re-computes when selection maps
    change. Box-selection uses simple AABB intersection for speed.
*/
import { createContext, useContext, useMemo, useState } from 'react';
import type { RectData, CircleData, TextData } from '../services/canvas';

/** Discriminant used to record the type of a selected shape. */
export type SelectionKind = 'rect' | 'circle' | 'text';

/**
 * Public interface exposed by SelectionContext.
 * Consumers can adopt this incrementally alongside legacy, single-select flows.
 */
type SelectionContextValue = {
  selectedIds: string[];
  idToKind: Record<string, SelectionKind>;
  /** Replace current selection with a single id (or clear with null). */
  setSingleSelection: (id: string | null, kind?: SelectionKind | null) => void;
  /** Replace selection with explicit ids and kinds mapping. */
  setSelection: (ids: string[], kinds: Record<string, SelectionKind>) => void;
  /** Toggle presence of an id in the current selection set. */
  toggleSelection: (id: string, kind: SelectionKind) => void;
  /** Clear all selection state. */
  clearSelection: () => void;
  /** True if id is currently selected. */
  isSelected: (id: string) => boolean;
  /** Primary selection (first selected id) or null when empty. */
  getPrimary: () => { id: string; kind: SelectionKind } | null;
  /**
   * Replace the selection with all shapes that intersect the provided bounds.
   * Bounds are interpreted as an AABB in world space. Circles use their
   * bounding square for fast intersection.
   */
  setBoxSelection: (
    bounds: { x: number; y: number; width: number; height: number },
    shapes: { rects: RectData[]; circles: CircleData[]; texts: TextData[] }
  ) => void;
};

const SelectionContext = createContext<SelectionContextValue | null>(null);

/** Provider that owns and exposes multi-select state for the canvas. */
export function SelectionProvider({ children }: { children: React.ReactNode }) {
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [idToKind, setIdToKind] = useState<Record<string, SelectionKind>>({});

  /** Set exactly one selected id (or clear). Useful for click selection. */
  function setSingleSelection(id: string | null, kind?: SelectionKind | null) {
    if (!id) {
      setSelectedIds([]);
      setIdToKind({});
      return;
    }
    setSelectedIds([id]);
    setIdToKind(kind ? { [id]: kind } : {});
  }

  /** Replace selection with explicit ids and kinds. */
  function setSelection(ids: string[], kinds: Record<string, SelectionKind>) {
    setSelectedIds(ids);
    setIdToKind(kinds);
  }

  /** Add/remove one id from the current selection set. */
  function toggleSelection(id: string, kind: SelectionKind) {
    setSelectedIds((prev) => {
      const exists = prev.includes(id);
      if (exists) {
        const next = prev.filter((x) => x !== id);
        setIdToKind((m) => {
          const { [id]: _, ...rest } = m;
          return rest;
        });
        return next;
      }
      setIdToKind((m) => ({ ...m, [id]: kind }));
      return [...prev, id];
    });
  }

  /** Clear all selected ids and kinds. */
  function clearSelection() {
    setSelectedIds([]);
    setIdToKind({});
  }

  /** Check whether a specific id is currently selected. */
  function isSelected(id: string) {
    return selectedIds.includes(id);
  }

  /** Primary selection (first id) commonly used for single-target tooling. */
  function getPrimary(): { id: string; kind: SelectionKind } | null {
    const id = selectedIds[0];
    if (!id) return null;
    const kind = idToKind[id];
    if (!kind) return null;
    return { id, kind };
  }

  /**
   * Box select against the provided bounds (world space), replacing selection.
   * Uses fast AABB tests; circles are approximated by their bounding square.
   */
  function setBoxSelection(
    bounds: { x: number; y: number; width: number; height: number },
    shapes: { rects: RectData[]; circles: CircleData[]; texts: TextData[] }
  ) {
    const bx1 = bounds.x;
    const by1 = bounds.y;
    const bx2 = bounds.x + bounds.width;
    const by2 = bounds.y + bounds.height;

    function intersects(ax1: number, ay1: number, ax2: number, ay2: number) {
      return ax1 <= bx2 && ax2 >= bx1 && ay1 <= by2 && ay2 >= by1;
    }

    const nextIds: string[] = [];
    const nextKinds: Record<string, SelectionKind> = {};

    for (const r of shapes.rects) {
      const ax1 = r.x;
      const ay1 = r.y;
      const ax2 = r.x + r.width;
      const ay2 = r.y + r.height;
      if (intersects(ax1, ay1, ax2, ay2)) {
        nextIds.push(r.id);
        nextKinds[r.id] = 'rect';
      }
    }

    for (const c of shapes.circles) {
      const ax1 = c.cx - c.radius;
      const ay1 = c.cy - c.radius;
      const ax2 = c.cx + c.radius;
      const ay2 = c.cy + c.radius;
      if (intersects(ax1, ay1, ax2, ay2)) {
        nextIds.push(c.id);
        nextKinds[c.id] = 'circle';
      }
    }

    for (const t of shapes.texts) {
      const ax1 = t.x;
      const ay1 = t.y;
      const ax2 = t.x + t.width;
      const ay2 = t.y + (t.height || 24);
      if (intersects(ax1, ay1, ax2, ay2)) {
        nextIds.push(t.id);
        nextKinds[t.id] = 'text';
      }
    }

    setSelectedIds(nextIds);
    setIdToKind(nextKinds);
  }

  const value = useMemo(
    () => ({ selectedIds, idToKind, setSingleSelection, setSelection, toggleSelection, clearSelection, isSelected, getPrimary, setBoxSelection }),
    [selectedIds, idToKind]
  );

  return <SelectionContext.Provider value={value}>{children}</SelectionContext.Provider>;
}

export function useSelection(): SelectionContextValue {
  const ctx = useContext(SelectionContext);
  if (!ctx) throw new Error('useSelection must be used within SelectionProvider');
  return ctx;
}


