/*
  File: useTextEditor.tsx
  Overview: Encapsulates inline HTML textarea editing for text nodes on the Konva stage.
*/

import { useCallback, useRef, useState } from 'react';
import type { CSSProperties, ChangeEvent } from 'react';
import type { TextData } from '../../../services/canvas';
import { upsertText } from '../../../services/canvas';
import { generateId } from '../../../utils/helpers';
import { recordUpdate } from '../../../services/history';

export type UseTextEditorDeps = {
  scale: number;
  position: { x: number; y: number };
  texts: TextData[];
  setTexts: React.Dispatch<React.SetStateAction<TextData[]>>;
  setSuppressHotkeys?: (v: boolean) => void;
  rememberMutationId: (id: string) => void;
};

export function useTextEditor(deps: UseTextEditorDeps) {
  const [editing, setEditing] = useState<null | { id: string; original: string; value: string }>(null);
  const editorRef = useRef<HTMLTextAreaElement | null>(null);
  const [editorStyle, setEditorStyle] = useState<CSSProperties>({ display: 'none' });
  const upsertDebounceRef = useRef<number>(0 as unknown as number);
  const [toolbar, setToolbar] = useState<null | { left: number; top: number; width: number; id: string }>(null);
  const toolbarInteractingRef = useRef(false);

  /** Open an inline HTML textarea editor positioned over the Konva stage for a text node. */
  const openTextEditor = useCallback((id: string, evt?: any) => {
    const target = deps.texts.find((t) => t.id === id);
    if (!target) return;
    // Compute on-screen position based on world coords, stage scale and position
    const left = target.x * deps.scale + deps.position.x;
    const top = target.y * deps.scale + deps.position.y;
    const widthPx = Math.max(20, target.width * deps.scale);
    const baseLine = 14; // approx for fontSize 12
    const padding = 6 * deps.scale;
    const heightPx = (baseLine + padding * 2);
    setEditing({ id, original: target.text, value: target.text });
    deps.setSuppressHotkeys?.(true);
    setToolbar({ left, top: Math.max(0, top - 36), width: widthPx, id });
    setEditorStyle({
      position: 'absolute',
      left,
      top,
      width: widthPx,
      height: heightPx,
      lineHeight: `${Math.round(1.2 * 12 * deps.scale)}px`,
      fontSize: `${12 * deps.scale}px`,
      color: target.fill,
      background: 'transparent',
      border: '1px solid #60a5fa',
      padding: `${padding}px`,
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
              const localX = (p.x - deps.position.x) / deps.scale - target.x; // world to local
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
  }, [deps.scale, deps.position, deps.texts]);

  /** Close the inline editor; optionally commit the edits to Firestore. */
  const closeTextEditor = useCallback((commit: boolean) => {
    const ed = editing;
    setEditing(null);
    setEditorStyle((s) => ({ ...s, display: 'none' }));
    setToolbar(null);
    deps.setSuppressHotkeys?.(false);
    if (!ed) return;
    if (!commit) {
      return;
    }
    // Commit immediately (also clears any pending debounce)
    if (upsertDebounceRef.current) window.clearTimeout(upsertDebounceRef.current);
    const target = deps.texts.find((t) => t.id === ed.id);
    if (!target) return;
    const next = { ...target, text: ed.value } as TextData;
    deps.setTexts((prev) => prev.map((t) => (t.id === ed.id ? next : t)));
    const mid = generateId('mut');
    deps.rememberMutationId(mid);
    void upsertText(next, mid);
    // history: text edit as update (before original text)
    const before = { kind: 'text', ...target } as any;
    const after = { kind: 'text', ...next } as any;
    recordUpdate([{ kind: 'text', id: target.id, before, after } as any]);
  }, [editing, deps.texts]);

  /** Debounced text change handler that streams updates for collaborative feedback. */
  const handleEditorChange = useCallback((e: ChangeEvent<HTMLTextAreaElement>) => {
    const val = e.target.value;
    setEditing((prev) => (prev ? { ...prev, value: val } : prev));
    if (upsertDebounceRef.current) window.clearTimeout(upsertDebounceRef.current);
    upsertDebounceRef.current = window.setTimeout(() => {
      const ed = editing;
      if (!ed) return;
      const target = deps.texts.find((t) => t.id === ed.id);
      if (!target) return;
      const next = { ...target, text: val } as TextData;
      deps.setTexts((prev) => prev.map((t) => (t.id === ed.id ? next : t)));
      const mid = generateId('mut');
      deps.rememberMutationId(mid);
      void upsertText(next, mid);
    }, 300) as unknown as number;
  }, [editing, deps.texts]);

  function updateStyle(partial: Partial<Pick<TextData, 'fontFamily' | 'fontSize' | 'fontStyle' | 'textDecoration'>>) {
    const ed = editing; if (!ed) return;
    const target = deps.texts.find((t) => t.id === ed.id);
    if (!target) return;
    const next = { ...target, ...partial } as TextData;
    deps.setTexts((prev) => prev.map((t) => (t.id === ed.id ? next : t)));
    const mid = generateId('mut');
    deps.rememberMutationId(mid);
    void upsertText(next, mid);
    // also reflect immediately in overlay appearance
    setEditorStyle((s) => ({
      ...s,
      fontSize: `${(next.fontSize || 12) * deps.scale}px`,
      fontFamily: next.fontFamily,
      fontStyle: next.fontStyle as any,
      textDecoration: next.textDecoration as any,
    }));
  }

  function startToolbarInteraction() { toolbarInteractingRef.current = true; }
  function endToolbarInteraction() { toolbarInteractingRef.current = false; }

  return { editing, editorStyle, editorRef, openTextEditor, closeTextEditor, handleEditorChange, toolbar, updateStyle, startToolbarInteraction, endToolbarInteraction, toolbarInteractingRef } as const;
}


