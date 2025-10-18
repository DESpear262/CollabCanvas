/*
  File: useKeyboard.ts
  Overview: One-shot keyboard shortcuts for canvas actions (PR #26).
  Behaviors:
    - Delete: delete current selection
    - Arrow keys: nudge selection (10px); Shift+Arrow = fine nudge (1px)
    - Cmd/Ctrl+D: duplicate selection with +20,+20 offset
    - Escape: clear selection
  Suppression:
    - While text editing (isEditing=true)
    - When an input/textarea/contentEditable has focus
*/
import { useEffect } from 'react';

type Options = {
  enabled: boolean;
  isEditing: boolean;
  onDelete: () => void;
  onDuplicate: () => void;
  onNudge: (dx: number, dy: number) => void;
  onEscape: () => void;
  onCopy?: () => void;
  onPaste?: () => void;
};

function isTypingTarget(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  if (!el) return false;
  const tag = el.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA' || (el as any).isContentEditable) return true;
  return false;
}

export function useKeyboard({ enabled, isEditing, onDelete, onDuplicate, onNudge, onEscape, onCopy, onPaste }: Options) {
  useEffect(() => {
    if (!enabled) return;
    function onKeyDown(e: KeyboardEvent) {
      if (!enabled) return;
      if (isEditing) return;
      if (isTypingTarget(e.target)) return;
      if (e.repeat) return; // one-shot only

      const key = e.key;
      const ctrlOrMeta = e.ctrlKey || e.metaKey;

      // Duplicate: Cmd/Ctrl + D
      if (ctrlOrMeta && (key === 'd' || key === 'D')) {
        e.preventDefault();
        onDuplicate();
        return;
      }

      // Copy: Cmd/Ctrl + C (only when not editing text)
      if (ctrlOrMeta && (key === 'c' || key === 'C')) {
        if (onCopy) {
          e.preventDefault();
          onCopy();
          return;
        }
      }

      // Paste: Cmd/Ctrl + V (only when not editing text)
      if (ctrlOrMeta && (key === 'v' || key === 'V')) {
        if (onPaste) {
          e.preventDefault();
          onPaste();
          return;
        }
      }

      // Delete key
      if (key === 'Delete' || key === 'Backspace') {
        e.preventDefault();
        onDelete();
        return;
      }

      // Escape clears selection
      if (key === 'Escape') {
        e.preventDefault();
        onEscape();
        return;
      }

      // Arrow nudge: Shift = fine (1px), else 10px
      const step = e.shiftKey ? 1 : 10;
      if (key === 'ArrowLeft') { e.preventDefault(); onNudge(-step, 0); return; }
      if (key === 'ArrowRight') { e.preventDefault(); onNudge(step, 0); return; }
      if (key === 'ArrowUp') { e.preventDefault(); onNudge(0, -step); return; }
      if (key === 'ArrowDown') { e.preventDefault(); onNudge(0, step); return; }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [enabled, isEditing, onDelete, onDuplicate, onNudge, onEscape]);
}


