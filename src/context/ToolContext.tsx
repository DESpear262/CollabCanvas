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

export function ToolProvider({ children }: { children: React.ReactNode }) {
  const [tool, setTool] = useState<Tool>('pan');
  const [suppressHotkeys, setSuppressHotkeys] = useState(false);
  const [activeColor, setActiveColorState] = useState('#3b82f6');
  const [recentColors, setRecentColors] = useState<string[]>(['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#a78bfa', '#f472b6']);

  useEffect(() => {
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

export function useTool(): ToolContextValue {
  const ctx = useContext(ToolContext);
  if (!ctx) throw new Error('useTool must be used within ToolProvider');
  return ctx;
}


