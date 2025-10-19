/*
  File: ContextMenu.tsx
  Overview: Lightweight right-click context menu for canvas z-order and alignment actions.
  Usage: Render when an active selection exists and user right-clicks. Position
  via screen-space x/y. Actions are injected by parent to perform z-order and alignment ops.
*/
import React, { useEffect, useRef } from 'react';

type MenuProps = {
  x: number;
  y: number;
  onClose: () => void;
  onBringToFront: () => void;
  onBringForward: () => void;
  onSendBackward: () => void;
  onSendToBack: () => void;
  onAlignLeft: () => void;
  onAlignCenterX: () => void;
  onAlignRight: () => void;
  onAlignTop: () => void;
  onAlignCenterY: () => void;
  onAlignBottom: () => void;
};

export function ContextMenu({ x, y, onClose, onBringToFront, onBringForward, onSendBackward, onSendToBack, onAlignLeft, onAlignCenterX, onAlignRight, onAlignTop, onAlignCenterY, onAlignBottom }: MenuProps) {
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    function handle(e: MouseEvent) {
      const el = ref.current;
      if (!el) return;
      if (!el.contains(e.target as Node)) onClose();
    }
    function handleEsc(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('mousedown', handle);
    document.addEventListener('keydown', handleEsc);
    return () => {
      document.removeEventListener('mousedown', handle);
      document.removeEventListener('keydown', handleEsc);
    };
  }, [onClose]);

  const style: React.CSSProperties = {
    position: 'fixed',
    left: x,
    top: y,
    background: '#111827',
    color: '#e5e7eb',
    border: '1px solid #374151',
    borderRadius: 6,
    padding: 4,
    display: 'flex',
    flexDirection: 'column',
    gap: 4,
    zIndex: 1000,
    minWidth: 200,
  };

  const btn: React.CSSProperties = {
    textAlign: 'left',
    color: '#e5e7eb',
    background: '#1f2937',
    border: '1px solid #374151',
    padding: '6px 8px',
    borderRadius: 4,
  };

  return (
    <div ref={ref} style={style} role="menu" aria-label="Canvas context menu">
      <button style={btn} onClick={() => { onBringToFront(); onClose(); }}>Bring to Front</button>
      <button style={btn} onClick={() => { onBringForward(); onClose(); }}>Bring Forward</button>
      <button style={btn} onClick={() => { onSendBackward(); onClose(); }}>Send Backward</button>
      <button style={btn} onClick={() => { onSendToBack(); onClose(); }}>Send to Back</button>
      <div style={{ height: 1, background: '#374151', margin: '4px 0' }} />
      <button style={btn} onClick={() => { onAlignLeft(); onClose(); }}>Align Left</button>
      <button style={btn} onClick={() => { onAlignCenterX(); onClose(); }}>Align Center X</button>
      <button style={btn} onClick={() => { onAlignRight(); onClose(); }}>Align Right</button>
      <button style={btn} onClick={() => { onAlignTop(); onClose(); }}>Align Top</button>
      <button style={btn} onClick={() => { onAlignCenterY(); onClose(); }}>Align Center Y</button>
      <button style={btn} onClick={() => { onAlignBottom(); onClose(); }}>Align Bottom</button>
      <button style={{ ...btn, background: '#111827' }} onClick={() => onClose()}>Dismiss</button>
    </div>
  );
}


