/*
  File: planner.loginform.test.ts
  Overview: Integration-style test for a simple "login form" multi-step plan
            using a mocked LLM response.
*/
import { describe, it, expect, vi } from 'vitest';
import { buildPlan, runPlan } from '../planner';
import * as openaiMod from '../openai';
import * as executor from '../executor';

vi.spyOn(executor, 'execute');

describe('planner integration - login form (mocked)', () => {
  it('builds and runs a login form sequence', async () => {
    // Mock LLM: create title text, username field (rect), password field (rect), submit button (rect)
    vi.spyOn(openaiMod, 'getOpenAI').mockReturnValue({
      chat: { completions: { create: async () => ({ choices: [{ message: { tool_calls: [
        { function: { name: 'createText', arguments: JSON.stringify({ text: 'Login', x: 40, y: 20, color: '#fff' }) } },
        { function: { name: 'createShape', arguments: JSON.stringify({ type: 'rectangle', x: 20, y: 60, width: 200, height: 30, color: '#1f2937' }) } },
        { function: { name: 'createShape', arguments: JSON.stringify({ type: 'rectangle', x: 20, y: 100, width: 200, height: 30, color: '#1f2937' }) } },
        { function: { name: 'createShape', arguments: JSON.stringify({ type: 'rectangle', x: 20, y: 140, width: 200, height: 36, color: '#2563eb' }) } },
      ] } }] }) } },
    } as any);

    (executor.execute as any).mockResolvedValue({ ok: true });
    const plan = await buildPlan('create a login form');
    const res = await runPlan(plan, {}, { maxSteps: 10, timeoutMs: 1000 });
    expect(res.ok).toBe(true);
    expect((executor.execute as any).mock.calls.length).toBe(4);
  });
});


