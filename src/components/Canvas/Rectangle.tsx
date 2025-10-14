import { Rect } from 'react-konva';

type Props = {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  fill: string;
  onDragEnd?: (pos: { x: number; y: number }) => void;
  draggable?: boolean;
};

export function Rectangle({ id, x, y, width, height, fill, onDragEnd, draggable = false }: Props) {
  return (
    <Rect
      name={id}
      x={x}
      y={y}
      width={width}
      height={height}
      fill={fill}
      draggable={draggable}
      onDragEnd={(e) => onDragEnd?.({ x: e.target.x(), y: e.target.y() })}
    />
  );
}


