/*
  File: executor.test.ts
  Overview: Thin unit tests around parameter validation and happy-path wiring.
  Note: These tests are light and focus on interface guarantees (no Firestore).
*/
import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as canvas from '../../canvas';
import { execute } from '../executor';

vi.mock('../../canvas', () => ({
  upsertRect: vi.fn(async () => {}),
  upsertCircle: vi.fn(async () => {}),
  upsertText: vi.fn(async () => {}),
  deleteRect: vi.fn(async () => {}),
  deleteCircle: vi.fn(async () => {}),
  deleteText: vi.fn(async () => {}),
  loadCanvas: vi.fn(async () => ({ rects: [], circles: [], texts: [] })),
}));

describe('executor', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('validates parameters', async () => {
    const res = await execute({ name: 'createShape', arguments: { type: 'rectangle' } as any });
    expect(res.ok).toBe(false);
  });

  it('creates a rectangle and returns id', async () => {
    const res = await execute({ name: 'createShape', arguments: { type: 'rectangle', x: 10, y: 20, width: 100, height: 50, color: '#fff' } });
    expect(res.ok).toBe(true);
    expect((canvas.upsertRect as any).mock.calls.length).toBe(1);
    expect((res as any).data.id).toBeTruthy();
  });

  it('getCanvasState returns state', async () => {
    const res = await execute({ name: 'getCanvasState', arguments: {} });
    expect(res.ok).toBe(true);
    expect(res).toHaveProperty('data');
  });
});


