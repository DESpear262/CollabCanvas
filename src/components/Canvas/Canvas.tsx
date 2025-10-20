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
//
import { Stage, Layer, Rect, Line, Transformer } from 'react-konva';
import { useCanvasTransform } from '../../context/CanvasTransformContext';
import { Rectangle } from './Rectangle';
import { Circle } from './Circle';
import { TextBox } from './TextBox';
import { loadCanvas, subscribeCanvas, upsertRect, upsertCircle, upsertText, deleteRect, deleteCircle, deleteText, getClientId, upsertGroup, deleteGroup } from '../../services/canvas';
import type { RectData, CircleData, TextData, GroupData, GroupChild } from '../../services/canvas';
import { useState as useReactState } from 'react';
import { DEFAULT_RECT_FILL, DEV_INSTRUMENTATION, MOTION_WORLD_THRESHOLD, MIN_TEXT_WIDTH, MIN_TEXT_HEIGHT } from '../../utils/constants';
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
  import { useKeyboard } from '../../hooks/useKeyboard';
import { useTextEditor } from './hooks/useTextEditor';
import { getWorldPointer, applyAreaSelectionRect, applyAreaSelectionLasso, combineSelectionWithMode } from './helpers/geometrySelection';
import { maybePublishMotionThrottled } from './helpers/motion';
import { buildZItems, reorderZGroup as reorderZGroupUtil } from './helpers/zOrder';
import { XRAY_POINT_MAX_HITS, SELECTION_LIVE_THROTTLE_RAF } from '../../utils/constants';
import { useCanvasExport } from '../../context/CanvasExportContext';

const WORLD_SIZE = 5000;
const MIN_SCALE = 0.2;
const MAX_SCALE = 3;

/**
 * Canvas
 * Root canvas component. Owns local shape state and manages Firestore synchronization.
 */
