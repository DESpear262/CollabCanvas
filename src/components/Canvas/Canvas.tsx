/*
  File: Canvas.tsx
  Overview: Interactive collaborative canvas built on react-konva with pan/zoom, draw, select, edit, and rotation.
  Features:
    - Pan/zoom the Stage; draw rect/circle/text; select, transform, rotate (rect/text); erase.
    - Granular Firestore upserts with mutation echo suppression.
    - Inline HTML textarea overlay for text editing with proper world<->screen math.
    - Real-time ephemeral motion streaming (including rotation for rect/text) via RTDB.
*/
import { useCallback, useState, useEffect } from 'react';
import type { CSSProperties, ChangeEvent } from 'react';
import { Stage, Layer, Rect } from 'react-konva';
import { useCanvasTransform } from '../../context/CanvasTransformContext';
import { Rectangle } from './Rectangle';
import { Circle } from './Circle';
import { TextBox } from './TextBox';
import { loadCanvas, subscribeCanvas, upsertRect, upsertCircle, upsertText, deleteRect, deleteCircle, deleteText, getClientId, backfillMissingZ } from '../../services/canvas';
import type { RectData, CircleData, TextData } from '../../services/canvas';
import { useState as useReactState } from 'react';
import { DEFAULT_RECT_FILL, DEV_INSTRUMENTATION, SYNC_WORLD_THRESHOLD, MOTION_UPDATE_THROTTLE_MS, MOTION_WORLD_THRESHOLD, SYNC_ROTATION_THRESHOLD_DEG, MOTION_ROTATION_THRESHOLD_DEG } from '../../utils/constants';
import { publishMotion, clearMotion, subscribeToMotion, type MotionEntry } from '../../services/motion';
import { generateId } from '../../utils/helpers';
import { useTool } from '../../context/ToolContext';
import { Transformer } from 'react-konva';
import { useRef } from 'react';

const WORLD_SIZE = 5000;
const MIN_SCALE = 0.2;
const MAX_SCALE = 3;

/**
 * Canvas
 * Root canvas component. Owns local shape state and manages Firestore synchronization.
 */
