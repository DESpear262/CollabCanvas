/*
  File: Lasso.tsx
  Overview: Renders a lasso polygon with Blender-like styling for area selection.
  Accepts an array of world-space points.
*/
import { Line } from 'react-konva';

type Props = {
  points: Array<{ x: number; y: number }>;
};

export function Lasso({ points }: Props) {
  const flat = points.flatMap((p) => [p.x, p.y]);
  return (
    <Line
      points={flat}
      closed={true}
      fill={'rgba(96,165,250,0.15)'}
      stroke={'#9ca3af'}
      strokeWidth={1}
      dash={[4, 4]}
      listening={false}
    />
  );
}


