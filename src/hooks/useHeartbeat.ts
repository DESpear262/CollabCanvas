/*
  File: useHeartbeat.ts
  Overview: Periodically updates the user's presence `lastSeen` timestamp in RTDB.
*/
import { useEffect } from 'react';
import { heartbeat } from '../services/presence';
import { auth } from '../services/firebase';

/**
 * useHeartbeat
 * Sends a repeating heartbeat while the user is signed in.
 * @param intervalMs Interval between heartbeats (ms), default 5000.
 */
export function useHeartbeat(intervalMs: number = 5000) {
  useEffect(() => {
    let timer: number | null = null;
    function start() {
      const u = auth.currentUser;
      if (!u) return;
      void heartbeat(u.uid);
      timer = window.setInterval(() => {
        const user = auth.currentUser;
        if (!user) return;
        heartbeat(user.uid).catch(() => {});
      }, intervalMs);
    }
    start();
    return () => {
      if (timer !== null) window.clearInterval(timer);
    };
  }, [intervalMs]);
}


