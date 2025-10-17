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
import { Stage, Layer, Rect, Line, Transformer } from 'react-konva';
import { useCanvasTransform } from '../../context/CanvasTransformContext';
import { Rectangle } from './Rectangle';
import { Circle } from './Circle';
import { TextBox } from './TextBox';
import { loadCanvas, subscribeCanvas, upsertRect, upsertCircle, upsertText, deleteRect, deleteCircle, deleteText, getClientId, upsertGroup, deleteGroup } from '../../services/canvas';
import type { RectData, CircleData, TextData, GroupData, GroupChild } from '../../services/canvas';
import { useState as useReactState } from 'react';
import { DEFAULT_RECT_FILL, DEV_INSTRUMENTATION, SYNC_WORLD_THRESHOLD, MOTION_UPDATE_THROTTLE_MS, MOTION_WORLD_THRESHOLD, SYNC_ROTATION_THRESHOLD_DEG } from '../../utils/constants';
import { publishMotion, clearMotion, subscribeToMotion, type MotionEntry } from '../../services/motion';
import { generateId } from '../../utils/helpers';
import { useTool } from '../../context/ToolContext';
import { useRef } from 'react';
import { recordCreate, recordDelete, recordUpdate } from '../../services/history';
import { ContextMenu } from './ContextMenu';
import { useSelection } from '../../context/SelectionContext';
import { SelectionToolbar } from './SelectionToolbar';
import { GroupToolbar } from './GroupToolbar';
import { GroupOverlay } from './GroupOverlay';
import { Marquee } from './Marquee';
import { Lasso } from './Lasso';

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
  // LEGACY SINGLE-SELECTION (kept for easy rollback; safe to delete when PR#24 is stable)
  // const [selectedId, setSelectedId] = useReactState<string | null>(null);
  // const [selectedKind, setSelectedKind] = useReactState<'rect' | 'circle' | 'text' | null>(null);
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
  // History: capture pre-drag/transform snapshots per id
  const beforeSnapshotRef = useRef<Record<string, any>>({});

  // Ephemeral motion (RTDB) state
  const [motionMap, setMotionMap] = useReactState<Record<string, MotionEntry>>({});
  const clientId = getClientId();
  const motionThrottleRef = useRef<Record<string, number>>({});
  // Middle-mouse button pan state (active regardless of selected tool)
  const [mmbPanning, setMmbPanning] = useReactState(false);
  const { selectedIds: multiSelectedIds, idToKind: multiIdToKind, setSelection, toggleSelection, clearSelection } = useSelection();
  const [menuPos, setMenuPos] = useReactState<null | { x: number; y: number }>(null);
  // Selection mode state (boolean ops for point-select; area-select WIP)
  const [primaryMode, setPrimaryMode] = useReactState<'point' | 'rect' | 'lasso'>('point');
  const [booleanMode, setBooleanMode] = useReactState<'new' | 'union' | 'intersect' | 'difference'>('new');

  // Selection gesture state
  const [marquee, setMarquee] = useReactState<null | { x: number; y: number; w: number; h: number }>(null);
  const [lassoPoints, setLassoPoints] = useReactState<Array<{ x: number; y: number }> | null>(null);
  const mouseDownWorldRef = useRef<{ x: number; y: number } | null>(null);
  const selectionDragBaseRef = useRef<{ ids: string[]; kinds: Record<string, 'rect' | 'circle' | 'text'> } | null>(null);

  // Group state
  const [groups, setGroups] = useReactState<GroupData[]>([]);
  const [activeGroupId, setActiveGroupId] = useReactState<string | null>(null);

  function buildIdToGroupMap(gs: GroupData[]): Record<string, string> {
    const map: Record<string, string> = {};
    for (const g of gs) for (const c of g.children) map[c.id] = g.id;
    return map;
  }
  const idToGroup = buildIdToGroupMap(groups);

  // Bind Shift/Tab cycling when select tool is active
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (tool !== 'select') return;
      if (e.key === 'Shift' && !e.repeat) {
        setPrimaryMode((prev) => (prev === 'point' ? 'rect' : prev === 'rect' ? 'lasso' : 'point'));
      }
      if (e.key === 'Tab') {
        e.preventDefault();
        setBooleanMode((prev) => (prev === 'new' ? 'union' : prev === 'union' ? 'intersect' : prev === 'intersect' ? 'difference' : 'new'));
      }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [tool]);

  // Keep Transformer bound to selected nodes in select/pan tools
  useEffect(() => {
    if ((tool !== 'pan' && tool !== 'select') || !trRef.current) return;
    const stage = trRef.current.getStage?.();
    if (!stage) return;
    const ids = multiSelectedIds || [];
    const nodes: any[] = [];
    for (const id of ids) {
      const n = stage.findOne((nn: any) => nn?.attrs?.name === id);
      if (n) nodes.push(n);
    }
    trRef.current.nodes(nodes);
    trRef.current.getLayer()?.batchDraw();
  }, [tool, multiSelectedIds, rects, circles, texts]);

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
      const initial = await loadCanvas();
      if (initial) {
        applyingRemoteRef.current = true;
        setRects(initial.rects);
        setCircles(initial.circles);
        setTexts(initial.texts);
        // Groups may be undefined on older docs
        setGroups(initial.groups || []);
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
      setGroups(state.groups || []);
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

  /** Removed legacy single-item z-reorder in favor of group-aware reordering. */

  /** Reorder z indices for a selection group while preserving relative order. */
  function reorderZGroup(action: 'toBack' | 'down' | 'up' | 'toTop', selection: { ids: string[]; idToKind: Record<string, 'rect' | 'circle' | 'text'> }) {
    type Item = { id: string; kind: 'rect' | 'circle' | 'text'; z: number };
    const items: Item[] = [
      ...rects.map((r) => ({ id: r.id, kind: 'rect' as const, z: r.z ?? 0 })),
      ...circles.map((c) => ({ id: c.id, kind: 'circle' as const, z: c.z ?? 0 })),
      ...texts.map((t) => ({ id: t.id, kind: 'text' as const, z: t.z ?? 0 })),
    ];
    items.sort((a, b) => (a.z - b.z) || a.id.localeCompare(b.id));
    const selSet = new Set(selection.ids);
    const hasAny = selection.ids.some((id) => selSet.has(id));
    if (!hasAny) return;
    const selectedItems = items.filter((it) => selSet.has(it.id));
    if (selectedItems.length === 0) return;
    const others = items.filter((it) => !selSet.has(it.id));
    let nextOrder: Item[] = items;
    if (action === 'toBack') {
      nextOrder = [...selectedItems, ...others];
    } else if (action === 'toTop') {
      nextOrder = [...others, ...selectedItems];
    } else if (action === 'down') {
      const firstIdx = items.findIndex((it) => selSet.has(it.id));
      if (firstIdx <= 0) return; // already at bottom
      let pivotIdx = -1;
      for (let i = firstIdx - 1; i >= 0; i--) {
        if (!selSet.has(items[i].id)) { pivotIdx = i; break; }
      }
      if (pivotIdx < 0) return;
      const pivot = items[pivotIdx];
      const pivotInOthers = others.findIndex((it) => it.id === pivot.id);
      if (pivotInOthers < 0) return;
      nextOrder = [
        ...others.slice(0, pivotInOthers),
        ...selectedItems,
        ...others.slice(pivotInOthers),
      ];
    } else if (action === 'up') {
      let lastIdx = -1;
      for (let i = items.length - 1; i >= 0; i--) {
        if (selSet.has(items[i].id)) { lastIdx = i; break; }
      }
      if (lastIdx < 0 || lastIdx >= items.length - 1) return; // already at top
      let pivotIdx = -1;
      for (let i = lastIdx + 1; i < items.length; i++) {
        if (!selSet.has(items[i].id)) { pivotIdx = i; break; }
      }
      if (pivotIdx < 0) return;
      const pivot = items[pivotIdx];
      const pivotInOthers = others.findIndex((it) => it.id === pivot.id);
      if (pivotInOthers < 0) return;
      nextOrder = [
        ...others.slice(0, pivotInOthers + 1),
        ...selectedItems,
        ...others.slice(pivotInOthers + 1),
      ];
    }
    nextOrder.forEach((it, i) => { it.z = i; });
    const idToZ = Object.fromEntries(nextOrder.map((i) => [i.id, i.z])) as Record<string, number>;
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

  function getCurrentSelection(): { ids: string[]; idToKind: Record<string, 'rect' | 'circle' | 'text'> } | null {
    if (multiSelectedIds && multiSelectedIds.length > 0) return { ids: multiSelectedIds, idToKind: multiIdToKind as any };
    // if (selectedId && selectedKind) return { ids: [selectedId], idToKind: { [selectedId]: selectedKind } } as any;
    return null;
  }

  // --- Group helpers & actions ---
  function getGroupById(id: string | null): GroupData | null {
    if (!id) return null;
    return groups.find((g) => g.id === id) || null;
  }

  // getBoundsForIds: removed (unused)

  function onSelectGroup(groupId: string | null) {
    if (!groupId) { setActiveGroupId(null); return; }
    // If erase tool active, delete whole group
    if (tool === 'erase') {
      const g = getGroupById(groupId);
      if (!g) return;
      // Delete all children objects
      for (const child of g.children) {
        if (child.kind === 'rect') {
          const before = rects.find((r) => r.id === child.id);
          setRects((prev) => prev.filter((r) => r.id !== child.id));
          if (before) void deleteRect(child.id);
        } else if (child.kind === 'circle') {
          const before = circles.find((c) => c.id === child.id);
          setCircles((prev) => prev.filter((c) => c.id !== child.id));
          if (before) void deleteCircle(child.id);
        } else if (child.kind === 'text') {
          const before = texts.find((t) => t.id === child.id);
          setTexts((prev) => prev.filter((t) => t.id !== child.id));
          if (before) void deleteText(child.id);
        }
      }
      // Delete group record
      setGroups((prev) => prev.filter((gg) => gg.id !== groupId));
      void deleteGroup(groupId);
      clearSelection();
      setActiveGroupId(null);
      return;
    }
    // Normal select: set active and select its members as objects
    const g = getGroupById(groupId);
    if (!g) { setActiveGroupId(null); return; }
    const ids = g.children.map((c) => c.id);
    const kinds: Record<string, 'rect' | 'circle' | 'text'> = {};
    for (const c of g.children) kinds[c.id] = c.kind;
    setSelection(ids, kinds);
    setActiveGroupId(groupId);
  }

  function onGroupAction() {
    // Group: selection has no members of existing groups
    const sel = getCurrentSelection();
    if (!sel) return;
    const ids = sel.ids;
    if (ids.length < 2) return;
    const children: GroupChild[] = ids.map((id) => ({ id, kind: sel.idToKind[id] }));
    const z = Math.max(
      -1,
      ...ids.map((id) => {
        const k = sel.idToKind[id];
        if (k === 'rect') return rects.find((r) => r.id === id)?.z ?? 0;
        if (k === 'circle') return circles.find((c) => c.id === id)?.z ?? 0;
        return texts.find((t) => t.id === id)?.z ?? 0;
      })
    );
    const group: GroupData = { id: generateId('group'), children, z: Math.max(0, z) };
    setGroups((prev) => [...prev, group]);
    void upsertGroup(group);
    setActiveGroupId(group.id);
  }

  function onRegroupAction() {
    const sel = getCurrentSelection();
    if (!sel) return;
    const ids = sel.ids;
    if (!ids.length) return;
    // Remove selected ids from any existing groups
    const selectedSet = new Set(ids);
    const updates: GroupData[] = [];
    const removals: string[] = [];
    for (const g of groups) {
      const remaining = g.children.filter((c) => !selectedSet.has(c.id));
      if (remaining.length === g.children.length) continue; // no change
      if (remaining.length === 0) {
        removals.push(g.id);
      } else {
        const updated: GroupData = { ...g, children: remaining };
        updates.push(updated);
      }
    }
    // Apply updates/removals
    if (updates.length) {
      setGroups((prev) => prev.map((g) => updates.find((u) => u.id === g.id) || g));
      updates.forEach((u) => void upsertGroup(u));
    }
    if (removals.length) {
      setGroups((prev) => prev.filter((g) => !removals.includes(g.id)));
      removals.forEach((id) => void deleteGroup(id));
    }
    // Create new group with exactly the selected ids
    const children: GroupChild[] = ids.map((id) => ({ id, kind: sel.idToKind[id] }));
    const z = Math.max(
      -1,
      ...ids.map((id) => {
        const k = sel.idToKind[id];
        if (k === 'rect') return rects.find((r) => r.id === id)?.z ?? 0;
        if (k === 'circle') return circles.find((c) => c.id === id)?.z ?? 0;
        return texts.find((t) => t.id === id)?.z ?? 0;
      })
    );
    const group: GroupData = { id: generateId('group'), children, z: Math.max(0, z) };
    setGroups((prev) => [...prev, group]);
    void upsertGroup(group);
    setActiveGroupId(group.id);
  }

  function onUngroupAction() {
    // Prefer active group; else exact selection match
    const gid = activeGroupId || ((): string | null => {
      const sel = getCurrentSelection();
      if (!sel) return null;
      for (const g of groups) {
        if (g.children.length !== sel.ids.length) continue;
        const set = new Set(sel.ids);
        if (g.children.every((c) => set.has(c.id))) return g.id;
      }
      return null;
    })();
    if (!gid) return;
    setGroups((prev) => prev.filter((g) => g.id !== gid));
    void deleteGroup(gid);
    setActiveGroupId(null);
  }

  // Apply recolor when activeColor changes and there is a selection (multi or single)
  useEffect(() => {
    if (prevActiveColorRef.current === null) {
      prevActiveColorRef.current = activeColor;
      return;
    }
    if (activeColor === prevActiveColorRef.current) return;
    prevActiveColorRef.current = activeColor;
    const ids = multiSelectedIds || [];
    if (!ids.length) return;
    recolorSelected(activeColor);
  }, [activeColor, multiSelectedIds]);

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
    // history: text edit as update (before original text)
    const before = { kind: 'text', ...target } as any;
    const after = { kind: 'text', ...next } as any;
    recordUpdate([{ kind: 'text', id: target.id, before, after } as any]);
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
      // live stream edits are not recorded to history until commit to avoid spam
    }, 300) as unknown as number;
  }, [editing, texts]);

  // Removed full-document debounced save in favor of granular upserts/deletes
  // LEGACY SINGLE-SELECTION TRANSFORMER (commented during PR#24; delete if not needed)
  // useEffect(() => {
  //   if (tool !== 'select' || !trRef.current) return;
  //   const stage = trRef.current.getStage?.();
  //   if (!stage) return;
  //   const node = selectedId ? stage.findOne((n: any) => n?.attrs?.name === selectedId) : null;
  //   trRef.current.nodes(node ? [node] : []);
  //   trRef.current.getLayer()?.batchDraw();
  // }, [tool, selectedId, rects, circles, texts]);

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

  function rectIntersects(ax1: number, ay1: number, ax2: number, ay2: number, bx1: number, by1: number, bx2: number, by2: number) {
    return ax1 <= bx2 && ax2 >= bx1 && ay1 <= by2 && ay2 >= by1;
  }

  function combineSelectionWithMode(nextIds: string[], nextKinds: Record<string, 'rect' | 'circle' | 'text'>) {
    const baseIds = selectionDragBaseRef.current ? selectionDragBaseRef.current.ids : (multiSelectedIds || []);
    const baseKinds = selectionDragBaseRef.current ? selectionDragBaseRef.current.kinds : (multiIdToKind as Record<string, 'rect' | 'circle' | 'text'>);
    if (booleanMode === 'new') {
      // Do not clear selection live if nothing is inside the marquee/lasso
      if (nextIds.length === 0) return;
      setSelection(nextIds, nextKinds);
      return;
    }
    if (booleanMode === 'union') {
      const set = new Set<string>([...baseIds, ...nextIds]);
      const ids = Array.from(set);
      const kinds = { ...baseKinds, ...nextKinds };
      setSelection(ids, kinds);
      return;
    }
    if (booleanMode === 'intersect') {
      const set = new Set<string>(baseIds);
      const ids = nextIds.filter((x) => set.has(x));
      const kinds: Record<string, 'rect' | 'circle' | 'text'> = {};
      for (const id of ids) kinds[id] = nextKinds[id] || baseKinds[id];
      setSelection(ids, kinds);
      return;
    }
    // difference (XOR semantics against current)
    const set = new Set<string>(baseIds);
    const kinds: Record<string, 'rect' | 'circle' | 'text'> = { ...baseKinds };
    for (const id of nextIds) {
      if (set.has(id)) {
        set.delete(id);
        delete kinds[id];
      } else {
        set.add(id);
        kinds[id] = nextKinds[id];
      }
    }
    setSelection(Array.from(set), kinds);
  }

  function applyAreaSelectionRect(bounds: { x: number; y: number; w: number; h: number }) {
    const bx1 = Math.min(bounds.x, bounds.x + bounds.w);
    const by1 = Math.min(bounds.y, bounds.y + bounds.h);
    const bx2 = Math.max(bounds.x, bounds.x + bounds.w);
    const by2 = Math.max(bounds.y, bounds.y + bounds.h);
    const nextIds: string[] = [];
    const nextKinds: Record<string, 'rect' | 'circle' | 'text'> = {};
    for (const r of rects) {
      const ax1 = r.x, ay1 = r.y, ax2 = r.x + r.width, ay2 = r.y + r.height;
      if (rectIntersects(ax1, ay1, ax2, ay2, bx1, by1, bx2, by2)) { nextIds.push(r.id); nextKinds[r.id] = 'rect'; }
    }
    for (const c of circles) {
      const ax1 = c.cx - c.radius, ay1 = c.cy - c.radius, ax2 = c.cx + c.radius, ay2 = c.cy + c.radius;
      if (rectIntersects(ax1, ay1, ax2, ay2, bx1, by1, bx2, by2)) { nextIds.push(c.id); nextKinds[c.id] = 'circle'; }
    }
    for (const t of texts) {
      const ax1 = t.x, ay1 = t.y, ax2 = t.x + t.width, ay2 = t.y + t.height;
      if (rectIntersects(ax1, ay1, ax2, ay2, bx1, by1, bx2, by2)) { nextIds.push(t.id); nextKinds[t.id] = 'text'; }
    }
    combineSelectionWithMode(nextIds, nextKinds);
  }

  function applyAreaSelectionLasso(points: Array<{ x: number; y: number }>) {
    // Use bounding box intersect for performance (approximate)
    if (!points.length) return;
    let minX = points[0].x, maxX = points[0].x, minY = points[0].y, maxY = points[0].y;
    for (const p of points) { if (p.x < minX) minX = p.x; if (p.x > maxX) maxX = p.x; if (p.y < minY) minY = p.y; if (p.y > maxY) maxY = p.y; }
    applyAreaSelectionRect({ x: minX, y: minY, w: maxX - minX, h: maxY - minY });
  }

  // Convert current pointer to world coords using the Stage's live position/scale
  function getWorldPointer(stage: any): { x: number; y: number } | null {
    const p = stage?.getPointerPosition?.();
    if (!p) return null;
    const sx = stage.x?.() ?? stage.x;
    const sy = stage.y?.() ?? stage.y;
    const sc = stage.scaleX?.() ?? stage.scaleX;
    return { x: (p.x - sx) / sc, y: (p.y - sy) / sc };
  }

  // --- Batch operations helpers (PR #25) ---
  function getSelectionBounds() {
    const ids = multiSelectedIds || [];
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const id of ids) {
      const kind = (multiIdToKind as any)[id] as 'rect' | 'circle' | 'text';
      if (kind === 'rect') {
        const r = rects.find((x) => x.id === id);
        if (!r) continue;
        minX = Math.min(minX, r.x); minY = Math.min(minY, r.y);
        maxX = Math.max(maxX, r.x + r.width); maxY = Math.max(maxY, r.y + r.height);
      } else if (kind === 'circle') {
        const c = circles.find((x) => x.id === id);
        if (!c) continue;
        minX = Math.min(minX, c.cx - c.radius); minY = Math.min(minY, c.cy - c.radius);
        maxX = Math.max(maxX, c.cx + c.radius); maxY = Math.max(maxY, c.cy + c.radius);
      } else if (kind === 'text') {
        const t = texts.find((x) => x.id === id);
        if (!t) continue;
        minX = Math.min(minX, t.x); minY = Math.min(minY, t.y);
        maxX = Math.max(maxX, t.x + t.width); maxY = Math.max(maxY, t.y + t.height);
      }
    }
    if (!isFinite(minX) || !isFinite(minY) || !isFinite(maxX) || !isFinite(maxY)) return null;
    const width = Math.max(0, maxX - minX);
    const height = Math.max(0, maxY - minY);
    return { x: minX, y: minY, width, height, centerX: minX + width / 2, centerY: minY + height / 2 };
  }
  function moveSelectedBy(dx: number, dy: number) {
    const ids = multiSelectedIds || [];
    if (!ids.length) return;
    const mid = generateId('mut');
    // rects
    setRects((prev) => prev.map((r) => ids.includes(r.id) ? { ...r, x: r.x + dx, y: r.y + dy } : r));
    setCircles((prev) => prev.map((c) => ids.includes(c.id) ? { ...c, cx: c.cx + dx, cy: c.cy + dy } : c));
    setTexts((prev) => prev.map((t) => ids.includes(t.id) ? { ...t, x: t.x + dx, y: t.y + dy } : t));
    rects.filter((r) => ids.includes(r.id)).forEach((r) => void upsertRect({ ...r, x: r.x + dx, y: r.y + dy }, mid));
    circles.filter((c) => ids.includes(c.id)).forEach((c) => void upsertCircle({ ...c, cx: c.cx + dx, cy: c.cy + dy }, mid));
    texts.filter((t) => ids.includes(t.id)).forEach((t) => void upsertText({ ...t, x: t.x + dx, y: t.y + dy }, mid));
  }

  function recolorSelected(color?: string) {
    const ids = multiSelectedIds || [];
    if (!ids.length) return;
    const newColor = color || activeColor;
    const mid = generateId('mut');
    const changes: any[] = [];
    // Collect before/after for history
    for (const id of ids) {
      const kind = (multiIdToKind as any)[id] as 'rect' | 'circle' | 'text';
      if (kind === 'rect') {
        const cur = rects.find((r) => r.id === id);
        if (!cur) continue;
        const after = { ...cur, fill: newColor };
        changes.push({ kind: 'rect', id, before: { kind: 'rect', ...cur }, after: { kind: 'rect', ...after } });
      } else if (kind === 'circle') {
        const cur = circles.find((c) => c.id === id);
        if (!cur) continue;
        const after = { ...cur, fill: newColor };
        changes.push({ kind: 'circle', id, before: { kind: 'circle', ...cur }, after: { kind: 'circle', ...after } });
      } else if (kind === 'text') {
        const cur = texts.find((t) => t.id === id);
        if (!cur) continue;
        const after = { ...cur, fill: newColor };
        changes.push({ kind: 'text', id, before: { kind: 'text', ...cur }, after: { kind: 'text', ...after } });
      }
    }
    setRects((prev) => prev.map((r) => ids.includes(r.id) ? { ...r, fill: newColor } : r));
    setCircles((prev) => prev.map((c) => ids.includes(c.id) ? { ...c, fill: newColor } : c));
    setTexts((prev) => prev.map((t) => ids.includes(t.id) ? { ...t, fill: newColor } : t));
    rects.filter((r) => ids.includes(r.id)).forEach((r) => void upsertRect({ ...r, fill: newColor }, mid));
    circles.filter((c) => ids.includes(c.id)).forEach((c) => void upsertCircle({ ...c, fill: newColor }, mid));
    texts.filter((t) => ids.includes(t.id)).forEach((t) => void upsertText({ ...t, fill: newColor }, mid));
    if (changes.length) recordUpdate(changes as any);
  }

  function deleteSelected() {
    const ids = multiSelectedIds || [];
    if (!ids.length) return;
    const del: any[] = [];
    ids.forEach((id) => {
      const kind = (multiIdToKind as any)[id] as 'rect' | 'circle' | 'text';
      if (kind === 'rect') {
        const before = rects.find((r) => r.id === id);
        setRects((prev) => prev.filter((r) => r.id !== id));
        if (before) { del.push({ kind: 'rect', ...before }); void deleteRect(id); }
      } else if (kind === 'circle') {
        const before = circles.find((c) => c.id === id);
        setCircles((prev) => prev.filter((c) => c.id !== id));
        if (before) { del.push({ kind: 'circle', ...before }); void deleteCircle(id); }
      } else if (kind === 'text') {
        const before = texts.find((t) => t.id === id);
        setTexts((prev) => prev.filter((t) => t.id !== id));
        if (before) { del.push({ kind: 'text', ...before }); void deleteText(id); }
      }
    });
    if (del.length) recordDelete(del as any);
    // Clear selection after delete
    clearSelection();
  }

  return (
    <div ref={containerRef} style={{ width: '100%', height: '100%', position: 'relative' }} onContextMenu={(e) => {
      const sel = getCurrentSelection();
      if (!sel || sel.ids.length === 0) return; // allow default menu with no selection
      e.preventDefault();
      setMenuPos({ x: e.clientX, y: e.clientY });
    }}>
      <Stage
        width={window.innerWidth}
        height={window.innerHeight - 60}
        draggable={tool === 'pan' || mmbPanning}
        dragDistance={5}
        onWheel={handleWheel}
        scaleX={scale}
        scaleY={scale}
        x={position.x}
        y={position.y}
        onDragStart={(e) => {
          if ((tool === 'pan' || mmbPanning) && e.target === e.currentTarget) {
            // only when the Stage itself begins dragging
            isDraggingRef.current = true;
          }
        }}
        onDragEnd={(e) => {
          if ((tool === 'pan' || mmbPanning) && e.target === e.currentTarget) {
            isDraggingRef.current = false;
            const next = { x: e.target.x(), y: e.target.y() };
            setPosition(next);
            setTransform({ scale, position: next });
          }
        }}
        onMouseDown={(e) => {
          isDraggingRef.current = false;
          if (e.evt && e.evt.button === 1) {
            // Middle mouse pans in any tool
            e.evt.preventDefault();
            // Ensure stage drag begins even if pointer is over a child node
            try { const stage: any = e.target.getStage && e.target.getStage(); stage?.startDrag && stage.startDrag(); } catch {}
            // Stop further processing by children
            e.cancelBubble = true;
            setMmbPanning(true);
            mouseDownWorldRef.current = null;
            selectionDragBaseRef.current = null;
            return;
          }
          if (tool === 'select') {
            const stage = e.target.getStage();
            const wp = getWorldPointer(stage);
            if (!wp) return;
            const xw = wp.x;
            const yw = wp.y;
            mouseDownWorldRef.current = { x: xw, y: yw } as any;
            selectionDragBaseRef.current = { ids: [...(multiSelectedIds || [])], kinds: { ...(multiIdToKind as any) } };
            if (primaryMode === 'rect') {
              setMarquee({ x: xw, y: yw, w: 0, h: 0 } as any);
              setLassoPoints(null as any);
            } else if (primaryMode === 'lasso') {
              setLassoPoints([{ x: xw, y: yw }] as any);
              setMarquee(null as any);
            } else {
              // point mode → handled by Layer onClick
            }
            return;
          }
          if (tool !== 'rect' && tool !== 'circle' && tool !== 'text') return;
          const stage = e.target.getStage();
          const wp = getWorldPointer(stage);
          if (!wp) return;
          const x0 = wp.x;
          const y0 = wp.y;
          setDraft({ id: generateId(tool), x0, y0, x: x0, y: y0 });
        }}
        onMouseMove={(e) => {
          if (tool === 'select') {
            const stage = e.target.getStage();
            const wp = getWorldPointer(stage);
            if (!wp) return;
            const xw = wp.x;
            const yw = wp.y;
            // Start marquee/lasso after 5px threshold from mousedown
            if (!marquee && !lassoPoints && mouseDownWorldRef.current) {
              const dx = xw - mouseDownWorldRef.current.x;
              const dy = yw - mouseDownWorldRef.current.y;
              if (Math.hypot(dx, dy) >= 5) {
                if (primaryMode === 'rect') {
                  setMarquee({ x: mouseDownWorldRef.current.x, y: mouseDownWorldRef.current.y, w: 0, h: 0 } as any);
                } else if (primaryMode === 'lasso') {
                  setLassoPoints([{ x: mouseDownWorldRef.current.x, y: mouseDownWorldRef.current.y }] as any);
                }
              }
            }
            if (marquee) {
              const next = { ...marquee, w: xw - marquee.x, h: yw - marquee.y } as any;
              setMarquee(next);
              // live update selection
              applyAreaSelectionRect({ x: next.x, y: next.y, w: next.w, h: next.h });
              return;
            }
            if (lassoPoints) {
              const pts = [...lassoPoints, { x: xw, y: yw }];
              setLassoPoints(pts as any);
              applyAreaSelectionLasso(pts);
              return;
            }
          }
          if (tool !== 'rect' && tool !== 'circle' && tool !== 'text') return;
          if (!draft) return;
          const stage = e.target.getStage();
          const wp = getWorldPointer(stage);
          if (!wp) return;
          const xw = wp.x;
          const yw = wp.y;
          setDraft({ ...draft, x: xw, y: yw });
        }}
        onMouseUp={(e) => {
          // Handle MMB release without affecting draw logic
          if (e.evt && e.evt.button === 1) {
            e.evt.preventDefault();
            setMmbPanning(false);
            mouseDownWorldRef.current = null;
            selectionDragBaseRef.current = null;
            return;
          }
          if (tool === 'select') {
            if (e.evt && e.evt.button === 2) {
              // cancel on right-click
              setMarquee(null as any);
              setLassoPoints(null as any);
              mouseDownWorldRef.current = null;
              selectionDragBaseRef.current = null;
              return;
            }
            // finalize; live selection already applied
            setMarquee(null as any);
            setLassoPoints(null as any);
            // If this was a simple click (<5px) on empty space, clear selection
            const stage = e.target.getStage();
            const wp = getWorldPointer(stage);
            if (wp && mouseDownWorldRef.current) {
              const xw = wp.x;
              const yw = wp.y;
              const dx = xw - mouseDownWorldRef.current.x;
              const dy = yw - mouseDownWorldRef.current.y;
              const wasClick = Math.hypot(dx, dy) < 5;
              if (wasClick) {
                // resolve top-most named node at point
                const pt = stage?.getPointerPosition?.();
                const shape = pt ? stage?.getIntersection?.(pt) : null;
                let node: any = shape;
                while (node && !node?.attrs?.name && node !== stage) node = node.getParent?.();
                const id = node?.attrs?.name as string | undefined;
                if (!id) {
                  clearSelection();
                }
              }
            }
            mouseDownWorldRef.current = null;
            selectionDragBaseRef.current = null;
            return;
          }
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
              // history: record create
              if (import.meta.env.DEV) { try { console.log('[history] recordCreate(rect)'); } catch {} }
              recordCreate([{ kind: 'rect', ...rect } as any]);
            } else if (tool === 'circle') {
              const size = Math.max(width, height); // preserve 1:1
              const cx = x + size / 2;
              const cy = y + size / 2;
              const circle = { id: d.id, cx, cy, radius: size / 2, fill: activeColor || DEFAULT_RECT_FILL, z: getMaxZ() + 1 };
              setCircles((prev) => [...prev, circle]);
              const mid = generateId('mut');
              rememberMutationId(mid);
              void upsertCircle(circle, mid);
              if (import.meta.env.DEV) { try { console.log('[history] recordCreate(circle)'); } catch {} }
              recordCreate([{ kind: 'circle', ...circle } as any]);
            } else if (tool === 'text') {
              const DEFAULT_TEXT_HEIGHT = 26; // approx line height + padding
              const text = { id: d.id, x, y, width, height: DEFAULT_TEXT_HEIGHT, text: 'Text', fill: activeColor || '#ffffff', rotation: 0, z: getMaxZ() + 1 };
              setTexts((prev) => [...prev, text]);
              const mid = generateId('mut');
              rememberMutationId(mid);
              void upsertText(text, mid);
              if (import.meta.env.DEV) { try { console.log('[history] recordCreate(text)'); } catch {} }
              recordCreate([{ kind: 'text', ...text } as any]);
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
            const rectBefore = rects.find((r) => r.id === targetId);
            const circleBefore = circles.find((c) => c.id === targetId);
            const textBefore = texts.find((t) => t.id === targetId);
            setRects((prev) => prev.filter((r) => r.id !== targetId));
            setCircles((prev) => prev.filter((c) => c.id !== targetId));
            setTexts((prev) => prev.filter((t) => t.id !== targetId));
            if (rectBefore) void deleteRect(targetId);
            if (circleBefore) void deleteCircle(targetId);
            if (textBefore) void deleteText(targetId);
            // history: record delete with full snapshots
            const del: any[] = [];
            if (rectBefore) del.push({ kind: 'rect', ...rectBefore });
            if (circleBefore) del.push({ kind: 'circle', ...circleBefore });
            if (textBefore) del.push({ kind: 'text', ...textBefore });
            if (del.length) { if (import.meta.env.DEV) { try { console.log('[history] recordDelete(erase)', del.length); } catch {} } recordDelete(del as any); }
          }
        }}
      >
        <Layer
          onClick={(e) => {
            if (tool !== 'select') return;
            const stage = e.target.getStage();
            // Pick top-most node with a name (id)
            let node: any = e.target;
            while (node && !node?.attrs?.name && node !== stage) node = node.getParent();
            const id = node?.attrs?.name as string | undefined;
            if (!id) return; // clearing handled in mouseup with tolerance
            const kind = rects.find((r) => r.id === id) ? 'rect' : circles.find((c) => c.id === id) ? 'circle' : texts.find((t) => t.id === id) ? 'text' : null;
            if (!kind) return;
            // Apply boolean mode
            const currentIds = multiSelectedIds || [];
            if (booleanMode === 'new') {
              // Clear then set single via toggle
              clearSelection();
              toggleSelection(id, kind);
            } else if (booleanMode === 'union') {
              if (!currentIds.includes(id)) toggleSelection(id, kind);
            } else if (booleanMode === 'intersect') {
              // Keep only if it was already selected; else clear
              if (!currentIds.includes(id)) {
                clearSelection();
              }
            } else {
              // difference: toggle selection state
              toggleSelection(id, kind);
            }
            if (editing && !(multiSelectedIds || []).includes(editing.id)) closeTextEditor(true);
          }}
        >
          <Rect x={0} y={0} width={WORLD_SIZE} height={WORLD_SIZE} fill={'#111827'} onMouseDown={() => {
            // In select mode, background down no longer immediately clears; mouseup with <5px will clear
            if (tool !== 'select') return;
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
                <Rectangle key={r.id} id={r.id} x={rx} y={ry} width={rwidth} height={rheight} fill={r.fill} rotation={rrotation} draggable={tool === 'pan'} onDragStart={() => {
                  if (tool !== 'pan') return;
                  beforeSnapshotRef.current[r.id] = { kind: 'rect', ...r };
                }} onDragMove={(pos) => {
                  if (tool !== 'pan') return;
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
                  // history: record update once per drag
                  const before = beforeSnapshotRef.current[r.id] || { kind: 'rect', ...r };
                  delete beforeSnapshotRef.current[r.id];
                  if (import.meta.env.DEV) { try { console.log('[history] recordUpdate(rect dragEnd)', r.id); } catch {} }
                  recordUpdate([{ kind: 'rect', id: r.id, before, after: { kind: 'rect', ...next } } as any]);
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
                <Circle key={c.id} id={c.id} x={cx} y={cy} radius={cr} fill={c.fill} draggable={tool === 'pan'} onDragStart={() => {
                  if (tool !== 'pan') return;
                  beforeSnapshotRef.current[c.id] = { kind: 'circle', ...c };
                }} onDragMove={(pos) => {
                  if (tool !== 'pan') return;
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
                  const before = beforeSnapshotRef.current[c.id] || { kind: 'circle', ...c };
                  delete beforeSnapshotRef.current[c.id];
                  if (import.meta.env.DEV) { try { console.log('[history] recordUpdate(circle dragEnd)', c.id); } catch {} }
                  recordUpdate([{ kind: 'circle', id: c.id, before, after: { kind: 'circle', ...next } } as any]);
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
                <TextBox key={t.id} id={t.id} x={tx} y={ty} width={tw} height={th} text={t.text} fill={t.fill} rotation={trot} selected={false} editing={!!editing && editing.id === t.id} draggable={tool === 'pan'} onDragStart={() => {
                  if (tool !== 'pan') return;
                  beforeSnapshotRef.current[t.id] = { kind: 'text', ...t };
                }} onDragMove={(pos) => {
                  if (tool !== 'pan') return;
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
                  const before = beforeSnapshotRef.current[t.id] || { kind: 'text', ...t };
                  delete beforeSnapshotRef.current[t.id];
                  if (import.meta.env.DEV) { try { console.log('[history] recordUpdate(text dragEnd)', t.id); } catch {} }
                  recordUpdate([{ kind: 'text', id: t.id, before, after: { kind: 'text', ...next } } as any]);
                }} onMeasured={() => { /* no-op: child measures itself */ }} onRequestEdit={(evt) => {
                  if (tool !== 'select') return;
                  openTextEditor(t.id, evt);
                }} />
              )});
            }
            items.sort((a, b) => (a.z - b.z) || (a.kind === b.kind ? a.id.localeCompare(b.id) : a.kind.localeCompare(b.kind)));
            return items.map((it) => it.render());
          })()}
          {/* Marquee/Lasso visuals */}
          {tool === 'select' && marquee && (() => {
            const mx = marquee.w >= 0 ? marquee.x : marquee.x + marquee.w;
            const my = marquee.h >= 0 ? marquee.y : marquee.y + marquee.h;
            const mw = Math.abs(marquee.w);
            const mh = Math.abs(marquee.h);
            return <Marquee x={mx} y={my} width={mw} height={mh} />;
          })()}
          {tool === 'select' && lassoPoints && lassoPoints.length > 1 && (
            <Lasso points={lassoPoints} />
          )}

          {/* Selection visuals: marquee/lasso */}
          {tool === 'select' && marquee && (() => {
            const mx = Math.min(marquee.x, marquee.x + marquee.w);
            const my = Math.min(marquee.y, marquee.y + marquee.h);
            const mw = Math.abs(marquee.w);
            const mh = Math.abs(marquee.h);
            return <Rect x={mx} y={my} width={mw} height={mh} fill={'rgba(96,165,250,0.15)'} stroke={'#9ca3af'} strokeWidth={1} dash={[4,4]} listening={false} />;
          })()}
          {tool === 'select' && lassoPoints && lassoPoints.length > 1 && (
            <Line points={lassoPoints.flatMap((p) => [p.x, p.y])} closed fill={'rgba(96,165,250,0.15)'} stroke={'#9ca3af'} strokeWidth={1} dash={[4,4]} listening={false} />
          )}

          {/* Active group overlay (orange) */}
          {activeGroupId && (() => {
            const g = getGroupById(activeGroupId);
            if (!g) return null;
            let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
            for (const child of g.children) {
              if (child.kind === 'rect') {
                const r = rects.find((x) => x.id === child.id);
                if (!r) continue;
                minX = Math.min(minX, r.x); minY = Math.min(minY, r.y);
                maxX = Math.max(maxX, r.x + r.width); maxY = Math.max(maxY, r.y + r.height);
              } else if (child.kind === 'circle') {
                const c = circles.find((x) => x.id === child.id);
                if (!c) continue;
                minX = Math.min(minX, c.cx - c.radius); minY = Math.min(minY, c.cy - c.radius);
                maxX = Math.max(maxX, c.cx + c.radius); maxY = Math.max(maxY, c.cy + c.radius);
              } else if (child.kind === 'text') {
                const t = texts.find((x) => x.id === child.id);
                if (!t) continue;
                minX = Math.min(minX, t.x); minY = Math.min(minY, t.y);
                maxX = Math.max(maxX, t.x + t.width); maxY = Math.max(maxY, t.y + t.height);
              }
            }
            if (!isFinite(minX)) return null;
            const bounds = { x: minX, y: minY, width: Math.max(0, maxX - minX), height: Math.max(0, maxY - minY) };
            return <GroupOverlay bounds={bounds} />;
          })()}

          {/* Transformer: select shows hull; pan rotates; single-select in pan can resize */}
          {(tool === 'select' || tool === 'pan') && (multiSelectedIds?.length || 0) > 0 && (() => {
            const ids = multiSelectedIds || [];
            const isSingle = ids.length === 1;
            const singleKind = isSingle ? (multiIdToKind as any)[ids[0]] as ('rect' | 'circle' | 'text') : null;
            const anchorsForSingle = singleKind === 'circle'
              ? ['top-left', 'top-right', 'bottom-left', 'bottom-right']
              : ['top-left','top-center','top-right','middle-left','middle-right','bottom-left','bottom-center','bottom-right'];
            return (
              <Transformer
                ref={trRef}
                rotateEnabled={tool === 'pan'}
                enabledAnchors={tool === 'pan' && isSingle ? anchorsForSingle : []}
                boundBoxFunc={(_, newBox) => {
                  if (tool === 'pan' && isSingle && singleKind === 'circle') {
                    const size = Math.max(newBox.width, newBox.height);
                    return { ...newBox, width: size, height: size };
                  }
                  return newBox;
                }}
                onTransformEnd={() => {
                  const stage = trRef.current?.getStage?.();
                  if (!stage) return;
                  const idsNow = multiSelectedIds || [];
                  const mid = generateId('mut');
                  // Single-select with resize support
                  if (tool === 'pan' && idsNow.length === 1) {
                    const id = idsNow[0];
                    const node = stage.findOne((n: any) => n?.attrs?.name === id);
                    if (!node) return;
                    const kind = (multiIdToKind as any)[id] as 'rect' | 'circle' | 'text';
                    if (kind === 'rect') {
                      const current = rects.find((r) => r.id === id);
                      if (!current) return;
                      const w = Math.max(1, (current.width) * node.scaleX());
                      const h = Math.max(1, (current.height) * node.scaleY());
                      node.scale({ x: 1, y: 1 });
                      const rot = node.rotation?.() ?? (current.rotation ?? 0);
                      const next: RectData = { ...current, x: node.x(), y: node.y(), width: w, height: h, rotation: rot } as RectData;
                      setRects((prev) => prev.map((r) => (r.id === id ? next : r)));
                      void upsertRect(next, mid);
                      return;
                    }
                    if (kind === 'circle') {
                      const current = circles.find((c) => c.id === id);
                      if (!current) return;
                      const radius = Math.max(1, (current.radius) * node.scaleX());
                      node.scale({ x: 1, y: 1 });
                      const next: CircleData = { ...current, cx: node.x(), cy: node.y(), radius } as CircleData;
                      setCircles((prev) => prev.map((c) => (c.id === id ? next : c)));
                      void upsertCircle(next, mid);
                      return;
                    }
                    if (kind === 'text') {
                      const current = texts.find((t) => t.id === id);
                      if (!current) return;
                      const newWidth = Math.max(20, (current.width) * node.scaleX());
                      const newHeight = Math.max(14 + 12, (current.height) * node.scaleY());
                      node.scale({ x: 1, y: 1 });
                      const rot = node.rotation?.() ?? (current.rotation ?? 0);
                      const next: TextData = { ...current, x: node.x(), y: node.y(), width: newWidth, height: newHeight, rotation: rot } as TextData;
                      setTexts((prev) => prev.map((t) => (t.id === id ? next : t)));
                      void upsertText(next, mid);
                      return;
                    }
                    return;
                  }
                  // Multi-select or select tool hull: translate/rotate only, no resize persistence here
                  idsNow.forEach((id) => {
                    const node = stage.findOne((n: any) => n?.attrs?.name === id);
                    if (!node) return;
                    const kind = (multiIdToKind as any)[id] as 'rect' | 'circle' | 'text';
                    if (kind === 'rect') {
                      const current = rects.find((r) => r.id === id);
                      if (!current) return;
                      const next = { ...current, x: node.x(), y: node.y(), rotation: node.rotation?.() ?? (current.rotation ?? 0) } as RectData;
                      setRects((prev) => prev.map((r) => (r.id === id ? next : r)));
                      void upsertRect(next, mid);
                    } else if (kind === 'circle') {
                      const current = circles.find((c) => c.id === id);
                      if (!current) return;
                      const next = { ...current, cx: node.x(), cy: node.y() } as CircleData;
                      setCircles((prev) => prev.map((c) => (c.id === id ? next : c)));
                      void upsertCircle(next, mid);
                    } else if (kind === 'text') {
                      const current = texts.find((t) => t.id === id);
                      if (!current) return;
                      const next = { ...current, x: node.x(), y: node.y(), rotation: node.rotation?.() ?? (current.rotation ?? 0) } as TextData;
                      setTexts((prev) => prev.map((t) => (t.id === id ? next : t)));
                      void upsertText(next, mid);
                    }
                  });
                }}
              />
            );
          })()}

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
      {/* East-pinned Group Toolbar */}
      <GroupToolbar
        groups={groups}
        idToGroup={idToGroup}
        selectionIds={multiSelectedIds || []}
        activeGroupId={activeGroupId}
        onSelectGroup={onSelectGroup}
        onGroup={onGroupAction}
        onRegroup={onRegroupAction}
        onUngroup={onUngroupAction}
      />
      {tool === 'pan' && (multiSelectedIds?.length || 0) > 0 && (
        <div style={{ position: 'absolute', left: 12, top: 12, display: 'flex', gap: 8, background: '#111827', border: '1px solid #374151', padding: 8, borderRadius: 6, zIndex: 25 }}>
          <button onClick={() => deleteSelected()} style={{ color: '#e5e7eb', background: '#1f2937', border: '1px solid #374151', padding: '6px 8px', borderRadius: 4 }}>delete</button>
          <button onClick={() => recolorSelected()} style={{ color: '#e5e7eb', background: '#1f2937', border: '1px solid #374151', padding: '6px 8px', borderRadius: 4 }}>apply color</button>
          <button onClick={() => { const b = getSelectionBounds(); if (b) { const dx = Math.round(b.centerX - (b.x + b.width/2)); const dy = Math.round(b.centerY - (b.y + b.height/2)); if (dx || dy) moveSelectedBy(dx, dy); } }} style={{ color: '#e5e7eb', background: '#1f2937', border: '1px solid #374151', padding: '6px 8px', borderRadius: 4, display: 'none' }}>nudge</button>
        </div>
      )}
      {tool === 'select' && (
        <SelectionToolbar
          primary={primaryMode}
          booleanMode={booleanMode}
          onPrimaryChange={setPrimaryMode}
          onBooleanChange={setBooleanMode}
          selectedCount={multiSelectedIds?.length || 0}
        />
      )}
      {/* Right-click context menu for z-order actions */}
      {menuPos && tool === 'select' && (() => {
        const sel = getCurrentSelection();
        if (!sel) return null;
        return (
          <ContextMenu
            x={menuPos.x}
            y={menuPos.y}
            onClose={() => setMenuPos(null)}
            onBringToFront={() => reorderZGroup('toTop', sel)}
            onBringForward={() => reorderZGroup('up', sel)}
            onSendBackward={() => reorderZGroup('down', sel)}
            onSendToBack={() => reorderZGroup('toBack', sel)}
          />
        );
      })()}
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


