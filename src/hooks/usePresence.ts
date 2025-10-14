import { useEffect, useMemo, useState } from 'react';
import { subscribeToPresence, type PresenceRecord } from '../services/presence';
import { auth } from '../services/firebase';
import { ONLINE_THRESHOLD_MS } from '../utils/constants';

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


