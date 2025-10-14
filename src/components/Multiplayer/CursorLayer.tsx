import { useRef } from 'react';
import { useCursor } from '../../hooks/useCursor';
import { usePresence } from '../../hooks/usePresence';
import { Cursor } from './Cursor';
import { useCanvasTransform } from '../../context/CanvasTransformContext';

export function CursorLayer() {
  const overlayRef = useRef<HTMLDivElement>(null);
  const { others } = usePresence();
  const { scale, position, containerRef } = useCanvasTransform();
  // Listen for cursor movement on the actual canvas container (receives pointer events)
  useCursor(containerRef);

  return (
    <div ref={overlayRef} style={{ position: 'relative', width: '100%', height: '100%' }}>
      {others.map((u) => {
        if (!u.cursor) return null;
        // Convert world -> local (overlay shares the same parent as the Stage)
        const x = u.cursor.x * scale + position.x;
        const y = u.cursor.y * scale + position.y;
        return <Cursor key={u.uid} x={x} y={y} label={u.email ?? u.displayName ?? u.uid} />;
      })}
    </div>
  );
}


