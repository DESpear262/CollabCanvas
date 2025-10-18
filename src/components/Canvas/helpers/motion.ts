/*
  File: motion.ts
  Overview: Motion-related utilities used by Canvas for throttling and change thresholds.
*/

import { MOTION_UPDATE_THROTTLE_MS, SYNC_WORLD_THRESHOLD, SYNC_ROTATION_THRESHOLD_DEG } from '../../../utils/constants';
import type { MotionEntry } from '../../../services/motion';

/** Throttle map shared per-shape id for streaming upserts. */
export function createThrottleState() {
  const dragThrottleRef: Record<string, number> = {};
  const scheduleUpsert: Record<string, number> = {};
  const THROTTLE_MS = 80;
  return { dragThrottleRef, scheduleUpsert, THROTTLE_MS };
}

/** Generic throttle for upsert callbacks keyed by id. */
export function throttleUpsertById(id: string, state: ReturnType<typeof createThrottleState>, fn: () => void) {
  const now = Date.now();
  const last = state.dragThrottleRef[id] || 0;
  if (now - last >= state.THROTTLE_MS) {
    state.dragThrottleRef[id] = now;
    fn();
  } else {
    if (state.scheduleUpsert[id]) return;
    const delay = state.THROTTLE_MS - (now - last);
    state.scheduleUpsert[id] = window.setTimeout(() => {
      state.dragThrottleRef[id] = Date.now();
      state.scheduleUpsert[id] = 0 as unknown as number;
      fn();
    }, delay);
  }
}

/** Decide whether to stream motion update based on last and threshold. */
// Removed: shouldStreamMotion (unused)

/** Publish motion with client throttle. */
export function maybePublishMotionThrottled(id: string, entry: MotionEntry, motionThrottleRef: Record<string, number>, publish: (e: MotionEntry) => Promise<void>) {
  const now = performance.now();
  const last = motionThrottleRef[id] || 0;
  if (now - last < MOTION_UPDATE_THROTTLE_MS) return;
  motionThrottleRef[id] = now;
  void publish(entry);
}

/** Threshold comparison for rectangles only. */
export function exceedsThreshold<T extends Record<string, number>>(
  a: T,
  b: T,
  fields: (keyof T)[],
  rotationThreshold?: number
): boolean {
  for (const field of fields) {
    if (Math.abs((a[field] as number) - (b[field] as number)) >= SYNC_WORLD_THRESHOLD) return true;
  }
  if (rotationThreshold !== undefined && 'rotation' in a && 'rotation' in b) {
    const ra = ((a as any).rotation ?? 0) % 360;
    const rb = ((b as any).rotation ?? 0) % 360;
    if (Math.abs(ra - rb) >= rotationThreshold) return true;
  }
  return false;
}

export function exceedsRectThreshold(a: { x: number; y: number; width: number; height: number }, b: { x: number; y: number; width: number; height: number }) {
  return exceedsThreshold(a, b, ['x', 'y', 'width', 'height']);
}

/** Threshold comparison for rect/text with rotation. */
export function exceedsRectOrTextWithRotationThreshold(
  a: { x: number; y: number; width: number; height: number; rotation?: number },
  b: { x: number; y: number; width: number; height: number; rotation?: number }
) {
  return exceedsThreshold(a, b, ['x', 'y', 'width', 'height'], SYNC_ROTATION_THRESHOLD_DEG);
}

/** Threshold comparison for circles. */
export function exceedsCircleThreshold(a: { cx: number; cy: number; radius: number }, b: { cx: number; cy: number; radius: number }) {
  return exceedsThreshold(a, b, ['cx', 'cy', 'radius']);
}


