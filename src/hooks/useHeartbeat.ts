import { useEffect } from 'react';
import { heartbeat } from '../services/presence';
import { auth } from '../services/firebase';

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


