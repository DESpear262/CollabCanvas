/*
  File: useConnectionStatus.ts
  Overview: Reports unified online/offline status based on both RTDB and Firestore connectivity.
  Rules:
    - Online only if BOTH RTDB and Firestore are connected
    - Offline if either is disconnected
  Notes:
    - RTDB connectivity uses the special path `.info/connected`.
    - Firestore connectivity inferred via onSnapshot server responses
      (metadata.fromCache === false indicates server reached).
*/
import { useEffect, useRef, useState } from 'react';
import { rtdb, db } from '../services/firebase';
import { onValue, ref as rtdbRef } from 'firebase/database';
import { doc, onSnapshot } from 'firebase/firestore';

export type ConnectionStatus = {
  connected: boolean;
  rtdbConnected: boolean;
  firestoreConnected: boolean;
  lastChangedAt: number;
};

export function useConnectionStatus(): ConnectionStatus {
  const [rtdbConnected, setRtdbConnected] = useState<boolean>(false);
  const [firestoreConnected, setFirestoreConnected] = useState<boolean>(false);
  const [connected, setConnected] = useState<boolean>(false);
  const lastChangedAtRef = useRef<number>(Date.now());
  const [, forceTick] = useState<number>(0);

  // RTDB connectivity: event-driven via .info/connected
  useEffect(() => {
    const infoRef = rtdbRef(rtdb, '.info/connected');
    const off = onValue(infoRef, (snap) => {
      const isConnected = Boolean(snap.val());
      setRtdbConnected(isConnected);
    });
    return () => off();
  }, []);

  // Firestore connectivity: infer via server-backed snapshots of a known doc
  // Using the canonical canvas document path described in project docs: canvas/default
  useEffect(() => {
    const unsub = onSnapshot(
      doc(db, 'canvas', 'default'),
      { includeMetadataChanges: true },
      (snap) => {
        // If this snapshot came from the server, we consider Firestore connected
        const serverBacked = snap.metadata.fromCache === false;
        setFirestoreConnected(serverBacked);
      },
      () => {
        // Any snapshot listener error is treated as disconnected
        setFirestoreConnected(false);
      }
    );

    const handleOffline = () => setFirestoreConnected(false);
    window.addEventListener('offline', handleOffline);
    return () => {
      unsub();
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  // Unified connected flag and change timestamp
  useEffect(() => {
    const next = rtdbConnected && firestoreConnected;
    setConnected((prev) => {
      if (prev !== next) {
        lastChangedAtRef.current = Date.now();
        // tick a cheap state to let consumers re-render if they rely on lastChangedAt
        forceTick((n) => n + 1);
      }
      return next;
    });
  }, [rtdbConnected, firestoreConnected]);

  return {
    connected,
    rtdbConnected,
    firestoreConnected,
    lastChangedAt: lastChangedAtRef.current,
  };
}