export function Canvas() {
  const { containerRef, setTransform } = useCanvasTransform();
  const { tool, activeColor, setSuppressHotkeys } = useTool() as any;
  const [scale, setScale] = useState(1);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [rects, setRects] = useReactState<RectData[]>([]);
  const [circles, setCircles] = useReactState<CircleData[]>([]);
  const [texts, setTexts] = useReactState<TextData[]>([]);
  const isDraggingRef = useRef(false);
  // Firestore sync guards
  const hydratedRef = useRef(false); // becomes true after first load/snapshot
  const applyingRemoteRef = useRef(false); // true while applying remote snapshot (prevent echo saves)
  const [draft, setDraft] = useReactState<null | { id: string; x0: number; y0: number; x: number; y: number }>(null);
  const [selectedId, setSelectedId] = useReactState<string | null>(null);
  const [selectedKind, setSelectedKind] = useReactState<'rect' | 'circle' | 'text' | null>(null);
  const trRef = useRef<any>(null);
  const [editing, setEditing] = useReactState<null | { id: string; original: string; value: string }>(null);
  const editorRef = useRef<HTMLTextAreaElement | null>(null);
  const [editorStyle, setEditorStyle] = useReactState<CSSProperties>({ display: 'none' });
  const upsertDebounceRef = useRef<number>(0 as unknown as number);
  const prevActiveColorRef = useRef<string | null>(null);
  const recentMutationIdsRef = useRef<Set<string>>(new Set());
  const rememberMutationId = (id: string) => {
    recentMutationIdsRef.current.add(id);
    // Bound to last 200 ids to avoid unbounded growth
    if (recentMutationIdsRef.current.size > 200) {
      const iter = recentMutationIdsRef.current.values();
      recentMutationIdsRef.current.delete(iter.next().value as string);
    }
  };

  // Last-synced snapshots per shape id to gate streaming updates by world-unit threshold
  const lastSyncedRef = useRef<Record<string, any>>({});

  // Ephemeral motion (RTDB) state
  const [motionMap, setMotionMap] = useReactState<Record<string, MotionEntry>>({});
  const clientId = getClientId();
  const motionThrottleRef = useRef<Record<string, number>>({});

  function maybePublishMotion(id: string, entry: MotionEntry) {
    const now = performance.now();
    const last = motionThrottleRef.current[id] || 0;
    if (now - last < MOTION_UPDATE_THROTTLE_MS) return;
    motionThrottleRef.current[id] = now;
    void publishMotion(entry);
  }

  function exceedsRectThreshold(a: { x: number; y: number; width: number; height: number }, b: { x: number; y: number; width: number; height: number }) {
    return (
      Math.abs(a.x - b.x) >= SYNC_WORLD_THRESHOLD ||
      Math.abs(a.y - b.y) >= SYNC_WORLD_THRESHOLD ||
      Math.abs(a.width - b.width) >= SYNC_WORLD_THRESHOLD ||
      Math.abs(a.height - b.height) >= SYNC_WORLD_THRESHOLD
    );
  }

  function exceedsRectOrTextWithRotationThreshold(
    a: { x: number; y: number; width: number; height: number; rotation?: number },
    b: { x: number; y: number; width: number; height: number; rotation?: number }
  ) {
    const base = exceedsRectThreshold(a, b);
    const ra = (a.rotation ?? 0) % 360;
    const rb = (b.rotation ?? 0) % 360;
    const rdiff = Math.abs(ra - rb);
    return base || rdiff >= SYNC_ROTATION_THRESHOLD_DEG;
  }

  function exceedsCircleThreshold(a: { cx: number; cy: number; radius: number }, b: { cx: number; cy: number; radius: number }) {
    return (
      Math.abs(a.cx - b.cx) >= SYNC_WORLD_THRESHOLD ||
      Math.abs(a.cy - b.cy) >= SYNC_WORLD_THRESHOLD ||
      Math.abs(a.radius - b.radius) >= SYNC_WORLD_THRESHOLD
    );
  }

  // Throttlers for mid-drag streaming upserts per id
  const dragThrottleRef = useRef<Record<string, number>>({});
  const scheduleUpsert = useRef<Record<string, number>>({});
  const THROTTLE_MS = 80;
  const throttleUpsert = (id: string, fn: () => void) => {
    const now = Date.now();
    const last = dragThrottleRef.current[id] || 0;
    if (now - last >= THROTTLE_MS) {
      dragThrottleRef.current[id] = now;
      fn();
    } else {
      // schedule once at the end of the window
      if (scheduleUpsert.current[id]) return;
      const delay = THROTTLE_MS - (now - last);
      scheduleUpsert.current[id] = window.setTimeout(() => {
        dragThrottleRef.current[id] = Date.now();
        scheduleUpsert.current[id] = 0 as unknown as number;
        fn();
      }, delay);
    }
  };
  // Load and subscribe on mount
  useEffect(() => {
    (async () => {
      const t0 = DEV_INSTRUMENTATION ? performance.now() : 0;
      // One-time backfill to ensure legacy documents have z set (safe to call repeatedly)
      try { await backfillMissingZ(); } catch {}
      const initial = await loadCanvas();
      if (initial) {
        applyingRemoteRef.current = true;
        setRects(initial.rects);
        setCircles(initial.circles);
        setTexts(initial.texts);
        applyingRemoteRef.current = false;
      }
      hydratedRef.current = true;
      if (DEV_INSTRUMENTATION) console.log('[canvas] hydrated in', Math.round(performance.now() - t0), 'ms');
    })();
    const unsub = subscribeCanvas(({ state }) => {
      const t1 = DEV_INSTRUMENTATION ? performance.now() : 0;
      // Always apply remote snapshots. Echo suppression is handled by mutationIds for UI-originated writes,
      // but we still apply here to ensure same-client AI-created objects render immediately.
      applyingRemoteRef.current = true;
      setRects(state.rects);
      setCircles(state.circles);
      setTexts(state.texts);
      applyingRemoteRef.current = false;
      hydratedRef.current = true;
      if (DEV_INSTRUMENTATION) console.log('[canvas] applied remote snapshot in', Math.round(performance.now() - t1), 'ms');
    });
    const unsubMotion = subscribeToMotion((map) => {
      setMotionMap(map);
    });
    return () => { unsub(); unsubMotion(); };
  }, []);

  /** Compute the current maximum z across all shapes (or -1 when empty). */
  function getMaxZ(): number {
    let maxZ = -1;
    for (const r of rects) if ((r.z ?? 0) > maxZ) maxZ = r.z ?? 0;
    for (const c of circles) if ((c.z ?? 0) > maxZ) maxZ = c.z ?? 0;
    for (const t of texts) if ((t.z ?? 0) > maxZ) maxZ = t.z ?? 0;
    return maxZ;
  }

  /** Reorder z indices per action for a single selected item and persist changes. */
  function reorderZ(action: 'toBack' | 'down' | 'up' | 'toTop', targetId: string, targetKind: 'rect' | 'circle' | 'text') {
    type Item = { id: string; kind: 'rect' | 'circle' | 'text'; z: number };
    const items: Item[] = [
      ...rects.map((r) => ({ id: r.id, kind: 'rect' as const, z: r.z ?? 0 })),
      ...circles.map((c) => ({ id: c.id, kind: 'circle' as const, z: c.z ?? 0 })),
      ...texts.map((t) => ({ id: t.id, kind: 'text' as const, z: t.z ?? 0 })),
    ];
    items.sort((a, b) => (a.z - b.z) || a.id.localeCompare(b.id));
    const index = items.findIndex((i) => i.id === targetId && i.kind === targetKind);
    if (index < 0) return;
    if (action === 'toBack' && index > 0) {
      const [it] = items.splice(index, 1);
      items.unshift(it);
    } else if (action === 'toTop' && index < items.length - 1) {
      const [it] = items.splice(index, 1);
      items.push(it);
    } else if (action === 'down' && index > 0) {
      [items[index - 1], items[index]] = [items[index], items[index - 1]];
    } else if (action === 'up' && index < items.length - 1) {
      [items[index + 1], items[index]] = [items[index], items[index + 1]];
    }
    items.forEach((it, i) => { it.z = i; });
    const idToZ = Object.fromEntries(items.map((i) => [i.id, i.z])) as Record<string, number>;
    const changedRects = rects.filter((r) => (idToZ[r.id] ?? r.z) !== r.z).map((r) => ({ ...r, z: idToZ[r.id] ?? r.z }));
    const changedCircles = circles.filter((c) => (idToZ[c.id] ?? c.z) !== c.z).map((c) => ({ ...c, z: idToZ[c.id] ?? c.z }));
    const changedTexts = texts.filter((t) => (idToZ[t.id] ?? t.z) !== t.z).map((t) => ({ ...t, z: idToZ[t.id] ?? t.z }));
    if (changedRects.length) setRects((prev) => prev.map((r) => (idToZ[r.id] !== undefined ? { ...r, z: idToZ[r.id] } : r)));
    if (changedCircles.length) setCircles((prev) => prev.map((c) => (idToZ[c.id] !== undefined ? { ...c, z: idToZ[c.id] } : c)));
    if (changedTexts.length) setTexts((prev) => prev.map((t) => (idToZ[t.id] !== undefined ? { ...t, z: idToZ[t.id] } : t)));
    const mid = generateId('mut');
    rememberMutationId(mid);
    changedRects.forEach((r) => { void upsertRect(r, mid); });
    changedCircles.forEach((c) => { void upsertCircle(c, mid); });
    changedTexts.forEach((t) => { void upsertText(t, mid); });
  }

  // Apply recolor when user changes activeColor with an object selected
  useEffect(() => {
    if (prevActiveColorRef.current === null) {
      prevActiveColorRef.current = activeColor;
      return;
    }
    if (activeColor === prevActiveColorRef.current) return;
    prevActiveColorRef.current = activeColor;
    if (!selectedId || !selectedKind) return;
    if (selectedKind === 'rect') {
      const cur = rects.find((r) => r.id === selectedId);
      if (!cur) return;
      const next: RectData = { ...cur, fill: activeColor } as RectData;
      setRects((prev) => prev.map((r) => (r.id === cur.id ? next : r)));
      const mid = generateId('mut');
      rememberMutationId(mid);
      void upsertRect(next, mid);
    } else if (selectedKind === 'circle') {
      const cur = circles.find((c) => c.id === selectedId);
      if (!cur) return;
      const next: CircleData = { ...cur, fill: activeColor } as CircleData;
      setCircles((prev) => prev.map((c) => (c.id === cur.id ? next : c)));
      const mid = generateId('mut');
      rememberMutationId(mid);
      void upsertCircle(next, mid);
    } else if (selectedKind === 'text') {
      const cur = texts.find((t) => t.id === selectedId);
      if (!cur) return;
      const next: TextData = { ...cur, fill: activeColor } as TextData;
      setTexts((prev) => prev.map((t) => (t.id === cur.id ? next : t)));
      const mid = generateId('mut');
      rememberMutationId(mid);
      void upsertText(next, mid);
    }
  }, [activeColor, selectedId, selectedKind, rects, circles, texts]);

  /** Open an inline HTML textarea editor positioned over the Konva stage for a text node. */
  const openTextEditor = useCallback((id: string, evt?: any) => {
    const target = texts.find((t) => t.id === id);
    if (!target) return;
    // Compute on-screen position based on world coords, stage scale and position
    const left = target.x * scale + position.x;
    const top = target.y * scale + position.y;
    const widthPx = Math.max(20, target.width * scale);
    const baseHeight = 14 + 6 * 2; // fontSize 12 approx height 14 + padding*2
    const heightPx = baseHeight * scale;
    setEditing({ id, original: target.text, value: target.text });
    setSuppressHotkeys?.(true);
    setEditorStyle({
      position: 'absolute',
      left,
      top,
      width: widthPx,
      height: heightPx,
      lineHeight: `${12 * scale}px`,
      fontSize: `${12 * scale}px`,
      color: target.fill,
      background: 'transparent',
      border: '1px solid #60a5fa',
      padding: `${6 * scale}px`,
      outline: 'none',
      resize: 'none',
      overflow: 'hidden',
      zIndex: 10,
      display: 'block',
    } as CSSProperties);
    // focus on next tick
    setTimeout(() => {
      const el = editorRef.current;
      if (el) {
        el.focus();
        // approximate caret from click x within text bounds if available
        if (evt && evt.evt) {
          try {
            const stage = evt.target?.getStage?.();
            const p = stage?.getPointerPosition?.();
            if (p) {
              const localX = (p.x - position.x) / scale - target.x; // world to local
              const ratio = Math.max(0, Math.min(1, localX / Math.max(1, target.width)));
              const idx = Math.round(ratio * el.value.length);
              el.selectionStart = idx;
              el.selectionEnd = idx;
            } else {
              el.selectionStart = el.value.length;
              el.selectionEnd = el.value.length;
            }
          } catch {
            el.selectionStart = el.value.length;
            el.selectionEnd = el.value.length;
          }
        } else {
          el.selectionStart = el.value.length;
          el.selectionEnd = el.value.length;
        }
      }
    }, 0);
  }, [texts, scale, position]);

  /** Close the inline editor; optionally commit the edits to Firestore. */
  const closeTextEditor = useCallback((commit: boolean) => {
    const ed = editing;
    setEditing(null);
    setEditorStyle((s) => ({ ...s, display: 'none' }));
    setSuppressHotkeys?.(false);
    if (!ed) return;
    if (!commit) {
      // revert - no action
      return;
    }
    // Commit immediately (also clears any pending debounce)
    if (upsertDebounceRef.current) window.clearTimeout(upsertDebounceRef.current);
    const target = texts.find((t) => t.id === ed.id);
    if (!target) return;
    const next = { ...target, text: ed.value };
    setTexts((prev) => prev.map((t) => (t.id === ed.id ? next : t)));
    const mid = generateId('mut');
    rememberMutationId(mid);
    void upsertText(next, mid);
  }, [editing, texts]);

  /** Debounced text change handler that streams updates for collaborative feedback. */
  const handleEditorChange = useCallback((e: ChangeEvent<HTMLTextAreaElement>) => {
    const val = e.target.value;
    setEditing((prev) => (prev ? { ...prev, value: val } : prev));
    // Debounce live upserts for collaboration feedback
    if (upsertDebounceRef.current) window.clearTimeout(upsertDebounceRef.current);
    upsertDebounceRef.current = window.setTimeout(() => {
      const ed = editing;
      if (!ed) return;
      const target = texts.find((t) => t.id === ed.id);
      if (!target) return;
      const next = { ...target, text: val };
      setTexts((prev) => prev.map((t) => (t.id === ed.id ? next : t)));
      const mid = generateId('mut');
      rememberMutationId(mid);
      void upsertText(next, mid);
    }, 300) as unknown as number;
  }, [editing, texts]);

  // Removed full-document debounced save in favor of granular upserts/deletes
  useEffect(() => {
    if (tool !== 'select' || !trRef.current) return;
    const stage = trRef.current.getStage?.();
    if (!stage) return;
    const node = selectedId ? stage.findOne((n: any) => n?.attrs?.name === selectedId) : null;
    trRef.current.nodes(node ? [node] : []);
    trRef.current.getLayer()?.batchDraw();
  }, [tool, selectedId, rects, circles, texts]);

  /** Mouse wheel zoom handler that zooms about the pointer and maintains cursor focus. */
  const handleWheel = useCallback((e: any) => {
    e.evt.preventDefault();
    const stage = e.target.getStage();
    const oldScale = stage.scaleX();
    const pointer = stage.getPointerPosition();
    if (!pointer) return;

    const scaleBy = 1.05;
    const direction = e.evt.deltaY > 0 ? -1 : 1;
    const newScale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, direction > 0 ? oldScale * scaleBy : oldScale / scaleBy));

    const mousePointTo = {
      x: (pointer.x - stage.x()) / oldScale,
      y: (pointer.y - stage.y()) / oldScale,
    };

    stage.scale({ x: newScale, y: newScale });
    const newPos = {
      x: pointer.x - mousePointTo.x * newScale,
      y: pointer.y - mousePointTo.y * newScale,
    };
    stage.position(newPos);
    stage.batchDraw();
    setScale(newScale);
    setPosition(newPos);
    setTransform({ scale: newScale, position: newPos });
  }, []);

  return (
    <div ref={containerRef} style={{ width: '100%', height: '100%', position: 'relative' }}>
      <Stage
        width={window.innerWidth}
        height={window.innerHeight - 60}
        draggable={tool === 'pan'}
        dragDistance={5}
        onWheel={handleWheel}
        scaleX={scale}
        scaleY={scale}
        x={position.x}
        y={position.y}
        onDragStart={(e) => {
          if (tool === 'pan' && e.target === e.currentTarget) {
            // only when the Stage itself begins dragging
            isDraggingRef.current = true;
          }
        }}
        onDragEnd={(e) => {
          if (tool === 'pan' && e.target === e.currentTarget) {
            isDraggingRef.current = false;
            const next = { x: e.target.x(), y: e.target.y() };
            setPosition(next);
            setTransform({ scale, position: next });
          }
        }}
        onMouseDown={(e) => {
          isDraggingRef.current = false;
          if (tool === 'select') return;
          if (tool !== 'rect' && tool !== 'circle' && tool !== 'text') return;
          const stage = e.target.getStage();
          const p = stage?.getPointerPosition();
          if (!p) return;
          const x0 = (p.x - position.x) / scale;
          const y0 = (p.y - position.y) / scale;
          setDraft({ id: generateId(tool), x0, y0, x: x0, y: y0 });
        }}
        onMouseMove={(e) => {
          if (tool !== 'rect' && tool !== 'circle' && tool !== 'text') return;
          if (!draft) return;
          const stage = e.target.getStage();
          const p = stage?.getPointerPosition();
          if (!p) return;
          const xw = (p.x - position.x) / scale;
          const yw = (p.y - position.y) / scale;
          setDraft({ ...draft, x: xw, y: yw });
        }}
        onMouseUp={(e) => {
          if (tool === 'rect' || tool === 'circle' || tool === 'text') {
            const d = draft;
            setDraft(null);
            if (!d) return;
            const x = Math.min(d.x0, d.x);
            const y = Math.min(d.y0, d.y);
            const width = Math.max(1, Math.abs(d.x - d.x0));
            const height = Math.max(1, Math.abs(d.y - d.y0));
            if (tool === 'rect') {
              const rect = { id: d.id, x, y, width, height, fill: activeColor || DEFAULT_RECT_FILL, rotation: 0, z: getMaxZ() + 1 };
              setRects((prev) => [...prev, rect]);
              const mid = generateId('mut');
              rememberMutationId(mid);
              void upsertRect(rect, mid);
            } else if (tool === 'circle') {
              const size = Math.max(width, height); // preserve 1:1
              const cx = x + size / 2;
              const cy = y + size / 2;
              const circle = { id: d.id, cx, cy, radius: size / 2, fill: activeColor || DEFAULT_RECT_FILL, z: getMaxZ() + 1 };
              setCircles((prev) => [...prev, circle]);
              const mid = generateId('mut');
              rememberMutationId(mid);
              void upsertCircle(circle, mid);
            } else if (tool === 'text') {
              const DEFAULT_TEXT_HEIGHT = 26; // approx line height + padding
              const text = { id: d.id, x, y, width, height: DEFAULT_TEXT_HEIGHT, text: 'Text', fill: activeColor || '#ffffff', rotation: 0, z: getMaxZ() + 1 };
              setTexts((prev) => [...prev, text]);
              const mid = generateId('mut');
              rememberMutationId(mid);
              void upsertText(text, mid);
            }
            return;
          }
          if (tool === 'erase') {
            const stage = e.target.getStage();
            const p = stage?.getPointerPosition();
            if (!p || !stage) return;
            const shape = stage.getIntersection(p);
            if (!shape) return;
            // Walk up to a node with a name (we set name=id on shapes/groups)
            let node: any = shape;
            while (node && !node.name() && node.getParent()) node = node.getParent();
            const targetId: string | undefined = node?.name();
            if (!targetId) return;
            const hadRect = !!rects.find((r) => r.id === targetId);
            const hadCircle = !!circles.find((c) => c.id === targetId);
            const hadText = !!texts.find((t) => t.id === targetId);
            setRects((prev) => prev.filter((r) => r.id !== targetId));
            setCircles((prev) => prev.filter((c) => c.id !== targetId));
            setTexts((prev) => prev.filter((t) => t.id !== targetId));
            if (hadRect) void deleteRect(targetId);
            if (hadCircle) void deleteCircle(targetId);
            if (hadText) void deleteText(targetId);
          }
        }}
      >
        <Layer
          onClick={(e) => {
            if (tool !== 'select') return;
            const stage = e.target.getStage();
            const emptyClick = e.target === e.currentTarget || e.target === stage;
            if (emptyClick) {
              setSelectedId(null);
              setSelectedKind(null);
              trRef.current?.nodes([]);
              trRef.current?.getLayer()?.batchDraw();
              if (editing) closeTextEditor(true);
              return;
            }
            // Walk up from clicked node to find the first ancestor with a name (our Group/shape root)
            let node: any = e.target;
            while (node && !node?.attrs?.name && node !== stage) node = node.getParent();
            const id = node?.attrs?.name as string | undefined;
            if (!id) return;
            if (rects.find((r) => r.id === id)) setSelectedKind('rect');
            else if (circles.find((c) => c.id === id)) setSelectedKind('circle');
            else if (texts.find((t) => t.id === id)) setSelectedKind('text');
            setSelectedId(id);
            // If clicking outside a text node while editing, commit edit
            if (editing && editing.id !== id) closeTextEditor(true);
          }}
        >
          <Rect x={0} y={0} width={WORLD_SIZE} height={WORLD_SIZE} fill={'#111827'} onMouseDown={() => {
            // Deselect when clicking blank canvas, also close editor
            if (tool !== 'select') return;
            setSelectedId(null);
            setSelectedKind(null);
            trRef.current?.nodes([]);
            trRef.current?.getLayer()?.batchDraw();
            if (editing) closeTextEditor(true);
          }} />
          {(() => {
            type Item = { id: string; kind: 'rect' | 'circle' | 'text'; z: number; render: () => any };
            const items: Item[] = [];
            for (const r of rects) {
              const m = motionMap[r.id];
              const useMotion = m && m.clientId !== clientId && m.kind === 'rect';
              const rx = useMotion ? (m.x ?? r.x) : r.x;
              const ry = useMotion ? (m.y ?? r.y) : r.y;
              const rwidth = useMotion ? (m.width ?? r.width) : r.width;
              const rheight = useMotion ? (m.height ?? r.height) : r.height;
              const rrotation = useMotion ? (m.rotation ?? (r.rotation ?? 0)) : (r.rotation ?? 0);
              items.push({ id: r.id, kind: 'rect', z: r.z ?? 0, render: () => (
                <Rectangle key={r.id} id={r.id} x={rx} y={ry} width={rwidth} height={rheight} fill={r.fill} rotation={rrotation} draggable={tool === 'pan' || tool === 'select'} onDragMove={(pos) => {
                  if (tool !== 'pan' && tool !== 'select') return;
                  const prevSnapshot = r;
                  const next = { ...r, ...pos };
                  setRects((prev) => prev.map((x) => (x.id === r.id ? next : x)));
                  if (Math.abs(pos.x - r.x) >= MOTION_WORLD_THRESHOLD || Math.abs(pos.y - r.y) >= MOTION_WORLD_THRESHOLD) {
                    maybePublishMotion(r.id, { id: r.id, kind: 'rect', clientId, updatedAt: Date.now(), x: next.x, y: next.y, width: next.width, height: next.height, rotation: r.rotation ?? 0 });
                  }
                  const last = lastSyncedRef.current[r.id] ?? prevSnapshot;
                  if (!lastSyncedRef.current[r.id]) lastSyncedRef.current[r.id] = prevSnapshot;
                  if (exceedsRectOrTextWithRotationThreshold(last as any, next as any)) {
                    lastSyncedRef.current[r.id] = next;
                    throttleUpsert(r.id, () => {
                      const mid = generateId('mut');
                      rememberMutationId(mid);
                      void upsertRect(next, mid);
                    });
                  }
                }} onDragEnd={(pos) => {
                  const next = { ...r, ...pos };
                  setRects((prev) => prev.map((x) => (x.id === r.id ? next : x)));
                  const mid = generateId('mut');
                  rememberMutationId(mid);
                  lastSyncedRef.current[r.id] = next;
                  void clearMotion(r.id);
                  void upsertRect(next, mid);
                }} />
              )});
            }
            for (const c of circles) {
              const m = motionMap[c.id];
              const useMotion = m && m.clientId !== clientId && m.kind === 'circle';
              const cx = useMotion ? (m.cx ?? c.cx) : c.cx;
              const cy = useMotion ? (m.cy ?? c.cy) : c.cy;
              const cr = useMotion ? (m.radius ?? c.radius) : c.radius;
              items.push({ id: c.id, kind: 'circle', z: c.z ?? 0, render: () => (
                <Circle key={c.id} id={c.id} x={cx} y={cy} radius={cr} fill={c.fill} draggable={tool === 'pan' || tool === 'select'} onDragMove={(pos) => {
                  if (tool !== 'pan' && tool !== 'select') return;
                  const prevSnapshot = c;
                  const next = { ...c, cx: pos.x, cy: pos.y };
                  setCircles((prev) => prev.map((x) => (x.id === c.id ? next : x)));
                  if (Math.abs(pos.x - c.cx) >= MOTION_WORLD_THRESHOLD || Math.abs(pos.y - c.cy) >= MOTION_WORLD_THRESHOLD) {
                    maybePublishMotion(c.id, { id: c.id, kind: 'circle', clientId, updatedAt: Date.now(), cx: next.cx, cy: next.cy, radius: next.radius });
                  }
                  const last = lastSyncedRef.current[c.id] ?? prevSnapshot;
                  if (!lastSyncedRef.current[c.id]) lastSyncedRef.current[c.id] = prevSnapshot;
                  if (exceedsCircleThreshold(last, next)) {
                    lastSyncedRef.current[c.id] = next;
                    throttleUpsert(c.id, () => {
                      const mid = generateId('mut');
                      rememberMutationId(mid);
                      void upsertCircle(next, mid);
                    });
                  }
                }} onDragEnd={(pos) => {
                  const next = { ...c, cx: pos.x, cy: pos.y };
                  setCircles((prev) => prev.map((x) => (x.id === c.id ? next : x)));
                  const mid = generateId('mut');
                  rememberMutationId(mid);
                  lastSyncedRef.current[c.id] = next;
                  void clearMotion(c.id);
                  void upsertCircle(next, mid);
                }} />
              )});
            }
            for (const t of texts) {
              const m = motionMap[t.id];
              const useMotion = m && m.clientId !== clientId && m.kind === 'text';
              const tx = useMotion ? (m.x ?? t.x) : t.x;
              const ty = useMotion ? (m.y ?? t.y) : t.y;
              const tw = useMotion ? (m.width ?? t.width) : t.width;
              const th = useMotion ? (m.height ?? t.height) : t.height;
              const trot = useMotion ? (m.rotation ?? (t.rotation ?? 0)) : (t.rotation ?? 0);
              items.push({ id: t.id, kind: 'text', z: t.z ?? 0, render: () => (
                <TextBox key={t.id} id={t.id} x={tx} y={ty} width={tw} height={th} text={t.text} fill={t.fill} rotation={trot} selected={tool === 'select' && selectedId === t.id} editing={!!editing && editing.id === t.id} draggable={tool === 'pan' || tool === 'select'} onDragMove={(pos) => {
                  if (tool !== 'pan' && tool !== 'select') return;
                  const prevSnapshot = t;
                  const next = { ...t, ...pos };
                  setTexts((prev) => prev.map((x) => (x.id === t.id ? next : x)));
                  if (Math.abs(pos.x - t.x) >= MOTION_WORLD_THRESHOLD || Math.abs(pos.y - t.y) >= MOTION_WORLD_THRESHOLD) {
                    maybePublishMotion(t.id, { id: t.id, kind: 'text', clientId, updatedAt: Date.now(), x: next.x, y: next.y, width: next.width, height: next.height });
                  }
                  const last = lastSyncedRef.current[t.id] ?? prevSnapshot;
                  if (!lastSyncedRef.current[t.id]) lastSyncedRef.current[t.id] = prevSnapshot;
                  if (exceedsRectThreshold(last as any, next as any)) {
                    lastSyncedRef.current[t.id] = next;
                    throttleUpsert(t.id, () => {
                      const mid = generateId('mut');
                      rememberMutationId(mid);
                      void upsertText(next, mid);
                    });
                  }
                }} onDragEnd={(pos) => {
                  const next = { ...t, ...pos };
                  setTexts((prev) => prev.map((x) => (x.id === t.id ? next : x)));
                  const mid = generateId('mut');
                  rememberMutationId(mid);
                  lastSyncedRef.current[t.id] = next;
                  void clearMotion(t.id);
                  void upsertText(next, mid);
                }} onMeasured={() => { /* no-op: child measures itself */ }} onRequestEdit={(evt) => {
                  if (tool !== 'select') return;
                  if (selectedId !== t.id) return; // require selection first
                  openTextEditor(t.id, evt);
                }} />
              )});
            }
            items.sort((a, b) => (a.z - b.z) || (a.kind === b.kind ? a.id.localeCompare(b.id) : a.kind.localeCompare(b.kind)));
            return items.map((it) => it.render());
          })()}
          
          {tool === 'select' && selectedId && (
            <Transformer
              ref={trRef}
              anchorSize={8}
              rotateEnabled={selectedKind !== 'circle'}
              enabledAnchors={selectedKind === 'circle' ? ['top-left', 'top-right', 'bottom-left', 'bottom-right'] : ['top-left','top-center','top-right','middle-left','middle-right','bottom-left','bottom-center','bottom-right']}
              boundBoxFunc={(_, newBox) => {
                if (selectedKind === 'circle') {
                  const size = Math.max(newBox.width, newBox.height);
                  return { ...newBox, width: size, height: size };
                }
                return newBox;
              }}
              onTransform={() => {
                const stage = trRef.current?.getStage?.();
                const node = stage?.findOne((n: any) => n?.attrs?.name === selectedId);
                if (!node) return;
                if (selectedKind === 'rect') {
                  const id = selectedId as string;
                  const current = rects.find((r) => r.id === id);
                  if (!current) return;
                  const w = Math.max(1, current.width * node.scaleX());
                  const h = Math.max(1, current.height * node.scaleY());
                  node.scale({ x: 1, y: 1 });
                  const rotation = node.rotation?.() ?? 0;
                  const next = { id, x: node.x(), y: node.y(), width: w, height: h, fill: current.fill, rotation, z: current.z };
                  setRects((prev) => prev.map((r) => (r.id === id ? next : r)));
                  const last = lastSyncedRef.current[id] ?? current;
                  if (!lastSyncedRef.current[id]) lastSyncedRef.current[id] = current;
                  if (exceedsRectOrTextWithRotationThreshold(last as any, next as any)) {
                    lastSyncedRef.current[id] = next;
                    throttleUpsert(id, () => {
                      const mid = generateId('mut');
                      rememberMutationId(mid);
                      void upsertRect(next, mid);
                    });
                  }
                  // stream motion updates with rotation
                  if (
                    Math.abs((next.x - current.x)) >= MOTION_WORLD_THRESHOLD ||
                    Math.abs((next.y - current.y)) >= MOTION_WORLD_THRESHOLD ||
                    Math.abs((next.width - current.width)) >= MOTION_WORLD_THRESHOLD ||
                    Math.abs((next.height - current.height)) >= MOTION_WORLD_THRESHOLD ||
                    Math.abs(((current.rotation ?? 0) - (next.rotation ?? 0))) >= MOTION_ROTATION_THRESHOLD_DEG
                  ) {
                    maybePublishMotion(id, { id, kind: 'rect', clientId, updatedAt: Date.now(), x: next.x, y: next.y, width: next.width, height: next.height, rotation: next.rotation });
                  }
                  return;
                }
                if (selectedKind === 'circle') {
                  const id = selectedId as string;
                  const current = circles.find((c) => c.id === id);
                  if (!current) return;
                  const radius = Math.max(1, (current.radius) * node.scaleX());
                  node.scale({ x: 1, y: 1 });
                  const next: CircleData = { id, cx: node.x(), cy: node.y(), radius, fill: current.fill, z: current.z };
                  setCircles((prev) => prev.map((c) => (c.id === id ? (next as CircleData) : c)));
                  const last = lastSyncedRef.current[id] ?? current;
                  if (!lastSyncedRef.current[id]) lastSyncedRef.current[id] = current;
                  if (exceedsCircleThreshold(last as any, next as any)) {
                    lastSyncedRef.current[id] = next;
                    throttleUpsert(id, () => {
                      const mid = generateId('mut');
                      rememberMutationId(mid);
                      void upsertCircle(next, mid);
                    });
                  }
                  return;
                }
                if (selectedKind === 'text') {
                  const id = selectedId as string;
                  const current = texts.find((t) => t.id === id);
                  if (!current) return;
                  const newWidth = Math.max(20, current.width * node.scaleX());
                  const newHeight = Math.max(14 + 12, current.height * node.scaleY());
                  node.scale({ x: 1, y: 1 });
                  const rotation = node.rotation?.() ?? 0;
                  const next = { id, x: node.x(), y: node.y(), width: newWidth, height: newHeight, text: current.text, fill: current.fill, rotation, z: current.z };
                  setTexts((prev) => prev.map((t) => (t.id === id ? next : t)));
                  const last = lastSyncedRef.current[id] ?? current;
                  if (!lastSyncedRef.current[id]) lastSyncedRef.current[id] = current;
                  if (exceedsRectOrTextWithRotationThreshold(last as any, next as any)) {
                    lastSyncedRef.current[id] = next;
                    throttleUpsert(id, () => {
                      const mid = generateId('mut');
                      rememberMutationId(mid);
                      void upsertText(next, mid);
                    });
                  }
                  if (
                    Math.abs((next.x - current.x)) >= MOTION_WORLD_THRESHOLD ||
                    Math.abs((next.y - current.y)) >= MOTION_WORLD_THRESHOLD ||
                    Math.abs((next.width - current.width)) >= MOTION_WORLD_THRESHOLD ||
                    Math.abs((next.height - current.height)) >= MOTION_WORLD_THRESHOLD ||
                    Math.abs(((current.rotation ?? 0) - (next.rotation ?? 0))) >= MOTION_ROTATION_THRESHOLD_DEG
                  ) {
                    maybePublishMotion(id, { id, kind: 'text', clientId, updatedAt: Date.now(), x: next.x, y: next.y, width: next.width, height: next.height, rotation: next.rotation });
                  }
                }
              }}
              onTransformEnd={() => {
                const stage = trRef.current?.getStage?.();
                const node = stage?.findOne((n: any) => n.attrs?.name === selectedId);
                if (!node) return;
                const id = selectedId as string;
                if (selectedKind === 'rect') {
                  const current = rects.find((r) => r.id === id);
                  const w = Math.max(1, (current?.width ?? node.width()) * node.scaleX());
                  const h = Math.max(1, (current?.height ?? node.height()) * node.scaleY());
                  node.scale({ x: 1, y: 1 });
                  const rotation = node.rotation?.() ?? (current?.rotation ?? 0);
                  const next = { id, x: node.x(), y: node.y(), width: w, height: h, fill: current?.fill || DEFAULT_RECT_FILL, rotation, z: current?.z ?? 0 };
                  setRects((prev) => prev.map((r) => (r.id === id ? next : r)));
                  const mid = generateId('mut');
                  recentMutationIdsRef.current.add(mid);
                  lastSyncedRef.current[id] = next;
                  void upsertRect(next, mid);
                } else if (selectedKind === 'circle') {
                  const current = circles.find((c) => c.id === id);
                  const radius = Math.max(1, (current?.radius ?? node.radius?.() ?? node.width() / 2) * node.scaleX());
                  node.scale({ x: 1, y: 1 });
                  const next: CircleData = { id, cx: node.x(), cy: node.y(), radius, fill: current?.fill || DEFAULT_RECT_FILL, z: current?.z ?? 0 };
                  setCircles((prev) => prev.map((c) => (c.id === id ? (next as CircleData) : c)));
                  const mid = generateId('mut');
                  recentMutationIdsRef.current.add(mid);
                  lastSyncedRef.current[id] = next;
                  void upsertCircle(next, mid);
                } else if (selectedKind === 'text') {
                  const current = texts.find((t) => t.id === id);
                  if (!current) return;
                  const newWidth = Math.max(20, current.width * node.scaleX());
                  const newHeight = Math.max(14 + 12, current.height * node.scaleY());
                  node.scale({ x: 1, y: 1 });
                  const rotation = node.rotation?.() ?? (current.rotation ?? 0);
                  const next = { id, x: node.x(), y: node.y(), width: newWidth, height: newHeight, text: current.text, fill: current.fill, rotation, z: current.z };
                  setTexts((prev) => prev.map((t) => (t.id === id ? next : t)));
                  const mid = generateId('mut');
                  recentMutationIdsRef.current.add(mid);
                  lastSyncedRef.current[id] = next;
                  void upsertText(next, mid);
                }
              }}
            />
          )}
          {/* Draft preview */}
          {(tool === 'rect' || tool === 'circle' || tool === 'text') && draft && (
            (() => {
              const d = draft!;
              const x = Math.min(d.x0, d.x);
              const y = Math.min(d.y0, d.y);
              const width = Math.max(1, Math.abs(d.x - d.x0));
              const height = Math.max(1, Math.abs(d.y - d.y0));
              if (tool === 'rect') return <Rect x={x} y={y} width={width} height={height} fill={DEFAULT_RECT_FILL} />;
              if (tool === 'circle') {
                const size = Math.max(width, height);
                const cx = x + size / 2;
                const cy = y + size / 2;
                return <Circle id={d.id} x={cx} y={cy} radius={size / 2} fill={DEFAULT_RECT_FILL} />;
              }
              if (tool === 'text') return <TextBox id={d.id} x={x} y={y} width={width} height={26} text={'Text'} fill={'#ffffff'} rotation={0} />;
              return null;
            })()
          )}
        </Layer>
      </Stage>
      {/* Selection toolbar pinned to middle-left (visible only in select mode with a selection) */}
      {tool === 'select' && selectedId && (
        <div style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', display: 'flex', flexDirection: 'column', gap: 8, background: '#111827', border: '1px solid #374151', padding: 8, borderRadius: 6, zIndex: 20 }}>
          <button onClick={() => selectedId && selectedKind && reorderZ('toBack', selectedId, selectedKind)} style={{ color: '#e5e7eb', background: '#1f2937', border: '1px solid #374151', padding: '6px 8px', borderRadius: 4 }}>move to back</button>
          <button onClick={() => selectedId && selectedKind && reorderZ('down', selectedId, selectedKind)} style={{ color: '#e5e7eb', background: '#1f2937', border: '1px solid #374151', padding: '6px 8px', borderRadius: 4 }}>move down one layer</button>
          <button onClick={() => selectedId && selectedKind && reorderZ('up', selectedId, selectedKind)} style={{ color: '#e5e7eb', background: '#1f2937', border: '1px solid #374151', padding: '6px 8px', borderRadius: 4 }}>move up one layer</button>
          <button onClick={() => selectedId && selectedKind && reorderZ('toTop', selectedId, selectedKind)} style={{ color: '#e5e7eb', background: '#1f2937', border: '1px solid #374151', padding: '6px 8px', borderRadius: 4 }}>move to top</button>
        </div>
      )}
      {/* Inline text editor overlay */}
      {editing && (
        <textarea
          ref={editorRef}
          style={editorStyle}
          value={editing.value}
          onChange={handleEditorChange}
          onBlur={() => closeTextEditor(true)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              closeTextEditor(true);
            } else if (e.key === 'Escape') {
              e.preventDefault();
              closeTextEditor(false);
            }
          }}
        />
      )}
    </div>
  );
}


