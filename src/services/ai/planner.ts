/*
  File: src/services/ai/planner.ts
  Overview: Multi-step planning utilities for complex AI commands (stubs).
  Examples:
    - "create a login form" -> plan becomes a sequence of tool calls
*/

import type { ToolCall } from './executor';

export type Plan = {
  steps: ToolCall[];
};

/** Detect if a prompt requires multi-step execution (stub heuristic). */
export function needsPlanning(prompt: string): boolean {
  return /login form|grid|row|column|toolbar/i.test(prompt);
}

/** Build a simple plan from a prompt (stub). */
export function buildPlan(prompt: string): Plan {
  void prompt; // avoid TS unused param warning in stub
  return { steps: [] };
}
