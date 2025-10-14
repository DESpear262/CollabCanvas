import { useEffect, useMemo, useState } from 'react';
import { subscribeToPresence, type PresenceRecord } from '../services/presence';
import { auth } from '../services/firebase';
import { ONLINE_THRESHOLD_MS } from '../utils/constants';

export function usePresence() {
  const [records, setRecords] = useState<PresenceRecord[]>([]);

  useEffect(() => {
    const unsub = subscribeToPresence(setRecords);
    return unsub;
  }, []);

  const others = useMemo(() => {
    const uid = auth.currentUser?.uid;
    const now = Date.now();
    return records
      .filter((r) => r.uid !== uid)
      .filter((r) => {
        const serverMs = (r as any).lastSeen?.toMillis?.() ?? null;
        if (typeof serverMs !== 'number') return true; // if missing, don't hide
        return now - serverMs <= ONLINE_THRESHOLD_MS;
      });
  }, [records]);

  return { others };
}


