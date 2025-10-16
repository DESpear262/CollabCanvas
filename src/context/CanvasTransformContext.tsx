/*
  File: CanvasTransformContext.tsx
  Overview: Provides a React context to share canvas pan/zoom transform across the app.
  Usage:
    - Wrap interactive canvas UI with `CanvasTransformProvider`.
    - Call `useCanvasTransform()` inside descendants to access `scale`, `position`, and `setTransform`.
  Notes:
    - `setTransform` is the only mutator; consumers should prefer it to keep transform updates consistent.
*/
import { createContext, useContext, useMemo, useRef, useState } from 'react';

/** World-space point in the canvas coordinate system */
type Point = { x: number; y: number };

/**
 * The value exposed by `CanvasTransformContext`.
 * - `containerRef`: host element that receives pointer events for world<->screen math.
 * - `scale`: zoom level (1 == 100%).
 * - `position`: stage top-left offset in screen pixels.
 * - `setTransform`: atomically update scale and position.
 */
type CanvasTransformContextValue = {
  containerRef: React.RefObject<HTMLDivElement | null>;
  scale: number;
  position: Point;
  setTransform: (next: { scale: number; position: Point }) => void;
};

const CanvasTransformContext = createContext<CanvasTransformContextValue | null>(null);

/**
 * CanvasTransformProvider
 * Wraps children with shared pan/zoom transform state for the Konva Stage.
 */
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

/**
 * useCanvasTransform
 * Access the current pan/zoom transform. Must be used within `CanvasTransformProvider`.
 * Throws if called outside the provider to surface integration errors early.
 */
export function useCanvasTransform(): CanvasTransformContextValue {
  const ctx = useContext(CanvasTransformContext);
  if (!ctx) throw new Error('useCanvasTransform must be used within CanvasTransformProvider');
  return ctx;
}


