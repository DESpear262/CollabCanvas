import { rtdb, db } from './firebase';
import { onValue, ref, set, serverTimestamp, onDisconnect, remove } from 'firebase/database';
import { collection, onSnapshot } from 'firebase/firestore';

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
  });
}

export async function heartbeat(uid: string): Promise<void> {
  await set(ref(rtdb, `presence/${uid}/lastSeen`), serverTimestamp());
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

export async function clearPresence(uid: string): Promise<void> {
  await set(ref(rtdb, `presence/${uid}/cursor`), null);
  await set(ref(rtdb, `presence/${uid}/lastSeen`), serverTimestamp());
}

export async function removePresence(uid: string): Promise<void> {
  await remove(ref(rtdb, `presence/${uid}`));
}

export function bindOnDisconnect(uid: string): void {
  onDisconnect(ref(rtdb, `presence/${uid}/cursor`)).set(null).catch(() => {});
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


