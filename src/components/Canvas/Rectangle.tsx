/*
  File: Rectangle.tsx
  Overview: Presentation component that renders a draggable, rotatable rectangle on the Konva stage.
*/
import { Rect } from 'react-konva';
import { useEffect, useRef, memo } from 'react';

type Props = {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  fill: string;
  rotation?: number;
  onDragStart?: (pos: { x: number; y: number }) => void;
  onDragEnd?: (pos: { x: number; y: number }) => void;
  onDragMove?: (pos: { x: number; y: number }) => void;
  draggable?: boolean;
  fadingOut?: boolean;
  animate?: boolean;
};

/** Rectangle shape wrapper with id bound to `name` for selection/transform tooling. */
function RectangleImpl({ id, x, y, width, height, fill, rotation = 0, onDragStart, onDragEnd, onDragMove, draggable = false, fadingOut = false, animate = true }: Props) {
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
    <Rect
      ref={nodeRef}
      name={id}
      x={x}
      y={y}
      width={width}
      height={height}
      fill={fill}
      rotation={rotation}
      draggable={draggable}
      perfectDrawEnabled={false}
      shadowForStrokeEnabled={false}
      onDragStart={(e) => onDragStart?.({ x: e.target.x(), y: e.target.y() })}
      onDragMove={(e) => onDragMove?.({ x: e.target.x(), y: e.target.y() })}
      onDragEnd={(e) => onDragEnd?.({ x: e.target.x(), y: e.target.y() })}
    />
  );
}

export const Rectangle = memo(RectangleImpl);


