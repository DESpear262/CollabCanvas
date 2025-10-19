/*
  File: CanvasExportContext.tsx
  Overview: Provides access to the Konva Stage and an exportPNG() helper to download PNGs.
  Usage:
    - Canvas registers its Stage ref and a scene snapshot getter so exports can compute bounds.
    - Header opens ExportDialog which calls exportPNG with user-selected scope and options.
*/
import { createContext, useCallback, useContext, useMemo, useRef } from 'react';

type WorldBounds = { x: number; y: number; width: number; height: number } | null;

type SceneSnapshot = {
  rects: Array<{ id: string; x: number; y: number; width: number; height: number }>;
  circles: Array<{ id: string; cx: number; cy: number; radius: number }>;
  texts: Array<{ id: string; x: number; y: number; width: number; height: number }>;
  selectionIds: string[];
  idToKind: Record<string, 'rect' | 'circle' | 'text'>;
};

export type ExportScope = 'viewport' | 'world' | 'content' | 'selection';

type ExportOptions = {
  scope: ExportScope;
  fileName?: string; // defaults to collabcanvas-YYYYMMDD-HHMMSS.png
  includeOverlays?: boolean; // default false (exclude selection/transform overlays)
};

type CanvasExportContextValue = {
  registerStage: (stageRef: { current: any } | null) => void;
  registerSceneSnapshotGetter: (getter: (() => SceneSnapshot) | null) => void;
  exportPNG: (opts: ExportOptions) => Promise<void>;
  getEstimatedPixelSize: (scope: ExportScope) => { width: number; height: number } | null;
};

const CanvasExportContext = createContext<CanvasExportContextValue | null>(null);

