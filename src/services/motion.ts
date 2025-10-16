/*
  File: motion.ts
  Overview: Ephemeral motion channel over RTDB for live drag/resize streaming.
  Data model:
    - RTDB path `motion/{id}`: transient overrides while an object is in motion
      {
        id, kind: 'rect'|'circle'|'text',
        clientId, updatedAt: number,
        // rect/text
        x?, y?, width?, height?,
        // circle
        cx?, cy?, radius?
      }
*/
import { rtdb } from './firebase';
import { onValue, ref, set, remove } from 'firebase/database';

export type MotionEntry = {
  id: string;
  kind: 'rect' | 'circle' | 'text';
  clientId: string;
  updatedAt: number;
  x?: number; y?: number; width?: number; height?: number; // rect/text
  cx?: number; cy?: number; radius?: number;               // circle
  rotation?: number;                                        // rect/text rotation degrees
};

export async function publishMotion(entry: MotionEntry): Promise<void> {
  await set(ref(rtdb, `motion/${entry.id}`), entry);
}

export async function clearMotion(id: string): Promise<void> {
  await remove(ref(rtdb, `motion/${id}`));
}

export function subscribeToMotion(
  handler: (map: Record<string, MotionEntry>) => void
): () => void {
  const motionRef = ref(rtdb, 'motion');
  const unsub = onValue(
    motionRef,
    (snap) => {
      const data = (snap.val() || {}) as Record<string, MotionEntry>;
      handler(data);
    },
    (err) => {
      console.error('[motion] subscribe error', err);
    }
  );
  return () => unsub();
}


