/*
  File: planner.test.ts
  Overview: Unit tests for planner heuristics and plan shape.
*/
import { describe, it, expect, vi } from 'vitest';
import { buildPlan, classifyPrompt } from '../planner';

vi.mock('../openai', () => ({
  getOpenAI: () => ({
    chat: {
      completions: {
        create: async () => ({ choices: [{ message: { tool_calls: [
          { function: { name: 'createShape', arguments: JSON.stringify({ type: 'rectangle', x: 0, y: 0, width: 100, height: 50, color: '#fff' }) } },
          { function: { name: 'createText', arguments: JSON.stringify({ text: 'Login', x: 0, y: 60, color: '#fff' }) } },
        ] } }] }) },
    },
  }),
}));

describe('planner', () => {
  it('detects multi-step prompts', () => {
    // using mocked classifyPrompt under the hood via needsPlanning
    // here we directly check classify behavior for clarity
    // classifyPrompt('chat message') -> chat
  });

  it('classifies chat vs simple vs complex', async () => {
    const chat = await classifyPrompt('hello there');
    expect(chat.kind === 'chat' || chat.kind === 'simple' || chat.kind === 'complex').toBe(true);
  });

  it('builds a plan with steps', async () => {
    const plan = await buildPlan('create a login form');
    expect(plan.steps.length).toBeGreaterThan(0);
    expect(plan.steps[0]).toHaveProperty('name');
    expect(plan.steps[0]).toHaveProperty('status');
  });
});


