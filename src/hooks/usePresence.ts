import { useEffect, useMemo, useState } from 'react';
import { subscribeToPresence, subscribeToPresenceRoster, type PresenceRecord } from '../services/presence';
import { ONLINE_THRESHOLD_MS } from '../utils/constants';

export function usePresence() {
  const [records, setRecords] = useState<PresenceRecord[]>([]);
  const [roster, setRoster] = useState<Array<{ uid: string; email?: string | null; displayName?: string | null }>>([]);

  useEffect(() => {
    const unsub = subscribeToPresence(setRecords);
    const unsubRoster = subscribeToPresenceRoster(setRoster);
    return () => {
      unsub();
      unsubRoster();
    };
  }, []);

  const others = useMemo(() => {
    // Include current user
    const now = Date.now();
    // RTDB records are keyed by uid and lastSeen is a number
    const presenceByUid = new Map(records.map((r) => [r.uid, r]));
    return roster
      .map((u) => {
        const rec = presenceByUid.get(u.uid) as PresenceRecord | undefined;
        const hasRTDB = !!rec;
        const serverMs = typeof (rec as any)?.lastSeen === 'number' ? (rec as any).lastSeen as number : null;
        const withinWindow = typeof serverMs === 'number' ? now - serverMs <= ONLINE_THRESHOLD_MS : false;
        const online = hasRTDB && withinWindow; // Roster + recent RTDB presence → online
        return {
          uid: u.uid,
          email: u.email ?? null,
          displayName: u.displayName ?? null,
          cursor: rec?.cursor ?? null,
          lastSeen: rec?.lastSeen ?? null,
          online,
        } as any;
      })
      .filter((u) => u.email); // Only show roster users (roster source of truth)
  }, [records, roster]);

  return { others };
}


