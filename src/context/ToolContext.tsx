import { createContext, useContext, useEffect, useMemo, useState } from 'react';

export type Tool = 'pan' | 'rect' | 'erase';

type ToolContextValue = {
  tool: Tool;
  setTool: (t: Tool) => void;
};

const ToolContext = createContext<ToolContextValue | null>(null);

export function ToolProvider({ children }: { children: React.ReactNode }) {
  const [tool, setTool] = useState<Tool>('pan');

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === '1') setTool('pan');
      if (e.key === '2') setTool('rect');
      if (e.key === '5') setTool('erase');
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const value = useMemo(() => ({ tool, setTool }), [tool]);
  return <ToolContext.Provider value={value}>{children}</ToolContext.Provider>;
}

export function useTool(): ToolContextValue {
  const ctx = useContext(ToolContext);
  if (!ctx) throw new Error('useTool must be used within ToolProvider');
  return ctx;
}


