import { useRef } from 'react';
import { useCursor } from '../../hooks/useCursor';
import { usePresence } from '../../hooks/usePresence';
import { Cursor } from './Cursor';

export function CursorLayer() {
  const ref = useRef<HTMLDivElement>(null);
  useCursor(ref);
  const { others } = usePresence();

  return (
    <div ref={ref} style={{ position: 'relative', width: '100%', height: 'calc(100vh - 60px)' }}>
      {others.map((u) => u.cursor && (
        <Cursor key={u.uid} x={u.cursor.x} y={u.cursor.y} label={u.email ?? u.displayName ?? u.uid} />
      ))}
    </div>
  );
}


