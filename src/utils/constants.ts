/*
  File: constants.ts
  Overview: Centralized constants for timings, defaults, and feature flags.
*/
export const CURSOR_UPDATE_THROTTLE_MS = 16;
export const PRESENCE_COLLECTION = 'presence';
export const ONLINE_THRESHOLD_MS = 300_000; // 5 minutes
export const DEFAULT_RECT_WIDTH = 120;
export const DEFAULT_RECT_HEIGHT = 80;
export const DEFAULT_RECT_FILL = '#3b82f6';
export const DEV_INSTRUMENTATION = false;

// Minimum dimensions for text boxes to ensure visibility and manipulability
export const MIN_TEXT_WIDTH = 40; // small but usable width
export const MIN_TEXT_HEIGHT = 26; // approx single-line height incl. padding

// Threshold (in world units) for promoting in-progress transforms to sync writes
export const SYNC_WORLD_THRESHOLD = 5;

// Ephemeral motion streaming (RTDB) tuning
export const MOTION_UPDATE_THROTTLE_MS = 16; // ~60fps
export const MOTION_WORLD_THRESHOLD = 2;     // tiny world-unit gate to reduce spam

// Rotation thresholds (in degrees)
export const SYNC_ROTATION_THRESHOLD_DEG = 1;
export const MOTION_ROTATION_THRESHOLD_DEG = 1;

// Debug overlay cadence removed after PR#18 verification


