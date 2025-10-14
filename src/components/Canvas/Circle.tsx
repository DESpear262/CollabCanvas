import { Circle as KonvaCircle } from 'react-konva';

type Props = {
  id: string;
  x: number; // center x
  y: number; // center y
  radius: number;
  fill: string;
  draggable?: boolean;
  onDragEnd?: (pos: { x: number; y: number }) => void;
  onDragMove?: (pos: { x: number; y: number }) => void;
};

export function Circle({ id, x, y, radius, fill, draggable = false, onDragEnd, onDragMove }: Props) {
  return (
    <KonvaCircle
      name={id}
      x={x}
      y={y}
      radius={radius}
      fill={fill}
      draggable={draggable}
      onDragMove={(e) => onDragMove?.({ x: e.target.x(), y: e.target.y() })}
      onDragEnd={(e) => onDragEnd?.({ x: e.target.x(), y: e.target.y() })}
    />
  );
}


