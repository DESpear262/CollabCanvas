/*
  File: Canvas.tsx
  Overview: Interactive collaborative canvas built on react-konva with pan/zoom, draw, select, edit.
  Features:
    - Pan/zoom the Stage; draw rect/circle/text; select and transform; erase.
    - Granular Firestore upserts with mutation echo suppression.
    - Inline HTML textarea overlay for text editing with proper world<->screen math.
*/
import { useCallback, useState, useEffect } from 'react';
import type { CSSProperties, ChangeEvent } from 'react';
import { Stage, Layer, Rect } from 'react-konva';
import { useCanvasTransform } from '../../context/CanvasTransformContext';
import { Rectangle } from './Rectangle';
import { Circle } from './Circle';
import { TextBox } from './TextBox';
import { loadCanvas, subscribeCanvas, getClientId, upsertRect, upsertCircle, upsertText, deleteRect, deleteCircle, deleteText } from '../../services/canvas';
import { useState as useReactState } from 'react';
import { DEFAULT_RECT_FILL, DEV_INSTRUMENTATION } from '../../utils/constants';
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
  const [rects, setRects] = useReactState<Array<{ id: string; x: number; y: number; width: number; height: number; fill: string }>>([]);
  const [circles, setCircles] = useReactState<Array<{ id: string; cx: number; cy: number; radius: number; fill: string }>>([]);
  const [texts, setTexts] = useReactState<Array<{ id: string; x: number; y: number; width: number; height: number; text: string; fill: string }>>([]);
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
    const unsub = subscribeCanvas(({ state, client, mutationIds }) => {
      const t1 = DEV_INSTRUMENTATION ? performance.now() : 0;
      // Avoid echoing our own writes
      if (client && client === getClientId()) return;
      // If snapshot only includes our recent mutationIds, ignore
      if (mutationIds && mutationIds.length > 0) {
        const hasForeign = mutationIds.some((id) => id && !recentMutationIdsRef.current.has(id));
        if (!hasForeign) return;
      }
      applyingRemoteRef.current = true;
      setRects(state.rects);
      setCircles(state.circles);
      setTexts(state.texts);
      applyingRemoteRef.current = false;
      hydratedRef.current = true;
      if (DEV_INSTRUMENTATION) console.log('[canvas] applied remote snapshot in', Math.round(performance.now() - t1), 'ms');
    });
    return () => unsub();
  }, []);

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
      const next = { ...cur, fill: activeColor };
      setRects((prev) => prev.map((r) => (r.id === cur.id ? next : r)));
      const mid = generateId('mut');
      rememberMutationId(mid);
      void upsertRect(next, mid);
    } else if (selectedKind === 'circle') {
      const cur = circles.find((c) => c.id === selectedId);
      if (!cur) return;
      const next = { ...cur, fill: activeColor };
      setCircles((prev) => prev.map((c) => (c.id === cur.id ? next : c)));
      const mid = generateId('mut');
      rememberMutationId(mid);
      void upsertCircle(next, mid);
    } else if (selectedKind === 'text') {
      const cur = texts.find((t) => t.id === selectedId);
      if (!cur) return;
      const next = { ...cur, fill: activeColor };
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
              const rect = { id: d.id, x, y, width, height, fill: activeColor || DEFAULT_RECT_FILL };
              setRects((prev) => [...prev, rect]);
              const mid = generateId('mut');
              rememberMutationId(mid);
              void upsertRect(rect, mid);
            } else if (tool === 'circle') {
              const size = Math.max(width, height); // preserve 1:1
              const cx = x + size / 2;
              const cy = y + size / 2;
              const circle = { id: d.id, cx, cy, radius: size / 2, fill: activeColor || DEFAULT_RECT_FILL };
              setCircles((prev) => [...prev, circle]);
              const mid = generateId('mut');
              rememberMutationId(mid);
              void upsertCircle(circle, mid);
            } else if (tool === 'text') {
              const DEFAULT_TEXT_HEIGHT = 26; // approx line height + padding
              const text = { id: d.id, x, y, width, height: DEFAULT_TEXT_HEIGHT, text: 'Text', fill: activeColor || '#ffffff' };
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
          {rects.map((r) => (
            <Rectangle key={r.id} {...r} draggable={tool === 'pan' || tool === 'select'} onDragMove={(pos) => {
              if (tool !== 'pan' && tool !== 'select') return;
              const next = { ...r, ...pos };
              setRects((prev) => prev.map((x) => (x.id === r.id ? next : x)));
              throttleUpsert(r.id, () => {
                const mid = generateId('mut');
                rememberMutationId(mid);
                void upsertRect(next, mid);
              });
            }} onDragEnd={(pos) => {
              const next = { ...r, ...pos };
              setRects((prev) => prev.map((x) => (x.id === r.id ? next : x)));
              const mid = generateId('mut');
              rememberMutationId(mid);
              void upsertRect(next, mid);
            }} />
          ))}
          {circles.map((c) => (
            <Circle key={c.id} id={c.id} x={c.cx} y={c.cy} radius={c.radius} fill={c.fill} draggable={tool === 'pan' || tool === 'select'} onDragMove={(pos) => {
              if (tool !== 'pan' && tool !== 'select') return;
              const next = { ...c, cx: pos.x, cy: pos.y };
              setCircles((prev) => prev.map((x) => (x.id === c.id ? next : x)));
              throttleUpsert(c.id, () => {
                const mid = generateId('mut');
                rememberMutationId(mid);
                void upsertCircle(next, mid);
              });
            }} onDragEnd={(pos) => {
              const next = { ...c, cx: pos.x, cy: pos.y };
              setCircles((prev) => prev.map((x) => (x.id === c.id ? next : x)));
              const mid = generateId('mut');
              rememberMutationId(mid);
              void upsertCircle(next, mid);
            }} />
          ))}
          {texts.map((t) => (
            <TextBox key={t.id} id={t.id} x={t.x} y={t.y} width={t.width} height={t.height} text={t.text} fill={t.fill} selected={tool === 'select' && selectedId === t.id} editing={!!editing && editing.id === t.id} draggable={tool === 'pan' || tool === 'select'} onDragMove={(pos) => {
              if (tool !== 'pan' && tool !== 'select') return;
              const next = { ...t, ...pos };
              setTexts((prev) => prev.map((x) => (x.id === t.id ? next : x)));
              throttleUpsert(t.id, () => {
                const mid = generateId('mut');
                rememberMutationId(mid);
                void upsertText(next, mid);
              });
            }} onDragEnd={(pos) => {
              const next = { ...t, ...pos };
              setTexts((prev) => prev.map((x) => (x.id === t.id ? next : x)));
              const mid = generateId('mut');
              rememberMutationId(mid);
              void upsertText(next, mid);
            }} onMeasured={() => { /* no-op: child measures itself */ }} onRequestEdit={(evt) => {
              if (tool !== 'select') return;
              if (selectedId !== t.id) return; // require selection first
              openTextEditor(t.id, evt);
            }} />
          ))}
          {tool === 'select' && selectedId && (
            <Transformer
              ref={trRef}
              anchorSize={8}
              rotateEnabled={false}
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
                  const next = { id, x: node.x(), y: node.y(), width: w, height: h, fill: current.fill };
                  setRects((prev) => prev.map((r) => (r.id === id ? next : r)));
                  throttleUpsert(id, () => {
                    const mid = generateId('mut');
                    rememberMutationId(mid);
                    void upsertRect(next, mid);
                  });
                  return;
                }
                if (selectedKind === 'circle') {
                  const id = selectedId as string;
                  const current = circles.find((c) => c.id === id);
                  if (!current) return;
                  const radius = Math.max(1, (current.radius) * node.scaleX());
                  node.scale({ x: 1, y: 1 });
                  const next = { id, cx: node.x(), cy: node.y(), radius, fill: current.fill };
                  setCircles((prev) => prev.map((c) => (c.id === id ? next : c)));
                  throttleUpsert(id, () => {
                    const mid = generateId('mut');
                    rememberMutationId(mid);
                    void upsertCircle(next, mid);
                  });
                  return;
                }
                if (selectedKind === 'text') {
                  const id = selectedId as string;
                  const current = texts.find((t) => t.id === id);
                  if (!current) return;
                  const newWidth = Math.max(20, current.width * node.scaleX());
                  const newHeight = Math.max(14 + 12, current.height * node.scaleY());
                  node.scale({ x: 1, y: 1 });
                  const next = { id, x: node.x(), y: node.y(), width: newWidth, height: newHeight, text: current.text, fill: current.fill };
                  setTexts((prev) => prev.map((t) => (t.id === id ? next : t)));
                  throttleUpsert(id, () => {
                    const mid = generateId('mut');
                    rememberMutationId(mid);
                    void upsertText(next, mid);
                  });
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
                  const next = { id, x: node.x(), y: node.y(), width: w, height: h, fill: current?.fill || DEFAULT_RECT_FILL };
                  setRects((prev) => prev.map((r) => (r.id === id ? next : r)));
                  const mid = generateId('mut');
                  recentMutationIdsRef.current.add(mid);
                  void upsertRect(next, mid);
                } else if (selectedKind === 'circle') {
                  const current = circles.find((c) => c.id === id);
                  const radius = Math.max(1, (current?.radius ?? node.radius?.() ?? node.width() / 2) * node.scaleX());
                  node.scale({ x: 1, y: 1 });
                  const next = { id, cx: node.x(), cy: node.y(), radius, fill: current?.fill || DEFAULT_RECT_FILL };
                  setCircles((prev) => prev.map((c) => (c.id === id ? next : c)));
                  const mid = generateId('mut');
                  recentMutationIdsRef.current.add(mid);
                  void upsertCircle(next, mid);
                } else if (selectedKind === 'text') {
                  const current = texts.find((t) => t.id === id);
                  if (!current) return;
                  const newWidth = Math.max(20, current.width * node.scaleX());
                  const newHeight = Math.max(14 + 12, current.height * node.scaleY());
                  node.scale({ x: 1, y: 1 });
                  const next = { id, x: node.x(), y: node.y(), width: newWidth, height: newHeight, text: current.text, fill: current.fill };
                  setTexts((prev) => prev.map((t) => (t.id === id ? next : t)));
                  const mid = generateId('mut');
                  recentMutationIdsRef.current.add(mid);
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
              if (tool === 'text') return <TextBox id={d.id} x={x} y={y} width={width} height={26} text={'Text'} fill={'#ffffff'} />;
              return null;
            })()
          )}
        </Layer>
      </Stage>
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


