/*
  File: Marquee.tsx
  Overview: Renders a Blender-like marquee rectangle with dashed border and subtle fill.
  Used for rectangle area selection. Pure presentational.
*/
import { Rect } from 'react-konva';

type Props = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export function Marquee({ x, y, width, height }: Props) {
  return (
    <Rect
      x={x}
      y={y}
      width={width}
      height={height}
      fill={'rgba(96,165,250,0.15)'}
      stroke={'#9ca3af'}
      strokeWidth={1}
      dash={[4, 4]}
      listening={false}
    />
  );
}


