/*
  File: Rectangle.tsx
  Overview: Presentation component that renders a draggable, rotatable rectangle on the Konva stage.
*/
import { Rect } from 'react-konva';

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
};

/** Rectangle shape wrapper with id bound to `name` for selection/transform tooling. */
export function Rectangle({ id, x, y, width, height, fill, rotation = 0, onDragStart, onDragEnd, onDragMove, draggable = false }: Props) {
  return (
    <Rect
      name={id}
      x={x}
      y={y}
      width={width}
      height={height}
      fill={fill}
      rotation={rotation}
      draggable={draggable}
      onDragStart={(e) => onDragStart?.({ x: e.target.x(), y: e.target.y() })}
      onDragMove={(e) => onDragMove?.({ x: e.target.x(), y: e.target.y() })}
      onDragEnd={(e) => onDragEnd?.({ x: e.target.x(), y: e.target.y() })}
    />
  );
}


