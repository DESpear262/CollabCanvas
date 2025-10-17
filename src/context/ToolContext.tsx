/*
  File: ToolContext.tsx
  Overview: Centralized tool-selection state ("transform"/rect/circle/text/select/erase) and color palette.
  Usage:
    - Wrap app UI with `ToolProvider`.
    - Call `useTool()` to read/update the current tool, color, and hotkey suppression.

  Terminology note:
    - UI labels refer to the primary tool as "Transform" (pan/rotate/resize).
    - Internally we keep the tool key as 'pan' for backwards compatibility with existing code.
      This intentional inconsistency is documented here to avoid confusion.

  Hotkeys:
    1: Transform (pan), 2: Rect, 3: Circle, 4: Text, 5: Erase, 6: Select
    (disabled when suppressHotkeys=true)
*/
import { createContext, useContext, useEffect, useMemo, useState } from 'react';

export type Tool = 'pan' | 'rect' | 'circle' | 'text' | 'select' | 'erase';

type ToolContextValue = {
  tool: Tool;
  setTool: (t: Tool) => void;
  suppressHotkeys: boolean;
  setSuppressHotkeys: (s: boolean) => void;
  activeColor: string;
  setActiveColor: (c: string) => void;
  recentColors: string[];
};

const ToolContext = createContext<ToolContextValue | null>(null);

/**
 * ToolProvider
 * Holds current drawing tool and color settings. Also binds numeric key hotkeys.
 */
export function ToolProvider({ children }: { children: React.ReactNode }) {
  const [tool, setTool] = useState<Tool>('pan');
  const [suppressHotkeys, setSuppressHotkeys] = useState(false);
  const [activeColor, setActiveColorState] = useState('#3b82f6');
  const [recentColors, setRecentColors] = useState<string[]>(['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#a78bfa', '#f472b6']);

  useEffect(() => {
    // Map number keys to tools when hotkeys are not suppressed (e.g., while editing text)
    function onKey(e: KeyboardEvent) {
      if (suppressHotkeys) return;
      if (e.key === '1') setTool('pan');
      if (e.key === '2') setTool('rect');
      if (e.key === '3') setTool('circle');
      if (e.key === '4') setTool('text');
      if (e.key === '6') setTool('select');
      if (e.key === '5') setTool('erase');
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [suppressHotkeys]);

  /** Set active color and record it to the front of recent colors list. */
  function setActiveColor(c: string) {
    setActiveColorState(c);
    setRecentColors((prev) => {
      const next = [c, ...prev.filter((x) => x !== c)];
      return next.slice(0, 8);
    });
  }

  const value = useMemo(
    () => ({ tool, setTool, suppressHotkeys, setSuppressHotkeys, activeColor, setActiveColor, recentColors }),
    [tool, suppressHotkeys, activeColor, recentColors]
  );
  return <ToolContext.Provider value={value}>{children}</ToolContext.Provider>;
}

/**
 * useTool
 * Access current tool and color palette. Must be used within `ToolProvider`.
 */
export function useTool(): ToolContextValue {
  const ctx = useContext(ToolContext);
  if (!ctx) throw new Error('useTool must be used within ToolProvider');
  return ctx;
}


