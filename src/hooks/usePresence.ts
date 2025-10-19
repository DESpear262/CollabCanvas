/*
  File: usePresence.ts
  Overview: Subscribes to Firestore roster (authoritative known users) and RTDB live presence,
            and derives online/offline according to combined rules.
  Behavior:
    - Online iff user exists in Firestore roster AND is present in RTDB with online===true and offline!==true,
      and lastSeen within ONLINE_THRESHOLD_MS.
    - RTDB presence but missing `online` or with `offline` is treated as offline.
    - Firestore roster but no RTDB presence is offline.
    - Splits out `others` (everyone except the current user).
*/
import { useEffect, useMemo, useState } from 'react';
import { subscribeToPresence, subscribeToPresenceRoster, type PresenceRecord, type PresenceRosterUser } from '../services/presence';
import { auth } from '../services/firebase';
import { ONLINE_THRESHOLD_MS } from '../utils/constants';

/**
 * usePresence
 * Returns arrays of online users and others (excluding the current user).
 */
export function usePresence() {
  const [records, setRecords] = useState<PresenceRecord[]>([]);
  const [roster, setRoster] = useState<PresenceRosterUser[]>([]);

  useEffect(() => {
    const unsub = subscribeToPresence(setRecords);
    return () => unsub();
  }, []);

  // Firestore roster of known users
  useEffect(() => {
    const unsub = subscribeToPresenceRoster(setRoster);
    return () => unsub();
  }, []);

  const onlineIncludingMe = useMemo(() => {
    const now = Date.now();
    const rosterUids = new Set(roster.map((u) => u.uid));
    return records
      .map((r) => {
        const serverMs = typeof (r as any)?.lastSeen === 'number' ? (r as any).lastSeen as number : null;
        const withinWindow = typeof serverMs === 'number' ? now - serverMs <= ONLINE_THRESHOLD_MS : false;
        const hasFlagsOnline = (r as any)?.online === true && (r as any)?.offline !== true;
        const alsoInRoster = rosterUids.has(r.uid);
        const isOnline = withinWindow && hasFlagsOnline && alsoInRoster;
        return { ...r, online: isOnline } as any;
      })
      .filter((r: any) => r.online);
  }, [records, roster]);

  const others = useMemo(() => {
    const me = auth.currentUser?.uid;
    return onlineIncludingMe.filter((r: any) => r.uid !== me);
  }, [onlineIncludingMe]);

  const onlineUids = useMemo(() => new Set(onlineIncludingMe.map((r: any) => r.uid)), [onlineIncludingMe]);

  const offline = useMemo(() => {
    return roster
      .filter((u) => !onlineUids.has(u.uid))
      .map((u) => ({
        uid: u.uid,
        email: u.email ?? null,
        displayName: u.displayName ?? null,
      }));
  }, [roster, onlineUids]);

  return { others, online: onlineIncludingMe, offline } as any;
}


