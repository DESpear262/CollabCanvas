/*
  File: planner.run.test.ts
  Overview: Unit tests for runPlan guardrails and sequencing.
*/
import { describe, it, expect, vi } from 'vitest';
import { runPlan, type Plan } from '../planner';
import * as executor from '../executor';

vi.spyOn(executor, 'execute');

describe('runPlan', () => {
  it('runs steps sequentially and stops on failure', async () => {
    (executor.execute as any)
      .mockResolvedValueOnce({ ok: true })
      .mockResolvedValueOnce({ ok: false, error: 'boom' });
    const plan: Plan = { steps: [
      { id: '1', status: 'pending', name: 'getCanvasState' as any, arguments: {} },
      { id: '2', status: 'pending', name: 'createShape' as any, arguments: { type: 'rectangle', x: 0, y: 0, width: 10, height: 10, color: '#fff' } },
    ] };
    const res = await runPlan(plan, {}, { timeoutMs: 1000, maxSteps: 10 });
    expect(res.ok).toBe(false);
    expect((executor.execute as any).mock.calls.length).toBe(2);
  });
});


