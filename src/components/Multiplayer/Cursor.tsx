type Props = {
  x: number;
  y: number;
  label: string;
  color?: string;
};

export function Cursor({ x, y, label, color = '#3b82f6' }: Props) {
  const size = 10;
  const style: React.CSSProperties = {
    position: 'absolute',
    left: x,
    top: y,
    transform: 'translate(-50%, -50%)',
    pointerEvents: 'none',
    zIndex: 10,
  };
  return (
    <div style={style}>
      <div style={{ width: size, height: size, borderRadius: '50%', background: color, boxShadow: '0 0 0 2px white' }} />
      <div style={{ marginTop: 6, padding: '2px 6px', fontSize: 12, background: 'rgba(0,0,0,0.7)', color: 'white', borderRadius: 4, whiteSpace: 'nowrap' }}>
        {label}
      </div>
    </div>
  );
}


