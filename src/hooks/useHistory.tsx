/*
  File: src/hooks/useHistory.tsx
  Overview: Undo/Redo history with per-user stacks, diff-based entries, grouping for AI prompts, and hotkeys.
  Semantics:
    - Stores up to 10 most recent entries per user (undo stack). Redo stack cleared on new push.
    - Entry types: create, delete, update. AI grouping coalesces multiple operations in one entry.
    - Applies undo/redo by invoking Firestore upserts/deletes directly; UI updates via subscriptions.
    - Hotkeys: Ctrl/Cmd+Z → undo; Ctrl/Cmd+Shift+Z → redo. Suppressed when ToolContext suppressHotkeys is true.
*/
import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { auth } from '../services/firebase';
import { upsertRect, upsertCircle, upsertText, deleteRect, deleteCircle, deleteText } from '../services/canvas';
import { setHistorySink, type AnySnapshot, type UpdateChange, type HistoryGroupMeta } from '../services/history';
import { useTool } from '../context/ToolContext';
import { generateId } from '../utils/helpers';

type EntryMeta = HistoryGroupMeta & { at: number };

type BaseEntry = { meta: EntryMeta };
type CreateEntry = BaseEntry & { type: 'create'; items: AnySnapshot[] };
type DeleteEntry = BaseEntry & { type: 'delete'; items: AnySnapshot[] };
type UpdateEntry = BaseEntry & { type: 'update'; changes: UpdateChange[] };
type Entry = CreateEntry | DeleteEntry | UpdateEntry;

type Stacks = {
  undo: Entry[];
  redo: Entry[];
};

type HistoryContextValue = {
  canUndo: boolean;
  canRedo: boolean;
  undo: () => Promise<void>;
  redo: () => Promise<void>;
  beginGroup: (meta: HistoryGroupMeta) => void;
  endGroup: () => void;
};

const HistoryContext = createContext<HistoryContextValue | null>(null);

