/*
  File: usePresence.ts
  Overview: Subscribes to live presence records and derives online users and others.
  Behavior:
    - Subscribes to RTDB presence list.
    - Marks records online if `lastSeen` within ONLINE_THRESHOLD_MS.
    - Splits out `others` (everyone except the current user).
*/
import { useEffect, useMemo, useState } from 'react';
import { subscribeToPresence, type PresenceRecord } from '../services/presence';
import { auth } from '../services/firebase';
import { ONLINE_THRESHOLD_MS } from '../utils/constants';

/**
 * usePresence
 * Returns arrays of online users and others (excluding the current user).
 */
export function usePresence() {
  const [records, setRecords] = useState<PresenceRecord[]>([]);

  useEffect(() => {
    const unsub = subscribeToPresence(setRecords);
    return () => unsub();
  }, []);

  const onlineIncludingMe = useMemo(() => {
    const now = Date.now();
    return records
      .map((r) => {
        const serverMs = typeof (r as any)?.lastSeen === 'number' ? (r as any).lastSeen as number : null;
        const withinWindow = typeof serverMs === 'number' ? now - serverMs <= ONLINE_THRESHOLD_MS : false;
        return { ...r, online: withinWindow } as any;
      })
      .filter((r: any) => r.online);
  }, [records]);

  const others = useMemo(() => {
    const me = auth.currentUser?.uid;
    return onlineIncludingMe.filter((r: any) => r.uid !== me);
  }, [onlineIncludingMe]);

  return { others, online: onlineIncludingMe };
}


