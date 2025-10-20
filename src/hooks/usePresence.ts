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
      .filter((r) => {
        const serverMs = typeof (r as any)?.lastSeen === 'number' ? ((r as any).lastSeen as number) : null;
        const withinWindow = typeof serverMs === 'number' ? now - serverMs <= ONLINE_THRESHOLD_MS : false;
        const present = (r as any)?.offline !== true && (r as any) != null; // RTDB presence without offline flag
        const requireOnlineFlag = (r as any)?.online === true; // guardrail: explicit online flag
        const alsoInRoster = rosterUids.has(r.uid);
        return alsoInRoster && present && requireOnlineFlag && withinWindow;
      })
      .map((r) => ({ ...r, online: true } as any));
  }, [records, roster]);

  const others = useMemo(() => {
    const me = auth.currentUser?.uid;
    return onlineIncludingMe.filter((r: any) => r.uid !== me);
  }, [onlineIncludingMe]);

  const onlineUids = useMemo(() => new Set(onlineIncludingMe.map((r: any) => r.uid)), [onlineIncludingMe]);

  const rtdbByUid = useMemo(() => {
    const m = new Map<string, PresenceRecord>();
    for (const r of records) m.set(r.uid, r);
    return m;
  }, [records]);

  const inactive = useMemo(() => {
    const now = Date.now();
    const rosterUids = new Set(roster.map((u) => u.uid));
    return records
      .filter((r) => {
        if (!rosterUids.has(r.uid)) return false;
        if (onlineUids.has(r.uid)) return false;
        const serverMs = typeof (r as any)?.lastSeen === 'number' ? ((r as any).lastSeen as number) : null;
        const hasPresence = (r as any)?.offline !== true; // present in RTDB and not forced offline
        const isStale = typeof serverMs === 'number' ? now - serverMs > ONLINE_THRESHOLD_MS : false;
        return hasPresence && isStale;
      })
      .map((r) => ({
        uid: r.uid,
        email: (r as any)?.email ?? null,
        displayName: (r as any)?.displayName ?? null,
        lastSeen: (r as any)?.lastSeen ?? null,
      }));
  }, [records, roster, onlineUids]);

  const inactiveUids = useMemo(() => new Set(inactive.map((u: any) => u.uid)), [inactive]);

  const offline = useMemo(() => {
    // Offline: not in RTDB OR in RTDB with offline flag (or clearly invalid lastSeen)
    return roster
      .filter((u) => {
        if (onlineUids.has(u.uid) || inactiveUids.has(u.uid)) return false;
        const rec = rtdbByUid.get(u.uid) as any;
        if (!rec) return true; // not in RTDB
        if (rec?.offline === true) return true;
        if (typeof rec?.lastSeen !== 'number') return true;
        return false;
      })
      .map((u) => ({
        uid: u.uid,
        email: u.email ?? null,
        displayName: u.displayName ?? null,
      }));
  }, [roster, rtdbByUid, onlineUids, inactiveUids]);

  return { others, online: onlineIncludingMe, inactive, offline } as any;
}


