/*
  File: firestoreQueue.ts
  Overview: Global Firestore write queue to serialize all write operations app-wide.
  Usage:
    - Wrap any Firestore write in `enqueueWrite(() => updateDoc(...))`.
    - Ensures only one write runs at a time, preserving order across the app.
  Notes:
    - Queue is best-effort for ordering; individual writes should still be idempotent.
    - Errors from a write are propagated to the enqueuer; subsequent writes still proceed.
*/
type WriteTask<T> = () => Promise<T>;

let lastPromise: Promise<unknown> = Promise.resolve();

export function enqueueWrite<T>(task: WriteTask<T>): Promise<T> {
  // Chain onto the tail to ensure strict serialization
  const next = lastPromise.then(() => task());
  // Ensure errors don't break the chain; capture but keep tail moving
  lastPromise = next.catch(() => {});
  return next;
}

/**
 * Allow awaiting all queued writes (useful in tests). No-ops if none pending.
 */
export async function drainWrites(): Promise<void> {
  await lastPromise.catch(() => {});
}


