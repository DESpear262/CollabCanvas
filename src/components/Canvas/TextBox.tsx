/*
  File: TextBox.tsx
  Overview: Konva text node with selection frame, supporting rotation and external HTML overlay editing.
*/
import { Group, Rect, Text } from 'react-konva';
import { useEffect, useRef } from 'react';

type Props = {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  text: string;
  fill: string;
  rotation?: number;
  selected?: boolean;
  editing?: boolean;
  draggable?: boolean;
  onDragStart?: (pos: { x: number; y: number }) => void;
  onDragEnd?: (pos: { x: number; y: number }) => void;
  onDragMove?: (pos: { x: number; y: number }) => void;
  onMeasured?: (height: number) => void;
  onRequestEdit?: (evt: any) => void; // fired when user clicks text while selected
  fadingOut?: boolean;
};

/**
 * TextBox
 * Displays a single-line text node with a dashed selection frame. Emits `onRequestEdit` when clicked while selected
 * to allow the parent to open an HTML textarea overlay for editing without Konva contentEditable.
 */
export function TextBox({ id, x, y, width, height, text, fill, rotation = 0, selected = false, editing = false, draggable = false, onDragStart, onDragEnd, onDragMove, onRequestEdit, fadingOut = false }: Props) {
  const padding = 6;
  const textRef = useRef<any>(null);
  const groupRef = useRef<any>(null);
  useEffect(() => {
    const n = groupRef.current;
    if (!n || (n as any)._ccAnimatedIn) return;
    try {
      n.opacity(0);
      (n as any)._ccAnimatedIn = true;
      n.to({ opacity: 1, duration: 0.18 });
    } catch {}
  }, []);
  useEffect(() => {
    if (!fadingOut) return;
    const n = groupRef.current;
    try {
      n.to({ opacity: 0, duration: 0.18 });
    } catch {}
  }, [fadingOut]);
  return (
    <Group ref={groupRef} name={id} x={x} y={y} rotation={rotation} draggable={draggable} onDragStart={(e) => onDragStart?.({ x: e.target.x(), y: e.target.y() })} onDragMove={(e) => onDragMove?.({ x: e.target.x(), y: e.target.y() })} onDragEnd={(e) => onDragEnd?.({ x: e.target.x(), y: e.target.y() })}>
      <Text
        ref={textRef}
        text={text}
        fontSize={12}
        fill={fill}
        width={width}
        padding={padding}
        opacity={editing ? 0 : 1}
        listening={!editing}
        onMouseDown={(e) => {
          // When already selected, a click inside the text begins editing.
          if (selected) {
            // prevent stage click handlers from reprocessing this event
            // and allow the parent to open an HTML editor overlay
            e.cancelBubble = true;
            onRequestEdit?.(e);
          }
        }}
      />
      <Rect
        x={0}
        y={0}
        width={width}
        height={Math.max(height, (textRef.current?.height?.() || 14) + padding * 2)}
        fillEnabled={false}
        strokeEnabled
        stroke={selected ? '#60a5fa' : '#9ca3af'}
        shadowForStrokeEnabled={selected}
        shadowColor={selected ? '#60a5fa' : undefined}
        shadowBlur={selected ? 8 : undefined}
        shadowOpacity={selected ? 0.6 : undefined}
        dash={[3, 3]}
        hitStrokeWidth={10}
        listening={!editing}
        onMouseDown={(e) => {
          if (!editing) {
            // Start dragging the group when grabbing the frame
            const group = e.target.getParent();
            if (group && group.startDrag) group.startDrag();
            e.cancelBubble = true;
          }
        }}
      />
    </Group>
  );
}


