/*
  File: presence.ts
  Overview: Presence layer combining Realtime Database for live cursors and Firestore for roster.
  Data model:
    - RTDB path `presence/{uid}`: {
        uid, email, displayName, cursor, lastSeen,
        online: boolean,    // true when client heartbeat is active
        offline: boolean    // optional guard; if true, treat as offline even if present
      }
    - Firestore collection `presence`: roster of known users (uid/email/displayName)
  Semantics:
    - Online users are those present in BOTH Firestore roster AND RTDB, and with online === true and offline !== true.
    - Users present in Firestore roster but not in RTDB are offline.
    - Users present in RTDB but lacking `online` flag or with `offline` flag are offline.
  Notes:
    - `bindOnDisconnect` removes presence quickly when the client disconnects.
*/
import { rtdb, db } from './firebase';
import { onValue, ref, set, serverTimestamp, onDisconnect, remove, update } from 'firebase/database';
import { collection, onSnapshot, doc, setDoc } from 'firebase/firestore';

export type CursorPosition = { x: number; y: number } | null;

export type PresenceRecord = {
  uid: string;
  email?: string | null;
  displayName?: string | null;
  cursor: CursorPosition;
  lastSeen: unknown;
};

export type PresenceRosterUser = {
  uid: string;
  email?: string | null;
  displayName?: string | null;
};

export async function updateCursorPresence(params: {
  uid: string;
  email?: string | null;
  displayName?: string | null;
  cursor: CursorPosition;
}): Promise<void> {
  const { uid, email, displayName, cursor } = params;
  await set(ref(rtdb, `presence/${uid}`), {
    uid,
    email: email ?? null,
    displayName: displayName ?? null,
    cursor,
    lastSeen: serverTimestamp(),
    online: true,
    offline: false,
  });
}

/** Heartbeat tick to update `lastSeen` without changing other fields. */
export async function heartbeat(uid: string): Promise<void> {
  await update(ref(rtdb, `presence/${uid}`), {
    lastSeen: serverTimestamp(),
    online: true,
    offline: false,
  });
}

export function subscribeToPresence(
  handler: (records: PresenceRecord[]) => void
): () => void {
  const presenceRef = ref(rtdb, 'presence');
  const unsubscribe = onValue(
    presenceRef,
    (snap) => {
      const data = snap.val() || {};
      const recs: PresenceRecord[] = Object.values(data).map((v: any) => ({
        uid: v.uid,
        email: v.email ?? null,
        displayName: v.displayName ?? null,
        cursor: (v.cursor ?? null) as CursorPosition,
        lastSeen: v.lastSeen ?? null,
      }));
      handler(recs);
    },
    (err) => {
      console.error('[presence] subscribe error', err);
    }
  );
  return () => unsubscribe();
}

/** Clear only the cursor for a user (used on mouseleave/unload). */
export async function clearPresence(uid: string): Promise<void> {
  await update(ref(rtdb, `presence/${uid}`), {
    cursor: null,
    lastSeen: serverTimestamp(),
    online: true,
    offline: false,
  });
}

/** Remove the full presence record for a user. */
export async function removePresence(uid: string): Promise<void> {
  await remove(ref(rtdb, `presence/${uid}`));
}

/** Register an onDisconnect hook to remove presence promptly when the connection closes. */
export function bindOnDisconnect(uid: string): void {
  // Remove the entire presence record on disconnect for immediate disappearance
  onDisconnect(ref(rtdb, `presence/${uid}`)).remove().catch(() => {});
}

// Firestore roster (authoritative list of known users to display in PresenceList)
export function subscribeToPresenceRoster(
  handler: (users: PresenceRosterUser[]) => void
): () => void {
  const col = collection(db, 'presence');
  const unsub = onSnapshot(
    col,
    (snap) => {
      const users: PresenceRosterUser[] = snap.docs.map((d) => {
        const v = d.data() as any;
        return {
          uid: v.uid ?? d.id,
          email: v.email ?? null,
          displayName: v.displayName ?? null,
        };
      });
      handler(users);
    },
    (err) => console.error('[presenceRoster] subscribe error', err)
  );
  return () => unsub();
}

/** Upsert a user into the Firestore presence roster. */
export async function upsertPresenceRosterUser(params: {
  uid: string;
  email?: string | null;
  displayName?: string | null;
}): Promise<void> {
  const { uid, email, displayName } = params;
  await setDoc(doc(db, 'presence', uid), {
    uid,
    email: email ?? null,
    displayName: displayName ?? null,
  }, { merge: true });
}


