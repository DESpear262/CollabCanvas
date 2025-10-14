import { createContext, useContext, useMemo, useRef, useState } from 'react';

type Point = { x: number; y: number };

type CanvasTransformContextValue = {
  containerRef: React.RefObject<HTMLDivElement | null>;
  scale: number;
  position: Point;
  setTransform: (next: { scale: number; position: Point }) => void;
};

const CanvasTransformContext = createContext<CanvasTransformContextValue | null>(null);

export function CanvasTransformProvider({ children }: { children: React.ReactNode }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);
  const [position, setPosition] = useState<Point>({ x: 0, y: 0 });

  const value = useMemo<CanvasTransformContextValue>(
    () => ({
      containerRef,
      scale,
      position,
      setTransform: ({ scale: s, position: p }) => {
        setScale(s);
        setPosition(p);
      },
    }),
    [scale, position]
  );

  return <CanvasTransformContext.Provider value={value}>{children}</CanvasTransformContext.Provider>;
}

export function useCanvasTransform(): CanvasTransformContextValue {
  const ctx = useContext(CanvasTransformContext);
  if (!ctx) throw new Error('useCanvasTransform must be used within CanvasTransformProvider');
  return ctx;
}