export function Canvas({ headerHeight = 60 }: { headerHeight?: number }) {
  const { containerRef, setTransform } = useCanvasTransform();
  const { tool, activeColor, setSuppressHotkeys } = useTool() as any;
  const [scale, setScale] = useState(1);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [rects, setRects] = useReactState<RectData[]>([]);
  const [circles, setCircles] = useReactState<CircleData[]>([]);
  const [texts, setTexts] = useReactState<TextData[]>([]);
  // Transient fade-out containers for recently deleted shapes (local or remote)
  const [deletedRects, setDeletedRects] = useReactState<Record<string, RectData>>({});
  const [deletedCircles, setDeletedCircles] = useReactState<Record<string, CircleData>>({});
  const [deletedTexts, setDeletedTexts] = useReactState<Record<string, TextData>>({});
  const isDraggingRef = useRef(false);
  // Firestore sync guards
  const hydratedRef = useRef(false); // becomes true after first load/snapshot
  const applyingRemoteRef = useRef(false); // true while applying remote snapshot (prevent echo saves)
  const [draft, setDraft] = useReactState<null | { id: string; x0: number; y0: number; x: number; y: number }>(null);
  // LEGACY SINGLE-SELECTION (kept for easy rollback; safe to delete when PR#24 is stable)
  // const [selectedId, setSelectedId] = useReactState<string | null>(null);
  // const [selectedKind, setSelectedKind] = useReactState<'rect' | 'circle' | 'text' | null>(null);
  const trRef = useRef<any>(null);
  const stageRef = useRef<any>(null);
  const { registerStage, registerSceneSnapshotGetter } = useCanvasExport();
  const rememberMutationId = (id: string) => {
    recentMutationIdsRef.current.add(id);
    if (recentMutationIdsRef.current.size > 200) {
      const iter = recentMutationIdsRef.current.values();
      recentMutationIdsRef.current.delete(iter.next().value as string);
    }
  };
  const { editing, editorRef, editorStyle, openTextEditor, closeTextEditor, handleEditorChange, toolbar, updateStyle, startToolbarInteraction, endToolbarInteraction, toolbarInteractingRef } = useTextEditor({ scale, position, texts, setTexts, setSuppressHotkeys, rememberMutationId });
  const prevActiveColorRef = useRef<string | null>(null);
  const recentMutationIdsRef = useRef<Set<string>>(new Set());
  // Pending z values per id: enforce local z until remote snapshot confirms it
  const pendingZRef = useRef<Record<string, number>>({});

  // Last-synced snapshots per shape id to gate streaming updates by world-unit threshold
  const lastSyncedRef = useRef<Record<string, any>>({});
  // History: capture pre-drag/transform snapshots per id
  const beforeSnapshotRef = useRef<Record<string, any>>({});

  // Ephemeral motion (RTDB) state (coalesced via rAF)
  const motionMapRef = useRef<Record<string, MotionEntry>>({});
  const [motionTick, setMotionTick] = useReactState(0);
  const rafRef = useRef<number | null>(null);
  const clientId = getClientId();
  const motionThrottleRef = useRef<Record<string, number>>({});
  // Cache single selected node during transforms to avoid repeated stage.findOne
  const activeNodeRef = useRef<any>(null);
  // Middle-mouse button pan state (active regardless of selected tool)
  const [mmbPanning, setMmbPanning] = useReactState(false);
  const { selectedIds: multiSelectedIds, idToKind: multiIdToKind, setSelection, clearSelection } = useSelection();
  const [menuPos, setMenuPos] = useReactState<null | { x: number; y: number }>(null);
  // Selection mode state (boolean ops for point-select; area-select WIP)
  const [primaryMode, setPrimaryMode] = useReactState<'point' | 'rect' | 'lasso'>('point');
  const [booleanMode, setBooleanMode] = useReactState<'new' | 'union' | 'intersect' | 'difference'>('new');
  // Persistent x-ray toggle (resets on reload)
  const [xRay, setXRay] = useReactState<boolean>(false);
  // Transient override while holding X (stateful to update icon)
  const [xRayOverride, setXRayOverride] = useReactState<boolean>(false);
  function isXRayActive() {
    return xRayOverride ? !xRay : xRay;
  }

  // Selection gesture state
  const [marquee, setMarquee] = useReactState<null | { x: number; y: number; w: number; h: number }>(null);
  const [lassoPoints, setLassoPoints] = useReactState<Array<{ x: number; y: number }> | null>(null);
  const mouseDownWorldRef = useRef<{ x: number; y: number } | null>(null);
  const selectionDragBaseRef = useRef<{ ids: string[]; kinds: Record<string, 'rect' | 'circle' | 'text'> } | null>(null);
  // Throttle live area selection updates to rAF
  const selectionRafScheduledRef = useRef(false);
  const selectionPendingRef = useRef<null | { kind: 'rect' | 'lasso'; rect?: { x: number; y: number; w: number; h: number }; points?: Array<{ x: number; y: number }> }>(null);
  // Suppress one upcoming native contextmenu event after RMB cancel of selection
  const suppressNextContextMenuRef = useRef(false);
  // Copy/Paste clipboard state (in-memory, per client)
  const clipboardRef = useRef<{ items: Array<{ kind: 'rect'|'circle'|'text'; data: any }>; sourceCenter?: { x: number; y: number } } | null>(null);
  const lastPasteAnchorRef = useRef<{ x: number; y: number } | null>(null);

  // Group state
  const [groups, setGroups] = useReactState<GroupData[]>([]);
  const [activeGroupId, setActiveGroupId] = useReactState<string | null>(null);

  function buildIdToGroupMap(gs: GroupData[]): Record<string, string> {
    const map: Record<string, string> = {};
    for (const g of gs) for (const c of g.children) map[c.id] = g.id;
    return map;
  }
  const idToGroup = buildIdToGroupMap(groups);

  // Register stage and scene snapshot getter for export
  useEffect(() => {
    registerStage(stageRef);
    registerSceneSnapshotGetter(() => ({
      rects: rects.map((r) => ({ id: r.id, x: r.x, y: r.y, width: r.width, height: r.height })),
      circles: circles.map((c) => ({ id: c.id, cx: c.cx, cy: c.cy, radius: c.radius })),
      texts: texts.map((t) => ({ id: t.id, x: t.x, y: t.y, width: t.width, height: t.height })),
      selectionIds: multiSelectedIds || [],
      idToKind: multiIdToKind as any,
    }));
    return () => { registerSceneSnapshotGetter(null); };
  }, [rects, circles, texts, multiSelectedIds, multiIdToKind]);

  // Bind Shift/Tab cycling when select tool is active
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (tool !== 'select') return;
      if (editing) return;
      if (e.key === 'x' || e.key === 'X') {
        // Invert x-ray while held (suppressed during text editing by useKeyboard already)
        setXRayOverride(true);
      }
      if (e.key === 'Shift' && !e.repeat) {
        setPrimaryMode((prev) => (prev === 'point' ? 'rect' : prev === 'rect' ? 'lasso' : 'point'));
      }
      if (e.key === 'Tab') {
        e.preventDefault();
        setBooleanMode((prev) => (prev === 'new' ? 'union' : prev === 'union' ? 'intersect' : prev === 'intersect' ? 'difference' : 'new'));
      }
    }
    function onKeyUp(e: KeyboardEvent) {
      if (tool !== 'select') return;
      if (editing) return;
      if (e.key === 'x' || e.key === 'X') {
        setXRayOverride(false);
      }
    }
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    return () => { window.removeEventListener('keydown', onKeyDown); window.removeEventListener('keyup', onKeyUp); };
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
    activeNodeRef.current = nodes.length === 1 ? nodes[0] : null;
    trRef.current.getLayer()?.batchDraw();
  }, [tool, multiSelectedIds, rects, circles, texts]);

  function maybePublishMotion(id: string, entry: MotionEntry) {
    maybePublishMotionThrottled(id, entry, motionThrottleRef.current, publishMotion);
  }

  // Coalesce local motion updates to a single rAF tick and avoid React state churn mid-drag
  function updateLocalMotion(entry: MotionEntry) {
    motionMapRef.current[entry.id] = entry;
    if (rafRef.current == null) {
      rafRef.current = requestAnimationFrame(() => {
        rafRef.current = null;
        setMotionTick((t) => t + 1);
      });
    }
  }

  // Threshold comparison helpers moved to helpers/motion.ts

  // Removed mid-drag Firestore upsert throttling (we commit once on drag end)
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
        // Migration helper removed; names now expected to exist.
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
      // Diff previous vs incoming to stage transient fade-outs
      try {
        const nextRectIds = new Set(state.rects.map((r: RectData) => r.id));
        const nextCircleIds = new Set(state.circles.map((c: CircleData) => c.id));
        const nextTextIds = new Set(state.texts.map((t: TextData) => t.id));
        // Rects removed remotely
        rects.forEach((r) => {
          if (!nextRectIds.has(r.id)) {
            setDeletedRects((prev) => ({ ...prev, [r.id]: r }));
            setTimeout(() => setDeletedRects((prev) => { const n = { ...prev }; delete n[r.id]; return n; }), 200);
          }
        });
        circles.forEach((c) => {
          if (!nextCircleIds.has(c.id)) {
            setDeletedCircles((prev) => ({ ...prev, [c.id]: c }));
            setTimeout(() => setDeletedCircles((prev) => { const n = { ...prev }; delete n[c.id]; return n; }), 200);
          }
        });
        texts.forEach((t) => {
          if (!nextTextIds.has(t.id)) {
            setDeletedTexts((prev) => ({ ...prev, [t.id]: t }));
            setTimeout(() => setDeletedTexts((prev) => { const n = { ...prev }; delete n[t.id]; return n; }), 200);
          }
        });
      } catch {}
      // Merge remote with local, preserving any pending local z until remote matches
      const mergePreservingLocalZ = <T extends { id: string; z: number }>(incoming: T[]): T[] => {
        return incoming.map((it) => {
          const pending = pendingZRef.current[it.id];
          if (typeof pending === 'number') {
            if (pending !== it.z) {
              return { ...(it as any), z: pending } as T;
            } else {
              delete pendingZRef.current[it.id];
            }
          }
          return it;
        });
      };
      setRects(() => mergePreservingLocalZ(state.rects as any));
      setCircles(() => mergePreservingLocalZ(state.circles as any));
      setTexts(() => mergePreservingLocalZ(state.texts as any));
      setGroups(state.groups || []);
      applyingRemoteRef.current = false;
      hydratedRef.current = true;
      if (DEV_INSTRUMENTATION) console.log('[canvas] applied remote snapshot in', Math.round(performance.now() - t1), 'ms');
    });
    const unsubMotion = subscribeToMotion((map) => {
      motionMapRef.current = map;
      if (rafRef.current == null) {
        rafRef.current = requestAnimationFrame(() => {
          rafRef.current = null;
          setMotionTick((t) => t + 1);
        });
      }
    });
    return () => { if (rafRef.current != null) cancelAnimationFrame(rafRef.current); rafRef.current = null; unsub(); unsubMotion(); };
  }, []);

  // Defer RTDB motion clearing until Firestore-applied state matches committed values
  const pendingCommitRef = useRef<Record<string, { kind: 'rect'|'circle'|'text'; x?: number; y?: number; width?: number; height?: number; cx?: number; cy?: number; radius?: number }>>({});
  useEffect(() => {
    const tryClear = async (id: string) => {
      const pending = pendingCommitRef.current[id];
      if (!pending) return;
      if (pending.kind === 'rect') {
        const r = rects.find((x) => x.id === id);
        if (r && r.x === pending.x && r.y === pending.y && r.width === pending.width && r.height === pending.height) {
          delete pendingCommitRef.current[id];
          await clearMotion(id);
        }
      } else if (pending.kind === 'circle') {
        const c = circles.find((x) => x.id === id);
        if (c && c.cx === pending.cx && c.cy === pending.cy && c.radius === pending.radius) {
          delete pendingCommitRef.current[id];
          await clearMotion(id);
        }
      } else if (pending.kind === 'text') {
        const t = texts.find((x) => x.id === id);
        if (t && t.x === pending.x && t.y === pending.y && t.width === pending.width && t.height === pending.height) {
          delete pendingCommitRef.current[id];
          await clearMotion(id);
        }
      }
    };
    const ids = Object.keys(pendingCommitRef.current);
    ids.forEach((id) => { void tryClear(id); });
  }, [rects, circles, texts]);

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
    const items = buildZItems(rects, circles, texts);
    const nextOrder = reorderZGroupUtil(action, items, { ids: selection.ids, idToKind: selection.idToKind });
    const idToZ = Object.fromEntries(nextOrder.map((i) => [i.id, i.z])) as Record<string, number>;
    const changedRects = rects.filter((r) => (idToZ[r.id] ?? r.z) !== r.z).map((r) => ({ ...r, z: idToZ[r.id] ?? r.z }));
    const changedCircles = circles.filter((c) => (idToZ[c.id] ?? c.z) !== c.z).map((c) => ({ ...c, z: idToZ[c.id] ?? c.z }));
    const changedTexts = texts.filter((t) => (idToZ[t.id] ?? t.z) !== t.z).map((t) => ({ ...t, z: idToZ[t.id] ?? t.z }));
    if (changedRects.length) setRects((prev) => prev.map((r) => (idToZ[r.id] !== undefined ? { ...r, z: idToZ[r.id] } : r)));
    if (changedCircles.length) setCircles((prev) => prev.map((c) => (idToZ[c.id] !== undefined ? { ...c, z: idToZ[c.id] } : c)));
    if (changedTexts.length) setTexts((prev) => prev.map((t) => (idToZ[t.id] !== undefined ? { ...t, z: idToZ[t.id] } : t)));
    // Record pending local z values so remote snapshots won't overwrite until confirmed
    [...changedRects, ...changedCircles, ...changedTexts].forEach((it: any) => { pendingZRef.current[it.id] = it.z; });
    const mid = generateId('mut');
    rememberMutationId(mid);
    changedRects.forEach((r) => { void upsertRect(r, mid); });
    changedCircles.forEach((c) => { void upsertCircle(c, mid); });
    changedTexts.forEach((t) => { void upsertText(t, mid); });
  }

  // Compute current world-space viewport bounds with overscan padding
  function getWorldViewport() {
    const w = window.innerWidth;
    const h = window.innerHeight - headerHeight;
    const x1 = -position.x / scale;
    const y1 = -position.y / scale;
    const x2 = x1 + w / scale;
    const y2 = y1 + h / scale;
    const pad = 100;
    return { x1: x1 - pad, y1: y1 - pad, x2: x2 + pad, y2: y2 + pad };
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

  function computeNextGroupDefaultName(existing: GroupData[]): string {
    // Find smallest unused integer starting at 1 among names matching /^Group (\d+)$/
    const used = new Set<number>();
    for (const g of existing) {
      const m = /^Group\s+(\d+)$/i.exec((g.name || '').trim());
      if (m) used.add(Number(m[1]));
    }
    let n = 1;
    while (used.has(n)) n++;
    return `Group ${n}`;
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
    const group: GroupData = { id: generateId('group'), children, z: Math.max(0, z), name: computeNextGroupDefaultName(groups) };
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
    const group: GroupData = { id: generateId('group'), children, z: Math.max(0, z), name: computeNextGroupDefaultName(groups) };
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

  function onRenameGroup(groupId: string, nextName: string) {
    const trimmed = (nextName || '').trim().slice(0, 20);
    setGroups((prev) => prev.map((g) => (g.id === groupId ? { ...g, name: trimmed } : g)));
    const g = groups.find((x) => x.id === groupId);
    if (!g) return;
    void upsertGroup({ ...g, name: trimmed });
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

  // Keyboard shortcuts (PR #26)
  useKeyboard({
    enabled: true,
    isEditing: !!editing,
    onDelete: () => deleteSelected(),
    onDuplicate: () => duplicateSelected(),
    onNudge: (dx, dy) => moveSelectedBy(dx, dy),
    onEscape: () => clearSelection(),
    onCopy: () => {
      const ids = multiSelectedIds || [];
      if (!ids.length) return;
      const center = (() => {
        const b = getSelectionBounds();
        return b ? { x: b.centerX, y: b.centerY } : undefined;
      })();
      const items: Array<{ kind: 'rect'|'circle'|'text'; data: any }> = [];
      ids.forEach((id) => {
        const kind = (multiIdToKind as any)[id] as 'rect'|'circle'|'text';
        if (kind === 'rect') {
          const cur = rects.find((r) => r.id === id); if (cur) items.push({ kind, data: cur });
        } else if (kind === 'circle') {
          const cur = circles.find((c) => c.id === id); if (cur) items.push({ kind, data: cur });
        } else if (kind === 'text') {
          const cur = texts.find((t) => t.id === id); if (cur) items.push({ kind, data: cur });
        }
      });
      clipboardRef.current = { items, sourceCenter: center };
      lastPasteAnchorRef.current = null; // reset paste anchor so next paste uses cursor/center
    },
    onPaste: () => {
      const clip = clipboardRef.current; if (!clip || !clip.items.length) return;
      const stage = trRef.current?.getStage?.(); if (!stage) return;
      // Determine paste anchor: cursor world pos if available/in-window; else viewport center in world coords
      const pointer = getWorldPointer(stage);
      let anchor: { x: number; y: number };
      if (pointer) anchor = pointer; else {
        const vw = (window.innerWidth) / (stage.scaleX?.() ?? 1);
        const vh = (window.innerHeight - headerHeight) / (stage.scaleY?.() ?? 1);
        const sx = stage.x?.() ?? 0; const sy = stage.y?.() ?? 0;
        anchor = { x: (vw / 2) - (sx / (stage.scaleX?.() ?? 1)), y: (vh / 2) - (sy / (stage.scaleY?.() ?? 1)) };
      }
      // If anchor unchanged since last paste, apply +20,+20; if changed, reset anchor baseline
      const last = lastPasteAnchorRef.current;
      if (last && Math.abs(last.x - anchor.x) < 1 && Math.abs(last.y - anchor.y) < 1) {
        anchor = { x: anchor.x + 20, y: anchor.y + 20 };
      }
      lastPasteAnchorRef.current = anchor;
      const mid = generateId('mut');
      const newIds: string[] = [];
      // Compute offset from source center to anchor (if available), else +20,+20 relative shift
      const src = clip.sourceCenter;
      const dx0 = src ? (anchor.x - src.x) : 20;
      const dy0 = src ? (anchor.y - src.y) : 20;
      clip.items.forEach(({ kind, data }) => {
        if (kind === 'rect') {
          const cur = data as RectData;
          const copy: RectData = { ...cur, id: generateId('rect'), x: cur.x + dx0, y: cur.y + dy0 } as RectData;
          newIds.push(copy.id);
          setRects((prev) => [...prev, copy]);
          void upsertRect(copy, mid);
        } else if (kind === 'circle') {
          const cur = data as CircleData;
          const copy: CircleData = { ...cur, id: generateId('circle'), cx: cur.cx + dx0, cy: cur.cy + dy0 } as CircleData;
          newIds.push(copy.id);
          setCircles((prev) => [...prev, copy]);
          void upsertCircle(copy, mid);
        } else if (kind === 'text') {
          const cur = data as TextData;
          const copy: TextData = { ...cur, id: generateId('text'), x: cur.x + dx0, y: cur.y + dy0 } as TextData;
          newIds.push(copy.id);
          setTexts((prev) => [...prev, copy]);
          void upsertText(copy, mid);
        }
      });
      const kinds: Record<string, 'rect' | 'circle' | 'text'> = {};
      newIds.forEach((nid) => {
        const r = rects.find((x) => x.id === nid);
        const c = circles.find((x) => x.id === nid);
        const t = texts.find((x) => x.id === nid);
        if (r) kinds[nid] = 'rect'; else if (c) kinds[nid] = 'circle'; else if (t) kinds[nid] = 'text';
      });
      if (newIds.length) setSelection(newIds, kinds);
    },
  });


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

  // rectIntersects moved to helpers/geometrySelection.ts

  // combineSelectionWithMode moved to helpers/geometrySelection.ts

  // applyAreaSelectionRect moved to helpers/geometrySelection.ts

  // applyAreaSelectionLasso moved to helpers/geometrySelection.ts

  // Convert current pointer to world coords using the Stage's live position/scale
  // getWorldPointer moved to helpers/geometrySelection.ts

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
    const changes: any[] = [];
    // Gather before/after for history in one batch
    for (const id of ids) {
      const kind = (multiIdToKind as any)[id] as 'rect' | 'circle' | 'text';
      if (kind === 'rect') {
        const cur = rects.find((r) => r.id === id);
        if (!cur) continue;
        const after = { ...cur, x: cur.x + dx, y: cur.y + dy };
        changes.push({ kind: 'rect', id, before: { kind: 'rect', ...cur }, after: { kind: 'rect', ...after } });
      } else if (kind === 'circle') {
        const cur = circles.find((c) => c.id === id);
        if (!cur) continue;
        const after = { ...cur, cx: cur.cx + dx, cy: cur.cy + dy };
        changes.push({ kind: 'circle', id, before: { kind: 'circle', ...cur }, after: { kind: 'circle', ...after } });
      } else if (kind === 'text') {
        const cur = texts.find((t) => t.id === id);
        if (!cur) continue;
        const after = { ...cur, x: cur.x + dx, y: cur.y + dy };
        changes.push({ kind: 'text', id, before: { kind: 'text', ...cur }, after: { kind: 'text', ...after } });
      }
    }
    // rects
    setRects((prev) => prev.map((r) => ids.includes(r.id) ? { ...r, x: r.x + dx, y: r.y + dy } : r));
    setCircles((prev) => prev.map((c) => ids.includes(c.id) ? { ...c, cx: c.cx + dx, cy: c.cy + dy } : c));
    setTexts((prev) => prev.map((t) => ids.includes(t.id) ? { ...t, x: t.x + dx, y: t.y + dy } : t));
    rects.filter((r) => ids.includes(r.id)).forEach((r) => void upsertRect({ ...r, x: r.x + dx, y: r.y + dy }, mid));
    circles.filter((c) => ids.includes(c.id)).forEach((c) => void upsertCircle({ ...c, cx: c.cx + dx, cy: c.cy + dy }, mid));
    texts.filter((t) => ids.includes(t.id)).forEach((t) => void upsertText({ ...t, x: t.x + dx, y: t.y + dy }, mid));
    if (changes.length) recordUpdate(changes as any);
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

  /**
   * Duplicate the current selection with a +20,+20 offset and reselect the new copies.
   * This mirrors the Cmd/Ctrl+D keyboard shortcut; used by the toolbar button.
   */
  function duplicateSelected() {
    const ids = multiSelectedIds || [];
    if (!ids.length) return;
    const mid = generateId('mut');
    const dx = 20, dy = 20;
    const newIds: string[] = [];
    ids.forEach((id) => {
      const kind = (multiIdToKind as any)[id] as 'rect' | 'circle' | 'text';
      if (kind === 'rect') {
        const cur = rects.find((r) => r.id === id); if (!cur) return;
        const copy: RectData = { ...cur, id: generateId('rect'), x: cur.x + dx, y: cur.y + dy } as RectData;
        newIds.push(copy.id);
        setRects((prev) => [...prev, copy]);
        void upsertRect(copy, mid);
      } else if (kind === 'circle') {
        const cur = circles.find((c) => c.id === id); if (!cur) return;
        const copy: CircleData = { ...cur, id: generateId('circle'), cx: cur.cx + dx, cy: cur.cy + dy } as CircleData;
        newIds.push(copy.id);
        setCircles((prev) => [...prev, copy]);
        void upsertCircle(copy, mid);
      } else if (kind === 'text') {
        const cur = texts.find((t) => t.id === id); if (!cur) return;
        const copy: TextData = { ...cur, id: generateId('text'), x: cur.x + dx, y: cur.y + dy } as TextData;
        newIds.push(copy.id);
        setTexts((prev) => [...prev, copy]);
        void upsertText(copy, mid);
      }
    });
    const kinds: Record<string, 'rect' | 'circle' | 'text'> = {};
    newIds.forEach((nid) => {
      const r = rects.find((x) => x.id === nid);
      const c = circles.find((x) => x.id === nid);
      const t = texts.find((x) => x.id === nid);
      if (r) kinds[nid] = 'rect';
      else if (c) kinds[nid] = 'circle';
      else if (t) kinds[nid] = 'text';
    });
    if (newIds.length) setSelection(newIds, kinds);
  }

  function deleteSelected() {
    const ids = multiSelectedIds || [];
    if (!ids.length) return;
    const del: any[] = [];
    ids.forEach((id) => {
      const kind = (multiIdToKind as any)[id] as 'rect' | 'circle' | 'text';
      if (kind === 'rect') {
        const before = rects.find((r) => r.id === id);
        if (before) {
          setDeletedRects((prev) => ({ ...prev, [before.id]: before }));
          setTimeout(() => setDeletedRects((prev) => { const n = { ...prev }; delete n[before.id]; return n; }), 200);
        }
        setRects((prev) => prev.filter((r) => r.id !== id));
        if (before) { del.push({ kind: 'rect', ...before }); void deleteRect(id); }
      } else if (kind === 'circle') {
        const before = circles.find((c) => c.id === id);
        if (before) {
          setDeletedCircles((prev) => ({ ...prev, [before.id]: before }));
          setTimeout(() => setDeletedCircles((prev) => { const n = { ...prev }; delete n[before.id]; return n; }), 200);
        }
        setCircles((prev) => prev.filter((c) => c.id !== id));
        if (before) { del.push({ kind: 'circle', ...before }); void deleteCircle(id); }
      } else if (kind === 'text') {
        const before = texts.find((t) => t.id === id);
        if (before) {
          setDeletedTexts((prev) => ({ ...prev, [before.id]: before }));
          setTimeout(() => setDeletedTexts((prev) => { const n = { ...prev }; delete n[before.id]; return n; }), 200);
        }
        setTexts((prev) => prev.filter((t) => t.id !== id));
        if (before) { del.push({ kind: 'text', ...before }); void deleteText(id); }
      }
    });
    if (del.length) recordDelete(del as any);
    // Clear selection after delete
    clearSelection();
  }

  // Alignment (PR #31): align by centers relative to selection bounds
  type AlignMode = 'left' | 'right' | 'top' | 'bottom' | 'centerX' | 'centerY';
  function alignSelection(mode: AlignMode) {
    const ids = multiSelectedIds || [];
    if (!ids || ids.length < 2) return; // require 2+
    const b = getSelectionBounds();
    if (!b) return;
    const mid = generateId('mut');
    const changes: any[] = [];
    ids.forEach((id) => {
      const kind = (multiIdToKind as any)[id] as 'rect' | 'circle' | 'text';
      if (kind === 'rect') {
        const cur = rects.find((r) => r.id === id); if (!cur) return;
        const cx = cur.x + cur.width / 2;
        const cy = cur.y + cur.height / 2;
        let targetCX = cx, targetCY = cy;
        if (mode === 'left') targetCX = b.x; else if (mode === 'right') targetCX = b.x + b.width; else if (mode === 'centerX') targetCX = b.centerX;
        if (mode === 'top') targetCY = b.y; else if (mode === 'bottom') targetCY = b.y + b.height; else if (mode === 'centerY') targetCY = b.centerY;
        const nx = Math.round(targetCX - cur.width / 2);
        const ny = Math.round(targetCY - cur.height / 2);
        if (nx === cur.x && ny === cur.y) return;
        const next: RectData = { ...cur, x: nx, y: ny } as RectData;
        setRects((prev) => prev.map((r) => (r.id === id ? next : r)));
        void upsertRect(next, mid);
        changes.push({ kind: 'rect', id, before: { kind: 'rect', ...cur }, after: { kind: 'rect', ...next } });
      } else if (kind === 'circle') {
        const cur = circles.find((c) => c.id === id); if (!cur) return;
        const cx = cur.cx; const cy = cur.cy;
        let targetCX = cx, targetCY = cy;
        if (mode === 'left') targetCX = b.x; else if (mode === 'right') targetCX = b.x + b.width; else if (mode === 'centerX') targetCX = b.centerX;
        if (mode === 'top') targetCY = b.y; else if (mode === 'bottom') targetCY = b.y + b.height; else if (mode === 'centerY') targetCY = b.centerY;
        const ncx = Math.round(targetCX);
        const ncy = Math.round(targetCY);
        if (ncx === cur.cx && ncy === cur.cy) return;
        const next: CircleData = { ...cur, cx: ncx, cy: ncy } as CircleData;
        setCircles((prev) => prev.map((c) => (c.id === id ? next : c)));
        void upsertCircle(next, mid);
        changes.push({ kind: 'circle', id, before: { kind: 'circle', ...cur }, after: { kind: 'circle', ...next } });
      } else if (kind === 'text') {
        const cur = texts.find((t) => t.id === id); if (!cur) return;
        const cx = cur.x + cur.width / 2;
        const cy = cur.y + cur.height / 2;
        let targetCX = cx, targetCY = cy;
        if (mode === 'left') targetCX = b.x; else if (mode === 'right') targetCX = b.x + b.width; else if (mode === 'centerX') targetCX = b.centerX;
        if (mode === 'top') targetCY = b.y; else if (mode === 'bottom') targetCY = b.y + b.height; else if (mode === 'centerY') targetCY = b.centerY;
        const nx = Math.round(targetCX - cur.width / 2);
        const ny = Math.round(targetCY - cur.height / 2);
        if (nx === cur.x && ny === cur.y) return;
        const next: TextData = { ...cur, x: nx, y: ny } as TextData;
        setTexts((prev) => prev.map((t) => (t.id === id ? next : t)));
        void upsertText(next, mid);
        changes.push({ kind: 'text', id, before: { kind: 'text', ...cur }, after: { kind: 'text', ...next } });
      }
    });
    if (changes.length) recordUpdate(changes as any);
  }

  /**
   * Select all shapes of a given type across the entire canvas, combining with the
   * current selection according to the active boolean selection mode.
   */
  function onSelectAllByType(kind: 'rect' | 'circle' | 'text') {
    const nextIds: string[] = [];
    const nextKinds: Record<string, 'rect' | 'circle' | 'text'> = {};
    if (kind === 'rect') {
      for (const r of rects) { nextIds.push(r.id); nextKinds[r.id] = 'rect'; }
    } else if (kind === 'circle') {
      for (const c of circles) { nextIds.push(c.id); nextKinds[c.id] = 'circle'; }
    } else if (kind === 'text') {
      for (const t of texts) { nextIds.push(t.id); nextKinds[t.id] = 'text'; }
    }
    combineSelectionWithMode(nextIds, nextKinds as any, { booleanMode, selectionDragBaseRef, multiSelectedIds, multiIdToKind: multiIdToKind as any, setSelection });
  }

  return (
    <div ref={containerRef} style={{ width: '100%', height: '100%', position: 'relative' }} onContextMenu={(e) => {
      // Suppress native menu if we're cancelling selection via RMB, or if a selection gesture is active
      if (suppressNextContextMenuRef.current || marquee || lassoPoints) {
        e.preventDefault();
        suppressNextContextMenuRef.current = false; // one-shot
        return;
      }
      const sel = getCurrentSelection();
      if (!sel || sel.ids.length === 0) return; // allow default menu with no selection
      e.preventDefault();
      setMenuPos({ x: e.clientX, y: e.clientY });
    }}>
      <Stage
        ref={stageRef}
        width={window.innerWidth}
        height={window.innerHeight - headerHeight}
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
            // If RMB pressed while a selection drag is about to start or in progress, cancel immediately and restore prior selection
            if (e.evt && e.evt.button === 2) {
              setMarquee(null as any);
              setLassoPoints(null as any);
              // Restore selection snapshot captured at drag start (if any)
              const base = selectionDragBaseRef.current;
              if (base) {
                setSelection(base.ids, base.kinds as any);
              }
              mouseDownWorldRef.current = null;
              selectionDragBaseRef.current = null;
              suppressNextContextMenuRef.current = true; // suppress browser menu for this cancel
              // Stop further processing
              e.evt.preventDefault();
              e.cancelBubble = true;
              return;
            }
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
              const rect = { x: next.x, y: next.y, w: next.w, h: next.h };
              if (SELECTION_LIVE_THROTTLE_RAF) {
                selectionPendingRef.current = { kind: 'rect', rect };
                if (!selectionRafScheduledRef.current) {
                  selectionRafScheduledRef.current = true;
                  requestAnimationFrame(() => {
                    selectionRafScheduledRef.current = false;
                    const p = selectionPendingRef.current;
                    if (!p) return;
                    if (p.kind === 'rect' && p.rect) {
                      applyAreaSelectionRect(
                        p.rect,
                        { rects, circles, texts },
                        { booleanMode, selectionDragBaseRef, multiSelectedIds, multiIdToKind: multiIdToKind as any, setSelection, xRay: isXRayActive() }
                      );
                    }
                  });
                }
              } else {
                applyAreaSelectionRect(
                  rect,
                  { rects, circles, texts },
                  { booleanMode, selectionDragBaseRef, multiSelectedIds, multiIdToKind: multiIdToKind as any, setSelection, xRay: isXRayActive() }
                );
              }
              return;
            }
            if (lassoPoints) {
              const pts = [...lassoPoints, { x: xw, y: yw }];
              setLassoPoints(pts as any);
              if (SELECTION_LIVE_THROTTLE_RAF) {
                selectionPendingRef.current = { kind: 'lasso', points: pts };
                if (!selectionRafScheduledRef.current) {
                  selectionRafScheduledRef.current = true;
                  requestAnimationFrame(() => {
                    selectionRafScheduledRef.current = false;
                    const p = selectionPendingRef.current;
                    if (!p) return;
                    if (p.kind === 'lasso' && p.points) {
                      applyAreaSelectionLasso(
                        p.points,
                        { rects, circles, texts },
                        { booleanMode, selectionDragBaseRef, multiSelectedIds, multiIdToKind: multiIdToKind as any, setSelection, xRay: isXRayActive() }
                      );
                    }
                  });
                }
              } else {
                applyAreaSelectionLasso(
                  pts,
                  { rects, circles, texts },
                  { booleanMode, selectionDragBaseRef, multiSelectedIds, multiIdToKind: multiIdToKind as any, setSelection, xRay: isXRayActive() }
                );
              }
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
              // Ensure the browser context menu does not appear for this cancel action
              suppressNextContextMenuRef.current = true;
              return;
            }
            // finalize; live selection already applied. Ensure final combine runs once more.
            const hadMarquee = marquee ? { ...marquee } : null;
            const hadLasso = (lassoPoints && lassoPoints.length > 1) ? [...lassoPoints] : null;
            setMarquee(null as any);
            setLassoPoints(null as any);
            if (hadMarquee) {
              applyAreaSelectionRect(
                { x: hadMarquee.x, y: hadMarquee.y, w: hadMarquee.w, h: hadMarquee.h },
                { rects, circles, texts },
                { booleanMode, selectionDragBaseRef, multiSelectedIds, multiIdToKind: multiIdToKind as any, setSelection, xRay: isXRayActive() }
              );
            } else if (hadLasso) {
              applyAreaSelectionLasso(
                hadLasso as any,
                { rects, circles, texts },
                { booleanMode, selectionDragBaseRef, multiSelectedIds, multiIdToKind: multiIdToKind as any, setSelection, xRay: isXRayActive() }
              );
            }
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
                const pt = stage?.getPointerPosition?.();
                if (!pt) { clearSelection(); mouseDownWorldRef.current = null; selectionDragBaseRef.current = null; return; }
                if (isXRayActive()) {
                  // Collect all objects precisely under the point
                  const nextIds: string[] = [];
                  const nextKinds: Record<string, 'rect' | 'circle' | 'text'> = {};
                  const wx = xw, wy = yw;
                  for (const r of rects) {
                    if (wx >= r.x && wx <= r.x + r.width && wy >= r.y && wy <= r.y + r.height) { nextIds.push(r.id); nextKinds[r.id] = 'rect'; if (nextIds.length >= XRAY_POINT_MAX_HITS) break; }
                  }
                  if (nextIds.length < XRAY_POINT_MAX_HITS) {
                    for (const c of circles) {
                      const dx = wx - c.cx;
                      const dy = wy - c.cy;
                      if ((dx * dx + dy * dy) <= c.radius * c.radius) { nextIds.push(c.id); nextKinds[c.id] = 'circle'; if (nextIds.length >= XRAY_POINT_MAX_HITS) break; }
                    }
                  }
                  if (nextIds.length < XRAY_POINT_MAX_HITS) {
                    for (const t of texts) {
                      if (wx >= t.x && wx <= t.x + t.width && wy >= t.y && wy <= t.y + (t.height || 24)) { nextIds.push(t.id); nextKinds[t.id] = 'text'; if (nextIds.length >= XRAY_POINT_MAX_HITS) break; }
                    }
                  }
                  if (booleanMode === 'new' && nextIds.length === 0) {
                    clearSelection();
                  } else {
                    combineSelectionWithMode(nextIds, nextKinds as any, { booleanMode, selectionDragBaseRef, multiSelectedIds, multiIdToKind: multiIdToKind as any, setSelection });
                  }
                } else {
                  // resolve top-most named node at point
                  const shape = stage?.getIntersection?.(pt);
                  let node: any = shape;
                  while (node && !node?.attrs?.name && node !== stage) node = node.getParent?.();
                  const id = node?.attrs?.name as string | undefined;
                  if (!id) {
                    clearSelection();
                  } else {
                    // Determine shape kind and apply selection according to boolean mode
                    let kind: 'rect' | 'circle' | 'text' | null = null;
                    if (rects.find((r) => r.id === id)) kind = 'rect';
                    else if (circles.find((c) => c.id === id)) kind = 'circle';
                    else if (texts.find((t) => t.id === id)) kind = 'text';
                    if (!kind) {
                      clearSelection();
                    } else {
                      const nextIds = [id];
                      const nextKinds: Record<string, 'rect' | 'circle' | 'text'> = { [id]: kind };
                      combineSelectionWithMode(nextIds, nextKinds as any, { booleanMode, selectionDragBaseRef, multiSelectedIds, multiIdToKind: multiIdToKind as any, setSelection });
                    }
                  }
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
              console.log('[history] recordCreate(rect)');
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
              console.log('[history] recordCreate(circle)');
              recordCreate([{ kind: 'circle', ...circle } as any]);
            } else if (tool === 'text') {
              const textWidth = Math.max(MIN_TEXT_WIDTH, width || 0);
              const text = { id: d.id, x, y, width: textWidth, height: MIN_TEXT_HEIGHT, text: 'Text', fill: activeColor || '#ffffff', rotation: 0, z: getMaxZ() + 1 };
              setTexts((prev) => [...prev, text]);
              const mid = generateId('mut');
              rememberMutationId(mid);
              void upsertText(text, mid);
              console.log('[history] recordCreate(text)');
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
            if (del.length) { console.log('[history] recordDelete(erase)', del.length); recordDelete(del as any); }
          }
        }}
      >
        <Layer>
          <Rect x={0} y={0} width={WORLD_SIZE} height={WORLD_SIZE} fill={'#111827'} onMouseDown={() => {
            // In select mode, background down no longer immediately clears; mouseup with <5px will clear
            if (tool !== 'select') return;
            if (editing) closeTextEditor(true);
          }} />
          {(() => {
            type Item = { id: string; kind: 'rect' | 'circle' | 'text'; z: number; render: () => any };
            const items: Item[] = [];
            const shapeCount = rects.length + circles.length + texts.length;
            const animateShapes = shapeCount < 250;
            const view = getWorldViewport();
            void motionTick; // consume motion tick to satisfy linter
            for (const r of rects) {
              const m = motionMapRef.current[r.id];
              const useMotion = !!m && m.kind === 'rect';
              const rx = useMotion ? (m.x ?? r.x) : r.x;
              const ry = useMotion ? (m.y ?? r.y) : r.y;
              const rwidth = useMotion ? (m.width ?? r.width) : r.width;
              const rheight = useMotion ? (m.height ?? r.height) : r.height;
              const rrotation = useMotion ? (m.rotation ?? (r.rotation ?? 0)) : (r.rotation ?? 0);
              const ax1 = rx, ay1 = ry, ax2 = rx + rwidth, ay2 = ry + rheight;
              if (ax2 < view.x1 || ax1 > view.x2 || ay2 < view.y1 || ay1 > view.y2) continue;
              items.push({ id: r.id, kind: 'rect', z: r.z ?? 0, render: () => (
                <Rectangle key={r.id} id={r.id} x={rx} y={ry} width={rwidth} height={rheight} fill={r.fill} rotation={rrotation} draggable={tool === 'pan'} animate={animateShapes} onDragStart={() => {
                  if (tool !== 'pan') return;
                  beforeSnapshotRef.current[r.id] = { kind: 'rect', ...r };
                }} onDragMove={(pos) => {
                  if (tool !== 'pan') return;
                  const entry: MotionEntry = { id: r.id, kind: 'rect', clientId, updatedAt: Date.now(), x: pos.x, y: pos.y, width: r.width, height: r.height, rotation: r.rotation ?? 0 } as MotionEntry;
                  updateLocalMotion(entry);
                  if (Math.abs(pos.x - r.x) >= MOTION_WORLD_THRESHOLD || Math.abs(pos.y - r.y) >= MOTION_WORLD_THRESHOLD) {
                    maybePublishMotion(r.id, entry);
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
                  console.log('[history] recordUpdate(rect dragEnd)', r.id);
                  recordUpdate([{ kind: 'rect', id: r.id, before, after: { kind: 'rect', ...next } } as any]);
                }} />
              )});
            }
            for (const c of circles) {
              const m = motionMapRef.current[c.id];
              const useMotion = !!m && m.kind === 'circle';
              const cx = useMotion ? (m.cx ?? c.cx) : c.cx;
              const cy = useMotion ? (m.cy ?? c.cy) : c.cy;
              const cr = useMotion ? (m.radius ?? c.radius) : c.radius;
              const ax1 = cx - cr, ay1 = cy - cr, ax2 = cx + cr, ay2 = cy + cr;
              if (ax2 < view.x1 || ax1 > view.x2 || ay2 < view.y1 || ay1 > view.y2) continue;
              items.push({ id: c.id, kind: 'circle', z: c.z ?? 0, render: () => (
                <Circle key={c.id} id={c.id} x={cx} y={cy} radius={cr} fill={c.fill} draggable={tool === 'pan'} animate={animateShapes} onDragStart={() => {
                  if (tool !== 'pan') return;
                  beforeSnapshotRef.current[c.id] = { kind: 'circle', ...c };
                }} onDragMove={(pos) => {
                  if (tool !== 'pan') return;
                  const entry: MotionEntry = { id: c.id, kind: 'circle', clientId, updatedAt: Date.now(), cx: pos.x, cy: pos.y, radius: c.radius } as MotionEntry;
                  updateLocalMotion(entry);
                  if (Math.abs(pos.x - c.cx) >= MOTION_WORLD_THRESHOLD || Math.abs(pos.y - c.cy) >= MOTION_WORLD_THRESHOLD) {
                    maybePublishMotion(c.id, entry);
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
                  console.log('[history] recordUpdate(circle dragEnd)', c.id);
                  recordUpdate([{ kind: 'circle', id: c.id, before, after: { kind: 'circle', ...next } } as any]);
                }} />
              )});
            }
            for (const t of texts) {
              const m = motionMapRef.current[t.id];
              const useMotion = !!m && m.kind === 'text';
              const tx = useMotion ? (m.x ?? t.x) : t.x;
              const ty = useMotion ? (m.y ?? t.y) : t.y;
              const tw = useMotion ? (m.width ?? t.width) : t.width;
              const th = useMotion ? (m.height ?? t.height) : t.height;
              const trot = useMotion ? (m.rotation ?? (t.rotation ?? 0)) : (t.rotation ?? 0);
              const ax1 = tx, ay1 = ty, ax2 = tx + tw, ay2 = ty + th;
              if (ax2 < view.x1 || ax1 > view.x2 || ay2 < view.y1 || ay1 > view.y2) continue;
              items.push({ id: t.id, kind: 'text', z: t.z ?? 0, render: () => (
                <TextBox key={t.id} id={t.id} x={tx} y={ty} width={tw} height={th} text={t.text} fill={t.fill} rotation={trot} fontFamily={t.fontFamily} fontSize={t.fontSize} fontStyle={t.fontStyle as any} textDecoration={t.textDecoration as any} selected={!!(multiSelectedIds && multiSelectedIds.includes(t.id))} editing={!!editing && editing.id === t.id} draggable={tool === 'pan'} animate={animateShapes} onDragStart={() => {
                  if (tool !== 'pan') return;
                  beforeSnapshotRef.current[t.id] = { kind: 'text', ...t };
                }} onDragMove={(pos) => {
                  if (tool !== 'pan') return;
                  const entry: MotionEntry = { id: t.id, kind: 'text', clientId, updatedAt: Date.now(), x: pos.x, y: pos.y, width: t.width, height: t.height } as MotionEntry;
                  updateLocalMotion(entry);
                  if (Math.abs(pos.x - t.x) >= MOTION_WORLD_THRESHOLD || Math.abs(pos.y - t.y) >= MOTION_WORLD_THRESHOLD) {
                    maybePublishMotion(t.id, entry);
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
                  console.log('[history] recordUpdate(text dragEnd)', t.id);
                  recordUpdate([{ kind: 'text', id: t.id, before, after: { kind: 'text', ...next } } as any]);
                }} onMeasured={() => { /* no-op: child measures itself */ }} onRequestEdit={(evt) => {
                  // Allow editing in both select and pan modes
                  if (tool !== 'select' && tool !== 'pan') return;
                  openTextEditor(t.id, evt);
                }} />
              )});
            }
            items.sort((a, b) => (a.z - b.z) || (a.kind === b.kind ? a.id.localeCompare(b.id) : a.kind.localeCompare(b.kind)));
            const live = items.map((it) => it.render());
            // Render transient fade-outs on top with fadingOut=true
            const fading: any[] = [];
            Object.values(deletedRects).forEach((r) => {
              const m = motionMapRef.current[r.id];
              const rx = m && m.kind === 'rect' ? (m.x ?? r.x) : r.x;
              const ry = m && m.kind === 'rect' ? (m.y ?? r.y) : r.y;
              const rw = m && m.kind === 'rect' ? (m.width ?? r.width) : r.width;
              const rh = m && m.kind === 'rect' ? (m.height ?? r.height) : r.height;
              const rr = m && m.kind === 'rect' ? (m.rotation ?? (r.rotation ?? 0)) : (r.rotation ?? 0);
              fading.push(<Rectangle key={`del-${r.id}`} id={r.id} x={rx} y={ry} width={rw} height={rh} fill={r.fill} rotation={rr} draggable={false} fadingOut animate={animateShapes} />);
            });
            Object.values(deletedCircles).forEach((c) => {
              const m = motionMapRef.current[c.id];
              const cx = m && m.kind === 'circle' ? (m.cx ?? c.cx) : c.cx;
              const cy = m && m.kind === 'circle' ? (m.cy ?? c.cy) : c.cy;
              const cr = m && m.kind === 'circle' ? (m.radius ?? c.radius) : c.radius;
              fading.push(<Circle key={`del-${c.id}`} id={c.id} x={cx} y={cy} radius={cr} fill={c.fill} draggable={false} fadingOut animate={animateShapes} />);
            });
            Object.values(deletedTexts).forEach((t) => {
              const m = motionMapRef.current[t.id];
              const tx = m && m.kind === 'text' ? (m.x ?? t.x) : t.x;
              const ty = m && m.kind === 'text' ? (m.y ?? t.y) : t.y;
              const tw = m && m.kind === 'text' ? (m.width ?? t.width) : t.width;
              const th = m && m.kind === 'text' ? (m.height ?? t.height) : t.height;
              const tr = m && m.kind === 'text' ? (m.rotation ?? (t.rotation ?? 0)) : (t.rotation ?? 0);
              fading.push(<TextBox key={`del-${t.id}`} id={t.id} x={tx} y={ty} width={tw} height={th} text={t.text} fill={t.fill} rotation={tr} draggable={false} fadingOut animate={animateShapes} />);
            });
            return [...live, ...fading];
          })()}
          {/* overlays moved to separate non-listening layers */}
          
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
              if (tool === 'text') return <TextBox id={d.id} x={x} y={y} width={Math.max(MIN_TEXT_WIDTH, width)} height={MIN_TEXT_HEIGHT} text={'Text'} fill={'#ffffff'} rotation={0} />;
              return null;
            })()
          )}
        </Layer>
        {/* Selection visuals: marquee/lasso (non-listening) */}
        <Layer listening={false} name={'overlay'}>
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
        </Layer>
        {/* Transformer layer (interactive) */}
        {(tool === 'select' || tool === 'pan') && (multiSelectedIds?.length || 0) > 0 && (
          <Layer name={'overlay'}>
            {(() => {
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
                  enabledAnchors={isSingle ? anchorsForSingle : []}
                  boundBoxFunc={(oldBox, newBox) => {
                    if (isSingle && singleKind === 'circle') {
                      const size = Math.max(newBox.width, newBox.height);
                      return { ...newBox, width: size, height: size };
                    }
                    const MIN_W = isSingle && singleKind === 'text' ? MIN_TEXT_WIDTH : 10;
                    const MIN_H = isSingle && singleKind === 'text' ? MIN_TEXT_HEIGHT : 10;
                    let nb = { ...newBox } as any;
                    if (nb.width < MIN_W) {
                      if (nb.x !== oldBox.x) nb.x = oldBox.x + (oldBox.width - MIN_W);
                      nb.width = MIN_W;
                    }
                    if (nb.width < 0) { nb.x = oldBox.x; nb.width = MIN_W; }
                    if (nb.height < MIN_H) {
                      if (nb.y !== oldBox.y) nb.y = oldBox.y + (oldBox.height - MIN_H);
                      nb.height = MIN_H;
                    }
                    if (nb.height < 0) { nb.y = oldBox.y; nb.height = MIN_H; }
                    return nb;
                  }}
                  onTransform={() => {
                    const stage = trRef.current?.getStage?.();
                    if (!stage) return;
                    const idsNow = multiSelectedIds || [];
                    if (!idsNow.length) return;
                    if (tool !== 'pan') return;
                    if (idsNow.length === 1) {
                      const id = idsNow[0];
                      const node = activeNodeRef.current;
                      if (!node) return;
                      const kind = (multiIdToKind as any)[id] as 'rect' | 'circle' | 'text';
                      if (kind === 'rect') {
                        const current = rects.find((r) => r.id === id);
                        if (!current) return;
                        const newWidth = Math.max(10, (current.width) * node.scaleX());
                        const newHeight = Math.max(10, (current.height) * node.scaleY());
                        node.scale({ x: 1, y: 1 });
                        const rot = node.rotation?.() ?? (current.rotation ?? 0);
                        const entry: MotionEntry = { id, kind: 'rect', clientId, updatedAt: Date.now(), x: node.x(), y: node.y(), width: newWidth, height: newHeight, rotation: rot } as MotionEntry;
                        updateLocalMotion(entry);
                        maybePublishMotion(id, entry);
                        return;
                      }
                      if (kind === 'circle') {
                        const current = circles.find((c) => c.id === id);
                        if (!current) return;
                        const radius = Math.max(1, (current.radius) * node.scaleX());
                        node.scale({ x: 1, y: 1 });
                        const entry: MotionEntry = { id, kind: 'circle', clientId, updatedAt: Date.now(), cx: node.x(), cy: node.y(), radius } as MotionEntry;
                        updateLocalMotion(entry);
                        maybePublishMotion(id, entry);
                        return;
                      }
                      if (kind === 'text') {
                        const current = texts.find((t) => t.id === id);
                        if (!current) return;
                        const newWidth = Math.max(MIN_TEXT_WIDTH, (current.width) * node.scaleX());
                        const newHeight = Math.max(MIN_TEXT_HEIGHT, (current.height) * node.scaleY());
                        const rot = node.rotation?.() ?? (current.rotation ?? 0);
                        const entry: MotionEntry = { id, kind: 'text', clientId, updatedAt: Date.now(), x: node.x(), y: node.y(), width: newWidth, height: newHeight, rotation: rot } as MotionEntry;
                        updateLocalMotion(entry);
                        maybePublishMotion(id, entry);
                        return;
                      }
                      return;
                    }
                    // Multi-select: translate/rotate only; publish entries for each id
                    (idsNow as string[]).forEach((id) => {
                      const node = stage.findOne((n: any) => n?.attrs?.name === id);
                      if (!node) return;
                      const kind = (multiIdToKind as any)[id] as 'rect' | 'circle' | 'text';
                      if (kind === 'rect') {
                        const current = rects.find((r) => r.id === id);
                        if (!current) return;
                        const rot = node.rotation?.() ?? (current.rotation ?? 0);
                        const entry: MotionEntry = { id, kind: 'rect', clientId, updatedAt: Date.now(), x: node.x(), y: node.y(), width: current.width, height: current.height, rotation: rot } as MotionEntry;
                        updateLocalMotion(entry);
                        maybePublishMotion(id, entry);
                      } else if (kind === 'circle') {
                        const current = circles.find((c) => c.id === id);
                        if (!current) return;
                        const entry: MotionEntry = { id, kind: 'circle', clientId, updatedAt: Date.now(), cx: node.x(), cy: node.y(), radius: current.radius } as MotionEntry;
                        updateLocalMotion(entry);
                        maybePublishMotion(id, entry);
                      } else if (kind === 'text') {
                        const current = texts.find((t) => t.id === id);
                        if (!current) return;
                        const rot = node.rotation?.() ?? (current.rotation ?? 0);
                        const entry: MotionEntry = { id, kind: 'text', clientId, updatedAt: Date.now(), x: node.x(), y: node.y(), width: current.width, height: current.height, rotation: rot } as MotionEntry;
                        updateLocalMotion(entry);
                        maybePublishMotion(id, entry);
                      }
                    });
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
                        pendingCommitRef.current[id] = { kind: 'rect', x: next.x, y: next.y, width: next.width, height: next.height };
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
                        pendingCommitRef.current[id] = { kind: 'circle', cx: next.cx, cy: next.cy, radius: next.radius };
                        void upsertCircle(next, mid);
                        return;
                      }
                      if (kind === 'text') {
                        const current = texts.find((t) => t.id === id);
                        if (!current) return;
                        const newWidth = Math.max(MIN_TEXT_WIDTH, (current.width) * node.scaleX());
                        const newHeight = Math.max(MIN_TEXT_HEIGHT, (current.height) * node.scaleY());
                        node.scale({ x: 1, y: 1 });
                        const rot = node.rotation?.() ?? (current.rotation ?? 0);
                        const next: TextData = { ...current, x: node.x(), y: node.y(), width: newWidth, height: newHeight, rotation: rot } as TextData;
                        setTexts((prev) => prev.map((t) => (t.id === id ? next : t)));
                        pendingCommitRef.current[id] = { kind: 'text', x: next.x, y: next.y, width: next.width, height: next.height };
                        void upsertText(next, mid);
                        return;
                      }
                      return;
                    }
                    // Multi-select or select tool hull: translate/rotate only, no resize persistence here
                    const changes: any[] = [];
                    idsNow.forEach((id) => {
                      const node = stage.findOne((n: any) => n?.attrs?.name === id);
                      if (!node) return;
                      const kind = (multiIdToKind as any)[id] as 'rect' | 'circle' | 'text';
                      if (kind === 'rect') {
                        const current = rects.find((r) => r.id === id);
                        if (!current) return;
                        const next = { ...current, x: node.x(), y: node.y(), rotation: node.rotation?.() ?? (current.rotation ?? 0) } as RectData;
                        setRects((prev) => prev.map((r) => (r.id === id ? next : r)));
                        pendingCommitRef.current[id] = { kind: 'rect', x: next.x, y: next.y, width: next.width, height: next.height };
                        void upsertRect(next, mid);
                        changes.push({ kind: 'rect', id, before: { kind: 'rect', ...current }, after: { kind: 'rect', ...next } });
                      } else if (kind === 'circle') {
                        const current = circles.find((c) => c.id === id);
                        if (!current) return;
                        const next = { ...current, cx: node.x(), cy: node.y() } as CircleData;
                        setCircles((prev) => prev.map((c) => (c.id === id ? next : c)));
                        pendingCommitRef.current[id] = { kind: 'circle', cx: next.cx, cy: next.cy, radius: next.radius };
                        void upsertCircle(next, mid);
                        changes.push({ kind: 'circle', id, before: { kind: 'circle', ...current }, after: { kind: 'circle', ...next } });
                      } else if (kind === 'text') {
                        const current = texts.find((t) => t.id === id);
                        if (!current) return;
                        const next = { ...current, x: node.x(), y: node.y(), rotation: node.rotation?.() ?? (current.rotation ?? 0) } as TextData;
                        setTexts((prev) => prev.map((t) => (t.id === id ? next : t)));
                        pendingCommitRef.current[id] = { kind: 'text', x: next.x, y: next.y, width: next.width, height: next.height };
                        void upsertText(next, mid);
                        changes.push({ kind: 'text', id, before: { kind: 'text', ...current }, after: { kind: 'text', ...next } });
                      }
                    });
                    if (changes.length) recordUpdate(changes as any);
                  }}
                />
              );
            })()}
          </Layer>
        )}
        {/* Group overlay (non-listening) */}
        <Layer listening={false} name={'overlay'}>
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
        onRename={onRenameGroup}
      />
      {tool === 'pan' && (multiSelectedIds?.length || 0) > 0 && (
        <div title="Right-click (RMB) opens menu" style={{ position: 'fixed', left: 12, top: headerHeight + 12, display: 'flex', gap: 8, background: '#111827', border: '1px solid #374151', padding: 8, borderRadius: 6, zIndex: 25 }}>
          <button onClick={() => deleteSelected()} style={{ color: '#e5e7eb', background: '#1f2937', border: '1px solid #374151', padding: '6px 8px', borderRadius: 4 }}>delete</button>
          <button title="Duplicate (Ctrl+D)" onClick={() => duplicateSelected()} style={{ color: '#e5e7eb', background: '#1f2937', border: '1px solid #374151', padding: '6px 8px', borderRadius: 4 }}>duplicate</button>
          <button onClick={() => recolorSelected()} style={{ color: '#e5e7eb', background: '#1f2937', border: '1px solid #374151', padding: '6px 8px', borderRadius: 4 }}>apply color</button>
          {/* Z-order controls */}
          <div style={{ display: 'flex', gap: 6, marginLeft: 8 }}>
            <button title="bring to front" onClick={() => { const sel = getCurrentSelection(); if (sel) reorderZGroup('toTop', sel); }} style={{ color: '#e5e7eb', background: '#1f2937', border: '1px solid #374151', padding: '6px 8px', borderRadius: 4 }}>⇪</button>
            <button title="bring forward" onClick={() => { const sel = getCurrentSelection(); if (sel) reorderZGroup('up', sel); }} style={{ color: '#e5e7eb', background: '#1f2937', border: '1px solid #374151', padding: '6px 8px', borderRadius: 4 }}>↑</button>
            <button title="send backward" onClick={() => { const sel = getCurrentSelection(); if (sel) reorderZGroup('down', sel); }} style={{ color: '#e5e7eb', background: '#1f2937', border: '1px solid #374151', padding: '6px 8px', borderRadius: 4 }}>↓</button>
            <button title="send to back" onClick={() => { const sel = getCurrentSelection(); if (sel) reorderZGroup('toBack', sel); }} style={{ color: '#e5e7eb', background: '#1f2937', border: '1px solid #374151', padding: '6px 8px', borderRadius: 4 }}>⇩</button>
          </div>
          {/* Alignment controls */}
          <div style={{ display: 'flex', gap: 6, marginLeft: 8 }}>
            <button title="align left" onClick={() => alignSelection('left')} style={{ color: '#e5e7eb', background: '#1f2937', border: '1px solid #374151', padding: '6px 8px', borderRadius: 4 }}>⟸</button>
            <button title="align center X" onClick={() => alignSelection('centerX')} style={{ color: '#e5e7eb', background: '#1f2937', border: '1px solid #374151', padding: '6px 8px', borderRadius: 4 }}>↔</button>
            <button title="align right" onClick={() => alignSelection('right')} style={{ color: '#e5e7eb', background: '#1f2937', border: '1px solid #374151', padding: '6px 8px', borderRadius: 4 }}>⟹</button>
            <button title="align top" onClick={() => alignSelection('top')} style={{ color: '#e5e7eb', background: '#1f2937', border: '1px solid #374151', padding: '6px 8px', borderRadius: 4 }}>⟰</button>
            <button title="align center Y" onClick={() => alignSelection('centerY')} style={{ color: '#e5e7eb', background: '#1f2937', border: '1px solid #374151', padding: '6px 8px', borderRadius: 4 }}>↕</button>
            <button title="align bottom" onClick={() => alignSelection('bottom')} style={{ color: '#e5e7eb', background: '#1f2937', border: '1px solid #374151', padding: '6px 8px', borderRadius: 4 }}>⟱</button>
          </div>
          <span style={{ color: '#9ca3af', fontSize: 12, marginLeft: 8, alignSelf: 'center' }}>RMB opens menu</span>
        </div>
      )}
      {tool === 'select' && (
        <SelectionToolbar
          primary={primaryMode}
          booleanMode={booleanMode}
          onPrimaryChange={setPrimaryMode}
          onBooleanChange={setBooleanMode}
          selectedCount={multiSelectedIds?.length || 0}
          xRay={isXRayActive()}
          onToggleXRay={() => setXRay((v) => !v)}
          onSelectByType={onSelectAllByType}
        />
      )}
      {/* Right-click context menu for z-order and alignment actions (enabled in select and transform/pan tools) */}
      {menuPos && (tool === 'select' || tool === 'pan') && (() => {
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
            onAlignLeft={() => alignSelection('left')}
            onAlignCenterX={() => alignSelection('centerX')}
            onAlignRight={() => alignSelection('right')}
            onAlignTop={() => alignSelection('top')}
            onAlignCenterY={() => alignSelection('centerY')}
            onAlignBottom={() => alignSelection('bottom')}
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
          onBlur={() => {
            // If blur is caused by clicking the toolbar, don't close yet
            if (toolbarInteractingRef.current) return;
            closeTextEditor(true);
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              if (e.shiftKey) return; // allow newline
              e.preventDefault();
              closeTextEditor(true);
            } else if (e.key === 'Escape') {
              e.preventDefault();
              closeTextEditor(false);
            }
          }}
        />
      )}
      {/* Floating text formatting toolbar */}
      {toolbar && editing && (() => {
        const id = toolbar.id;
        const t = texts.find((x) => x.id === id);
        if (!t) return null;
        const btn = (label: string, on: boolean) => ({ label, on });
        const styleRow = [
          btn('B', (t.fontStyle || '').includes('bold')),
          btn('I', (t.fontStyle || '').includes('italic')),
          btn('U', (t.textDecoration || '').includes('underline')),
          btn('S', (t.textDecoration || '').includes('line-through')),
        ];
        return (
          <div onMouseDown={() => startToolbarInteraction()} onMouseUp={() => setTimeout(() => endToolbarInteraction(), 0)} style={{ position: 'absolute', left: Math.round(toolbar.left), top: Math.round(toolbar.top), background: '#111827', border: '1px solid #374151', borderRadius: 6, padding: 6, display: 'flex', alignItems: 'center', gap: 6, zIndex: 20 }}>
            <select value={String(t.fontSize || 12)} onChange={(e) => updateStyle({ fontSize: Math.max(8, Math.min(96, Number(e.target.value) || 12)) })} style={{ background: '#1f2937', color: '#e5e7eb', border: '1px solid #374151', borderRadius: 4, padding: '4px 6px' }}>
              {[10,12,14,16,18,20,24,28,32,36,48,60,72,96].map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
            <select value={t.fontFamily || 'Inter, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif'} onChange={(e) => updateStyle({ fontFamily: e.target.value })} style={{ background: '#1f2937', color: '#e5e7eb', border: '1px solid #374151', borderRadius: 4, padding: '4px 6px', maxWidth: 240 }}>
              {['Inter, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif','Roboto, system-ui, -apple-system, Segoe UI, Helvetica, Arial, sans-serif','Arial, Helvetica, sans-serif','Georgia, serif','"Times New Roman", Times, serif','"Courier New", Courier, monospace','Monaco, Consolas, "Liberation Mono", Menlo, monospace'].map((f) => <option key={f} value={f}>{f.split(',')[0].replaceAll('"','')}</option>)}
            </select>
            <div style={{ display: 'flex', gap: 4 }}>
              <button onClick={() => {
                const cur = t.fontStyle || 'normal';
                const has = cur.includes('bold');
                const next = `${has ? '' : 'bold'} ${cur.includes('italic') ? 'italic' : ''}`.trim() || 'normal';
                updateStyle({ fontStyle: next as any });
              }} style={{ background: styleRow[0].on ? '#1f2937' : '#111827', color: '#e5e7eb', border: '1px solid #374151', padding: '4px 6px', borderRadius: 4 }}>B</button>
              <button onClick={() => {
                const cur = t.fontStyle || 'normal';
                const has = cur.includes('italic');
                const next = `${cur.includes('bold') ? 'bold' : ''} ${has ? '' : 'italic'}`.trim() || 'normal';
                updateStyle({ fontStyle: next as any });
              }} style={{ background: styleRow[1].on ? '#1f2937' : '#111827', color: '#e5e7eb', border: '1px solid #374151', padding: '4px 6px', borderRadius: 4 }}>I</button>
              <button onClick={() => {
                const cur = t.textDecoration || '';
                const parts = new Set(cur.split(' ').filter(Boolean));
                if (parts.has('underline')) parts.delete('underline'); else parts.add('underline');
                const next = Array.from(parts).join(' ') as any;
                updateStyle({ textDecoration: (next || '') as any });
              }} style={{ background: styleRow[2].on ? '#1f2937' : '#111827', color: '#e5e7eb', border: '1px solid #374151', padding: '4px 6px', borderRadius: 4, textDecoration: 'underline' }}>U</button>
              <button onClick={() => {
                const cur = t.textDecoration || '';
                const parts = new Set(cur.split(' ').filter(Boolean));
                if (parts.has('line-through')) parts.delete('line-through'); else parts.add('line-through');
                const next = Array.from(parts).join(' ') as any;
                updateStyle({ textDecoration: (next || '') as any });
              }} style={{ background: styleRow[3].on ? '#1f2937' : '#111827', color: '#e5e7eb', border: '1px solid #374151', padding: '4px 6px', borderRadius: 4, textDecoration: 'line-through' }}>S</button>
            </div>
          </div>
        );
      })()}
    </div>
  );
}