export function HistoryProvider({ children }: { children: React.ReactNode }) {
  const { suppressHotkeys } = useTool();
  const [stacksByUser, setStacksByUser] = useState<Record<string, Stacks>>({});
  const groupBufferRef = useRef<null | { meta: EntryMeta; creates: AnySnapshot[]; deletes: AnySnapshot[]; updates: UpdateChange[] }>(null);

  const uid = auth.currentUser?.uid || 'anon';

  function ensureStacks(): Stacks {
    const cur = stacksByUser[uid];
    if (cur) return cur;
    const next: Stacks = { undo: [], redo: [] };
    setStacksByUser((prev) => ({ ...prev, [uid]: next }));
    return next;
  }

  function pushEntry(entry: Entry) {
    setStacksByUser((prev) => {
      const cur = prev[uid] ?? { undo: [], redo: [] };
      const undo = [entry, ...cur.undo].slice(0, 10);
      const redo: Entry[] = []; // clear redo on new push
      if (import.meta.env.DEV) {
        try { console.log('[history] pushEntry', entry.type, { source: entry.meta?.source, undoLen: undo.length, redoCleared: true }); } catch {}
      }
      return { ...prev, [uid]: { undo, redo } };
    });
  }

  const applyEntryInverse = useCallback(async (entry: Entry) => {
    const mid = generateId('hist');
    if (entry.type === 'create') {
      // inverse of create is delete
      await Promise.all(
        entry.items.map((i) => (i.kind === 'rect' ? deleteRect(i.id) : i.kind === 'circle' ? deleteCircle(i.id) : deleteText(i.id)))
      );
      return;
    }
    if (entry.type === 'delete') {
      // inverse of delete is recreate
      await Promise.all(
        entry.items.map((i) =>
          i.kind === 'rect'
            ? upsertRect({ id: i.id, x: i.x, y: i.y, width: i.width, height: i.height, fill: i.fill, rotation: i.rotation ?? 0, z: i.z }, mid)
            : i.kind === 'circle'
            ? upsertCircle({ id: i.id, cx: i.cx, cy: i.cy, radius: i.radius, fill: i.fill, z: i.z }, mid)
            : upsertText({ id: i.id, x: i.x, y: i.y, width: i.width, height: i.height, text: i.text, fill: i.fill, rotation: i.rotation ?? 0, z: i.z }, mid)
        )
      );
      return;
    }
    if (entry.type === 'update') {
      // inverse of update is apply "before"
      await Promise.all(
        entry.changes.map((c) =>
          c.kind === 'rect'
            ? upsertRect(c.before as any, mid)
            : c.kind === 'circle'
            ? upsertCircle((c.before as any), mid)
            : upsertText((c.before as any), mid)
        )
      );
    }
  }, []);

  const applyEntryForward = useCallback(async (entry: Entry) => {
    const mid = generateId('hist');
    if (entry.type === 'create') {
      await Promise.all(
        entry.items.map((i) =>
          i.kind === 'rect'
            ? upsertRect({ id: i.id, x: i.x, y: i.y, width: i.width, height: i.height, fill: i.fill, rotation: i.rotation ?? 0, z: i.z }, mid)
            : i.kind === 'circle'
            ? upsertCircle({ id: i.id, cx: i.cx, cy: i.cy, radius: i.radius, fill: i.fill, z: i.z }, mid)
            : upsertText({ id: i.id, x: i.x, y: i.y, width: i.width, height: i.height, text: i.text, fill: i.fill, rotation: i.rotation ?? 0, z: i.z }, mid)
        )
      );
      return;
    }
    if (entry.type === 'delete') {
      await Promise.all(entry.items.map((i) => (i.kind === 'rect' ? deleteRect(i.id) : i.kind === 'circle' ? deleteCircle(i.id) : deleteText(i.id))));
      return;
    }
    if (entry.type === 'update') {
      await Promise.all(
        entry.changes.map((c) =>
          c.kind === 'rect'
            ? upsertRect(c.after as any, mid)
            : c.kind === 'circle'
            ? upsertCircle((c.after as any), mid)
            : upsertText((c.after as any), mid)
        )
      );
    }
  }, []);

  const undo = useCallback(async () => {
    const stacks = ensureStacks();
    const entry = stacks.undo[0];
    if (!entry) return;
    if (import.meta.env.DEV) {
      try { console.log('[history] undo start', { type: entry.type, source: entry.meta?.source }); } catch {}
    }
    await applyEntryInverse(entry);
    setStacksByUser((prev) => {
      const cur = prev[uid];
      if (!cur) return prev;
      const undo = cur.undo.slice(1);
      const redo = [entry, ...cur.redo].slice(0, 10);
      if (import.meta.env.DEV) {
        try { console.log('[history] undo applied', { nextUndoLen: undo.length, nextRedoLen: redo.length }); } catch {}
      }
      return { ...prev, [uid]: { undo, redo } };
    });
  }, [applyEntryInverse]);

  const redo = useCallback(async () => {
    const stacks = ensureStacks();
    const entry = stacks.redo[0];
    if (!entry) return;
    if (import.meta.env.DEV) {
      try { console.log('[history] redo start', { type: entry.type, source: entry.meta?.source }); } catch {}
    }
    await applyEntryForward(entry);
    setStacksByUser((prev) => {
      const cur = prev[uid];
      if (!cur) return prev;
      const redo = cur.redo.slice(1);
      const undo = [entry, ...cur.undo].slice(0, 10);
      if (import.meta.env.DEV) {
        try { console.log('[history] redo applied', { nextUndoLen: undo.length, nextRedoLen: redo.length }); } catch {}
      }
      return { ...prev, [uid]: { undo, redo } };
    });
  }, [applyEntryForward]);

  // Install global sink for services and components to record history
  useEffect(() => {
    const sink = {
      beginGroup: (meta: HistoryGroupMeta) => {
        const at = Date.now();
        groupBufferRef.current = { meta: { ...meta, at }, creates: [], deletes: [], updates: [] };
        if (import.meta.env.DEV) {
          try { console.log('[history] beginGroup', meta); } catch {}
        }
      },
      endGroup: () => {
        const buf = groupBufferRef.current;
        groupBufferRef.current = null;
        if (!buf) return;
        const { creates, deletes, updates, meta } = buf;
        if (import.meta.env.DEV) {
          try { console.log('[history] endGroup', { creates: creates.length, deletes: deletes.length, updates: updates.length, meta }); } catch {}
        }
        // Prefer a single combined entry using updates when mixed; otherwise pick by type precedence: create, delete, update
        if (creates.length > 0 && deletes.length === 0 && updates.length === 0) {
          pushEntry({ type: 'create', items: creates, meta });
          return;
        }
        if (deletes.length > 0 && creates.length === 0 && updates.length === 0) {
          pushEntry({ type: 'delete', items: deletes, meta });
          return;
        }
        // For mixed operations or pure updates, consolidate as an update entry with before/after changes
        const changes: UpdateChange[] = [...updates];
        // Represent creates as update from empty? We model them as create entry unless mixed; for mixed we push updates only for actual updates.
        if (changes.length > 0) pushEntry({ type: 'update', changes, meta });
      },
      recordCreate: (items: AnySnapshot[]) => {
        const buf = groupBufferRef.current;
        if (import.meta.env.DEV) {
          try { console.log('[history] recordCreate', items.map((i) => ({ id: (i as any).id, kind: (i as any).kind }))); } catch {}
        }
        if (buf) {
          buf.creates.push(...items);
        } else {
          pushEntry({ type: 'create', items, meta: { source: 'user', at: Date.now() } });
        }
      },
      recordDelete: (items: AnySnapshot[]) => {
        const buf = groupBufferRef.current;
        if (import.meta.env.DEV) {
          try { console.log('[history] recordDelete', items.map((i) => ({ id: (i as any).id, kind: (i as any).kind }))); } catch {}
        }
        if (buf) {
          buf.deletes.push(...items);
        } else {
          pushEntry({ type: 'delete', items, meta: { source: 'user', at: Date.now() } });
        }
      },
      recordUpdate: (changes: UpdateChange[]) => {
        const buf = groupBufferRef.current;
        if (import.meta.env.DEV) {
          try { console.log('[history] recordUpdate', changes.map((c) => ({ id: c.id, kind: c.kind }))); } catch {}
        }
        if (buf) {
          buf.updates.push(...changes);
        } else {
          pushEntry({ type: 'update', changes, meta: { source: 'user', at: Date.now() } });
        }
      },
    } as const;
    setHistorySink(sink);
    return () => setHistorySink(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [uid]);

  // Bind hotkeys
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const isUndoCombo = (e.ctrlKey || e.metaKey) && (e.key === 'z' || e.key === 'Z');
      if (!isUndoCombo) return;
      if (suppressHotkeys) {
        if (import.meta.env.DEV) {
          try { console.log('[history] hotkey ignored due to suppressHotkeys'); } catch {}
        }
        return; // allow text editor/browser to handle undo
      }
      if (import.meta.env.DEV) {
        try { console.log('[history] hotkey', { shift: e.shiftKey, meta: e.metaKey, ctrl: e.ctrlKey }); } catch {}
      }
      e.preventDefault();
      if (e.shiftKey) {
        void redo();
      } else {
        void undo();
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [undo, redo, suppressHotkeys]);

  const value = useMemo<HistoryContextValue>(
    () => ({
      canUndo: (stacksByUser[uid]?.undo?.length || 0) > 0,
      canRedo: (stacksByUser[uid]?.redo?.length || 0) > 0,
      undo,
      redo,
      beginGroup: (meta) => {
        const at = Date.now();
        groupBufferRef.current = { meta: { ...meta, at }, creates: [], deletes: [], updates: [] };
        if (import.meta.env.DEV) {
          try { console.log('[history] beginGroup(value)', meta); } catch {}
        }
      },
      endGroup: () => {
        const buf = groupBufferRef.current;
        groupBufferRef.current = null;
        if (!buf) return;
        const { creates, deletes, updates, meta } = buf;
        if (import.meta.env.DEV) {
          try { console.log('[history] endGroup(value)', { creates: creates.length, deletes: deletes.length, updates: updates.length, meta }); } catch {}
        }
        if (creates.length > 0 && deletes.length === 0 && updates.length === 0) {
          pushEntry({ type: 'create', items: creates, meta });
          return;
        }
        if (deletes.length > 0 && creates.length === 0 && updates.length === 0) {
          pushEntry({ type: 'delete', items: deletes, meta });
          return;
        }
        const changes: UpdateChange[] = [...updates];
        if (changes.length > 0) pushEntry({ type: 'update', changes, meta });
      },
    }), [stacksByUser, uid, undo, redo]
  );

  // Expose debug handles
  useEffect(() => {
    if (!(import.meta.env.DEV)) return;
    try {
      (window as any).__histStacks = stacksByUser;
      (window as any).undo = undo;
      (window as any).redo = redo;
    } catch {}
  }, [stacksByUser, undo, redo]);

  return <HistoryContext.Provider value={value}>{children}</HistoryContext.Provider>;
}

export function useHistory(): HistoryContextValue {
  const ctx = useContext(HistoryContext);
  if (!ctx) throw new Error('useHistory must be used within HistoryProvider');
  return ctx;
}


