/*
  File: planner.integration.test.ts
  Overview: Integration-like tests that mock LLM to produce multi-step plans
           and verify runPlan executes all steps successfully.
*/
import { describe, it, expect, vi } from 'vitest';
import { buildPlan, runPlan } from '../planner';
import * as openaiMod from '../openai';
import * as executor from '../executor';

vi.spyOn(executor, 'execute');

describe('planner integration (mocked LLM)', () => {
  it('creates 3 circles in a row', async () => {
    vi.spyOn(openaiMod, 'getOpenAI').mockReturnValue({
      chat: { completions: { create: async () => ({ choices: [{ message: { tool_calls: [
        { function: { name: 'createShape', arguments: JSON.stringify({ type: 'circle', x: 0, y: 0, width: 40, height: 40, color: '#fff' }) } },
        { function: { name: 'createShape', arguments: JSON.stringify({ type: 'circle', x: 60, y: 0, width: 40, height: 40, color: '#fff' }) } },
        { function: { name: 'createShape', arguments: JSON.stringify({ type: 'circle', x: 120, y: 0, width: 40, height: 40, color: '#fff' }) } },
      ] } }] }) } },
    } as any);

    (executor.execute as any).mockResolvedValue({ ok: true });
    const plan = await buildPlan('create 3 circles in a row');
    const res = await runPlan(plan, {}, { maxSteps: 10, timeoutMs: 1000 });
    expect(res.ok).toBe(true);
    expect((executor.execute as any).mock.calls.length).toBe(3);
  });
});


