import { useEffect, useMemo, useState } from 'react';
import { subscribeToPresence, type PresenceRecord } from '../services/presence';
import { auth } from '../services/firebase';

export function usePresence() {
  const [records, setRecords] = useState<PresenceRecord[]>([]);

  useEffect(() => {
    const unsub = subscribeToPresence(setRecords);
    return unsub;
  }, []);

  const others = useMemo(() => {
    const uid = auth.currentUser?.uid;
    return records.filter((r) => r.uid !== uid);
  }, [records]);

  return { others };
}


