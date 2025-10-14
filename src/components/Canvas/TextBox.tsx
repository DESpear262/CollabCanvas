import { Group, Rect, Text } from 'react-konva';
import { useRef } from 'react';

type Props = {
  id: string;
  x: number;
  y: number;
  width: number;
  text: string;
  fill: string;
  selected?: boolean;
  draggable?: boolean;
  onDragEnd?: (pos: { x: number; y: number }) => void;
  onMeasured?: (height: number) => void;
};

export function TextBox({ id, x, y, width, text, fill, selected = false, draggable = false, onDragEnd }: Props) {
  const padding = 6;
  const textRef = useRef<any>(null);
  return (
    <Group name={id} x={x} y={y} draggable={draggable} onDragEnd={(e) => onDragEnd?.({ x: e.target.x(), y: e.target.y() })}>
      <Text ref={textRef} text={text} fontSize={12} fill={fill} width={width} padding={padding} />
      <Rect x={0} y={0} width={width} height={textRef.current?.height?.() + padding * 2 || 14 + padding * 2} fillEnabled={false} strokeEnabled stroke={selected ? '#60a5fa' : '#9ca3af'} dash={[3, 3]} listening={false} />
    </Group>
  );
}


