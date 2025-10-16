/*
  File: Cursor.tsx
  Overview: Presentational component that draws a dot and label at given screen coordinates.
*/
type Props = {
  x: number;
  y: number;
  label: string;
  color?: string;
};

/** Lightweight screen-space cursor indicator with configurable color and label. */
export function Cursor({ x, y, label, color = '#3b82f6' }: Props) {
  const size = 10;
  const wrapper: React.CSSProperties = {
    position: 'absolute',
    left: x,
    top: y,
    pointerEvents: 'none',
    zIndex: 10,
  };
  const dot: React.CSSProperties = {
    position: 'absolute',
    left: -size / 2,
    top: -size / 2,
    width: size,
    height: size,
    borderRadius: '50%',
    background: color,
    boxShadow: '0 0 0 2px white',
  };
  const labelStyle: React.CSSProperties = {
    marginLeft: 8,
    padding: '2px 6px',
    fontSize: 12,
    background: 'rgba(0,0,0,0.7)',
    color: 'white',
    borderRadius: 4,
    whiteSpace: 'nowrap',
    position: 'relative',
    left: size / 2,
    top: -size / 2,
  };
  return (
    <div style={wrapper}>
      <div style={dot} />
      <div style={labelStyle}>{label}</div>
    </div>
  );
}


