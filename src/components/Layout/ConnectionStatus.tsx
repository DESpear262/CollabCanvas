/*
  File: ConnectionStatus.tsx
  Overview: Renders a compact online/offline indicator based on unified connectivity.
  UX:
    - Online when BOTH RTDB and Firestore are connected; otherwise Offline
    - Minimal footprint; intended to sit under the user email in Header
  Future polish (PR #36): toast on reconnect
*/
import { useEffect, useRef, useState } from 'react';
import { useConnectionStatus } from '../../hooks/useConnectionStatus';

export function ConnectionStatus() {
  const { connected, lastChangedAt } = useConnectionStatus();
  const [showToast, setShowToast] = useState(false);
  const prevConnected = useRef<boolean>(connected);

  useEffect(() => {
    const was = prevConnected.current;
    if (!was && connected) {
      setShowToast(true);
      const t = setTimeout(() => setShowToast(false), 2200);
      return () => clearTimeout(t);
    }
    prevConnected.current = connected;
  }, [connected, lastChangedAt]);

  const label = connected ? 'Online' : 'Offline';
  const color = connected ? '#10b981' : '#ef4444';
  const bg = connected ? 'rgba(16,185,129,0.12)' : 'rgba(239,68,68,0.12)';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 2 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <span aria-hidden style={{ width: 8, height: 8, borderRadius: 999, background: color, boxShadow: `0 0 0 2px ${bg}` }} />
        <span style={{ fontSize: 12, color: '#4b5563' }}>{label}</span>
      </div>
      {showToast ? (
        <div style={{ fontSize: 12, color: '#065f46', background: 'rgba(16,185,129,0.12)', border: '1px solid #a7f3d0', padding: '4px 8px', borderRadius: 6, width: 'fit-content' }}>
          Reconnected
        </div>
      ) : null}
    </div>
  );
}

export default ConnectionStatus;


