import { useCallback, useEffect, useRef } from 'react';
import { updateCursorPresence } from '../services/presence';
import { CURSOR_UPDATE_THROTTLE_MS } from '../utils/constants';
import { auth } from '../services/firebase';
import { useCanvasTransform } from '../context/CanvasTransformContext';

// Publish cursor in world coordinates based on canvas transform
export function useCursor(containerRef: React.RefObject<HTMLElement | null>) {
  const { scale, position } = useCanvasTransform();
  const lastSentRef = useRef(0);

  const onMouseMove = useCallback(
    (e: MouseEvent) => {
      const container = containerRef.current;
      if (!container) return;

      const now = performance.now();
      if (now - lastSentRef.current < CURSOR_UPDATE_THROTTLE_MS) return;
      lastSentRef.current = now;

      const rect = container.getBoundingClientRect();
      const localX = e.clientX - rect.left;
      const localY = e.clientY - rect.top;

      // Convert local screen coords -> world coords
      const x = (localX - position.x) / scale;
      const y = (localY - position.y) / scale;

      const u = auth.currentUser;
      if (!u) return;

      updateCursorPresence({
        uid: u.uid,
        email: u.email,
        displayName: u.displayName,
        cursor: { x, y },
      }).catch(() => {});
    },
    [containerRef, scale, position]
  );

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const handleMove = (ev: MouseEvent) => onMouseMove(ev);
    container.addEventListener('mousemove', handleMove);
    container.addEventListener('mouseleave', () => {
      const u = auth.currentUser;
      if (!u) return;
      updateCursorPresence({ uid: u.uid, email: u.email, displayName: u.displayName, cursor: null }).catch(() => {});
    });
    return () => {
      container.removeEventListener('mousemove', handleMove);
    };
  }, [containerRef, onMouseMove]);
}


