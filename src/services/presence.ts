import { rtdb } from './firebase';
import { onValue, ref, set, serverTimestamp, onDisconnect, remove } from 'firebase/database';

export type CursorPosition = { x: number; y: number } | null;

export type PresenceRecord = {
  uid: string;
  email?: string | null;
  displayName?: string | null;
  cursor: CursorPosition;
  lastSeen: unknown;
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


