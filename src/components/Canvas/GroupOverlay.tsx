/*
  File: GroupOverlay.tsx
  Overview: Renders an orange selection box for the active group using world coordinates.
*/
import { Rect } from 'react-konva';

export function GroupOverlay({ bounds }: { bounds: { x: number; y: number; width: number; height: number } | null }) {
  if (!bounds) return null as any;
  return (
    <Rect
      x={bounds.x}
      y={bounds.y}
      width={bounds.width}
      height={bounds.height}
      stroke={'orange'}
      strokeWidth={2}
      dash={[8, 6]}
      listening={false}
    />
  );
}


