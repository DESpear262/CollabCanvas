/*
  File: Circle.tsx
  Overview: Presentation component that renders a draggable circle on the Konva stage.
*/
import { Circle as KonvaCircle } from 'react-konva';
import { useEffect, useRef, memo } from 'react';

type Props = {
  id: string;
  x: number; // center x
  y: number; // center y
  radius: number;
  fill: string;
  draggable?: boolean;
  onDragStart?: (pos: { x: number; y: number }) => void;
  onDragEnd?: (pos: { x: number; y: number }) => void;
  onDragMove?: (pos: { x: number; y: number }) => void;
  fadingOut?: boolean;
  animate?: boolean;
};

/** Circle shape wrapper with id bound to `name` for selection/transform tooling. */
function CircleImpl({ id, x, y, radius, fill, draggable = false, onDragStart, onDragEnd, onDragMove, fadingOut = false, animate = true }: Props) {
  const nodeRef = useRef<any>(null);
  useEffect(() => {
    const n = nodeRef.current;
    if (!animate || !n || (n as any)._ccAnimatedIn) return;
    try {
      n.opacity(0);
      (n as any)._ccAnimatedIn = true;
      n.to({ opacity: 1, duration: 0.18 });
    } catch {}
  }, []);
  useEffect(() => {
    if (!animate || !fadingOut) return;
    const n = nodeRef.current;
    try {
      n.to({ opacity: 0, duration: 0.18 });
    } catch {}
  }, [fadingOut]);
  return (
    <KonvaCircle
      ref={nodeRef}
      name={id}
      x={x}
      y={y}
      radius={radius}
      fill={fill}
      draggable={draggable}
      perfectDrawEnabled={false}
      shadowForStrokeEnabled={false}
      onDragStart={(e) => onDragStart?.({ x: e.target.x(), y: e.target.y() })}
      onDragMove={(e) => onDragMove?.({ x: e.target.x(), y: e.target.y() })}
      onDragEnd={(e) => onDragEnd?.({ x: e.target.x(), y: e.target.y() })}
    />
  );
}

export const Circle = memo(CircleImpl);