export function CanvasExportProvider({ children }: { children: React.ReactNode }) {
  const stageRefRef = useRef<{ current: any } | null>(null);
  const snapshotGetterRef = useRef<(() => SceneSnapshot) | null>(null);

  const computeContentBounds = useCallback((snap: SceneSnapshot): WorldBounds => {
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const r of snap.rects) {
      minX = Math.min(minX, r.x); minY = Math.min(minY, r.y);
      maxX = Math.max(maxX, r.x + r.width); maxY = Math.max(maxY, r.y + r.height);
    }
    for (const c of snap.circles) {
      minX = Math.min(minX, c.cx - c.radius); minY = Math.min(minY, c.cy - c.radius);
      maxX = Math.max(maxX, c.cx + c.radius); maxY = Math.max(maxY, c.cy + c.radius);
    }
    for (const t of snap.texts) {
      minX = Math.min(minX, t.x); minY = Math.min(minY, t.y);
      maxX = Math.max(maxX, t.x + t.width); maxY = Math.max(maxY, t.y + t.height);
    }
    if (!isFinite(minX)) return null;
    return { x: minX, y: minY, width: Math.max(0, maxX - minX), height: Math.max(0, maxY - minY) };
  }, []);

  const computeSelectionBounds = useCallback((snap: SceneSnapshot): WorldBounds => {
    const ids = snap.selectionIds || [];
    if (!ids.length) return null;
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const id of ids) {
      const kind = snap.idToKind[id];
      if (kind === 'rect') {
        const r = snap.rects.find((x) => x.id === id);
        if (!r) continue;
        minX = Math.min(minX, r.x); minY = Math.min(minY, r.y);
        maxX = Math.max(maxX, r.x + r.width); maxY = Math.max(maxY, r.y + r.height);
      } else if (kind === 'circle') {
        const c = snap.circles.find((x) => x.id === id);
        if (!c) continue;
        minX = Math.min(minX, c.cx - c.radius); minY = Math.min(minY, c.cy - c.radius);
        maxX = Math.max(maxX, c.cx + c.radius); maxY = Math.max(maxY, c.cy + c.radius);
      } else if (kind === 'text') {
        const t = snap.texts.find((x) => x.id === id);
        if (!t) continue;
        minX = Math.min(minX, t.x); minY = Math.min(minY, t.y);
        maxX = Math.max(maxX, t.x + t.width); maxY = Math.max(maxY, t.y + t.height);
      }
    }
    if (!isFinite(minX)) return null;
    return { x: minX, y: minY, width: Math.max(0, maxX - minX), height: Math.max(0, maxY - minY) };
  }, []);

  const toStageCrop = useCallback((scope: ExportScope): { x: number; y: number; width: number; height: number } | null => {
    const stage = stageRefRef.current?.current;
    if (!stage) return null;
    const s = stage.scaleX?.() ?? 1;
    const px = stage.x?.() ?? 0;
    const py = stage.y?.() ?? 0;
    if (scope === 'viewport') {
      return { x: 0, y: 0, width: stage.width?.() ?? stage.width, height: stage.height?.() ?? stage.height };
    }
    const snap = snapshotGetterRef.current?.();
    if (!snap) return null;
    if (scope === 'world') {
      // Capture the full world rectangle at current transform
      const WORLD = 5000;
      return { x: 0 * s + px, y: 0 * s + py, width: WORLD * s, height: WORLD * s };
    }
    if (scope === 'content') {
      const b = computeContentBounds(snap); if (!b) return null;
      return { x: b.x * s + px, y: b.y * s + py, width: b.width * s, height: b.height * s };
    }
    if (scope === 'selection') {
      const b = computeSelectionBounds(snap); if (!b) return null;
      return { x: b.x * s + px, y: b.y * s + py, width: b.width * s, height: b.height * s };
    }
    return null;
  }, [computeContentBounds, computeSelectionBounds]);

  const getEstimatedPixelSize = useCallback((scope: ExportScope) => {
    const stage = stageRefRef.current?.current;
    if (!stage) return null;
    if (scope === 'viewport') {
      return { width: stage.width?.() ?? stage.width, height: stage.height?.() ?? stage.height };
    }
    const crop = toStageCrop(scope);
    if (!crop) return null;
    return { width: Math.round(crop.width), height: Math.round(crop.height) };
  }, [toStageCrop]);

  const exportPNG = useCallback(async (opts: ExportOptions) => {
    const stage = stageRefRef.current?.current;
    if (!stage) return;
    const includeOverlays = !!opts.includeOverlays;
    const overlays = includeOverlays ? [] : (stage.find?.('.overlay') || []);
    const prevVis: boolean[] = [];
    overlays.forEach((node: any) => { prevVis.push(node.visible?.()); node.visible?.(false); });
    stage.batchDraw?.();
    try {
      const crop = toStageCrop(opts.scope);
      if (!crop) return;
      const dataURL = stage.toDataURL({
        x: Math.max(0, crop.x),
        y: Math.max(0, crop.y),
        width: Math.max(1, crop.width),
        height: Math.max(1, crop.height),
        pixelRatio: 1,
        mimeType: 'image/png',
      } as any);
      const a = document.createElement('a');
      const ts = new Date();
      const pad = (n: number) => String(n).padStart(2, '0');
      const fileName = opts.fileName || `collabcanvas-${ts.getFullYear()}${pad(ts.getMonth() + 1)}${pad(ts.getDate())}-${pad(ts.getHours())}${pad(ts.getMinutes())}${pad(ts.getSeconds())}.png`;
      a.href = dataURL;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    } finally {
      overlays.forEach((node: any, i: number) => { node.visible?.(prevVis[i]); });
      stage.batchDraw?.();
    }
  }, [toStageCrop]);

  const value = useMemo<CanvasExportContextValue>(() => ({
    registerStage: (ref) => { stageRefRef.current = ref; },
    registerSceneSnapshotGetter: (getter) => { snapshotGetterRef.current = getter; },
    exportPNG,
    getEstimatedPixelSize,
  }), [exportPNG, getEstimatedPixelSize]);

  return <CanvasExportContext.Provider value={value}>{children}</CanvasExportContext.Provider>;
}

export function useCanvasExport(): CanvasExportContextValue {
  const ctx = useContext(CanvasExportContext);
  if (!ctx) throw new Error('useCanvasExport must be used within CanvasExportProvider');
  return ctx;
}


