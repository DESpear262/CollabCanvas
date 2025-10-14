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
        // Convert world -> local
        // Convert world->local; account for the Stage container offset within the page
        const container = containerRef.current;
        let offsetX = 0, offsetY = 0;
        if (container) {
          const rect = container.getBoundingClientRect();
          offsetX = rect.left;
          offsetY = rect.top;
        }
        const x = u.cursor.x * scale + position.x + 0; // fine-tune with +0 if needed
        const y = u.cursor.y * scale + position.y + 0;
        return <Cursor key={u.uid} x={x} y={y} label={u.email ?? u.displayName ?? u.uid} />;
      })}
    </div>
  );
}


