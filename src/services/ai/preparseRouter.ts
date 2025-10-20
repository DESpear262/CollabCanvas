/*
  File: preparseRouter.ts
  Overview: Exposes deterministic pre-parsers as callable tools for the planner. This moves
            heuristic parsing behind tool calls, per user direction, while retaining functionality.
*/

import { loadCanvas } from '../canvas';

// Local copies of the parser helpers from planner.ts (kept minimal and self-contained)

function normalizeColorWords(text: string): string[] {
  const COLOR_ALIASES: Record<string, string> = {
    'light blue': 'blue', 'sky blue': 'blue', navy: 'blue', magenta: 'magenta', cyan: 'cyan',
    purple: 'purple', lime: 'lime', brown: 'brown', orange: 'orange', pink: 'pink', red: 'red',
    green: 'green', yellow: 'yellow', blue: 'blue', black: 'black', white: 'white',
  };
  const lc = text.toLowerCase();
  const words = Object.keys(COLOR_ALIASES).filter((c) => lc.includes(c));
  const out = words.map((w) => COLOR_ALIASES[w]);
  return Array.from(new Set(out));
}

function detectTypes(text: string): string[] {
  const lc = text.toLowerCase();
  const types: string[] = [];
  if (/rectangle|rect|square/.test(lc)) types.push('rectangle');
  if (/circle/.test(lc)) types.push('circle');
  if (/text|label/.test(lc)) types.push('text');
  return types;
}

type AnyShape = { id: string; kind: 'rectangle' | 'circle' | 'text'; x: number; y: number; width: number; height: number; cx?: number; cy?: number; radius?: number; fill?: string; text?: string };

function flattenState(state?: any): AnyShape[] {
  if (!state) return [];
  const out: AnyShape[] = [];
  for (const r of state.rects || []) out.push({ id: r.id, kind: 'rectangle', x: r.x, y: r.y, width: r.width, height: r.height, fill: r.fill });
  for (const c of state.circles || []) out.push({ id: c.id, kind: 'circle', x: (c.cx ?? 0) - (c.radius ?? 0), y: (c.cy ?? 0) - (c.radius ?? 0), width: (c.radius ?? 0) * 2, height: (c.radius ?? 0) * 2, cx: c.cx, cy: c.cy, radius: c.radius, fill: c.fill });
  for (const t of state.texts || []) out.push({ id: t.id, kind: 'text', x: t.x, y: t.y, width: t.width, height: t.height, fill: t.fill, text: t.text });
  return out;
}

function positionScore(s: AnyShape, lcPrompt: string): number {
  const centerX = s.x + s.width / 2;
  const centerY = s.y + s.height / 2;
  if (/top-left/.test(lcPrompt)) return centerY * 100000 + centerX;
  if (/top-right/.test(lcPrompt)) return centerY * 100000 + (-centerX);
  if (/bottom-left/.test(lcPrompt)) return (-centerY) * 100000 + centerX;
  if (/bottom-right/.test(lcPrompt)) return (-centerY) * 100000 + (-centerX);
  if (/top\b/.test(lcPrompt)) return centerY;
  if (/bottom\b/.test(lcPrompt)) return -centerY;
  if (/left\b/.test(lcPrompt)) return centerX;
  if (/right\b/.test(lcPrompt)) return -centerX;
  return 0;
}

function relationFromPrompt(text: string): 'right' | 'left' | 'above' | 'below' | 'near' | 'over' {
  const lc = text.toLowerCase();
  if (/on top of|on top/.test(lc)) return 'over';
  if (/to the left of|left of/.test(lc)) return 'left';
  if (/to the right of|right of|next to/.test(lc)) return 'right';
  if (/above/.test(lc)) return 'above';
  if (/below/.test(lc)) return 'below';
  if (/\bto\b/.test(lc)) return 'over';
  return 'near';
}

function computeMovePosition(subject: AnyShape, anchor: AnyShape, relation: 'right' | 'left' | 'above' | 'below' | 'near' | 'over'): { x: number; y: number } {
  const GAP = 10;
  const anchorCenterX = anchor.x + anchor.width / 2;
  const anchorCenterY = anchor.y + anchor.height / 2;
  let x = subject.x;
  let y = subject.y;
  switch (relation) {
    case 'over': x = anchorCenterX - subject.width / 2; y = anchorCenterY - subject.height / 2; break;
    case 'right': x = anchor.x + anchor.width + GAP; y = anchorCenterY - subject.height / 2; break;
    case 'left': x = anchor.x - subject.width - GAP; y = anchorCenterY - subject.height / 2; break;
    case 'above': x = anchorCenterX - subject.width / 2; y = anchor.y - subject.height - GAP; break;
    case 'below': x = anchorCenterX - subject.width / 2; y = anchor.y + anchor.height + GAP; break;
    case 'near': default: x = anchor.x + anchor.width + GAP; y = anchor.y; break;
  }
  if (subject.kind === 'circle') {
    return { x: x + subject.width / 2, y: y + subject.height / 2 };
  }
  return { x, y };
}

export async function routePreparseGrid(args: any) {
  const { prompt } = args as any;
  const lc = String(prompt || '').toLowerCase();

  const detectShape = (): 'rectangle' | 'circle' => {
    if (/circle/.test(lc)) return 'circle';
    if (/square|rect|rectangle/.test(lc)) return 'rectangle';
    return 'rectangle';
  };

  const x = 64, y = 64, cellWidth = 32, cellHeight = 32, gapX = 8, gapY = 8;
  const shape = detectShape();

  const mGrid = lc.match(/(\d+)\s*(x|by|\*)\s*(\d+)\s*grid/);
  const mCount = lc.match(/(?:make|create|add)\s+(\d+)\s+(?:square|squares|rectangle|rectangles|circle|circles)/);
  if (mGrid) {
    const rows = parseInt(mGrid[1], 10);
    const cols = parseInt(mGrid[3], 10);
    const count = mCount ? parseInt(mCount[1], 10) : undefined;
    return { tool: 'createGrid', args: { shape, rows, cols, count, x, y, cellWidth, cellHeight, gapX, gapY } };
  }

  const mRowCountA = lc.match(/(\d+)\s+(?:square|squares|rectangle|rectangles|circle|circles)\s+in\s+a\s+row/);
  const mColCountA = lc.match(/(\d+)\s+(?:square|squares|rectangle|rectangles|circle|circles)\s+in\s+a\s+column/);
  const mRowCountB = lc.match(/row\s+of\s+(\d+)\s+(?:square|squares|rectangle|rectangles|circle|circles)/);
  const mColCountB = lc.match(/column\s+of\s+(\d+)\s+(?:square|squares|rectangle|rectangles|circle|circles)/);
  const rowCount = mRowCountA ? parseInt(mRowCountA[1], 10) : (mRowCountB ? parseInt(mRowCountB[1], 10) : undefined);
  const colCount = mColCountA ? parseInt(mColCountA[1], 10) : (mColCountB ? parseInt(mColCountB[1], 10) : undefined);
  if (rowCount && rowCount >= 1) return { tool: 'createGrid', args: { shape, rows: 1, cols: rowCount, count: rowCount, x, y, cellWidth, cellHeight, gapX, gapY } };
  if (colCount && colCount >= 1) return { tool: 'createGrid', args: { shape, rows: colCount, cols: 1, count: colCount, x, y, cellWidth, cellHeight, gapX, gapY } };

  const mOnlyCount = lc.match(/(?:make|create|add)\s+(\d+)\s+(?:square|squares|rectangle|rectangles|circle|circles)/);
  if (mOnlyCount) {
    const n = parseInt(mOnlyCount[1], 10);
    if (n >= 1) {
      const cols = Math.max(1, Math.ceil(Math.sqrt(n)));
      const rows = Math.max(1, Math.ceil(n / cols));
      return { tool: 'createGrid', args: { shape, rows, cols, count: n, x, y, cellWidth, cellHeight, gapX, gapY } };
    }
  }
  return { tool: 'noop', args: {} };
}

export async function routePreparseRelativeMove(args: any) {
  const { prompt } = args as any;
  const lc = String(prompt || '').toLowerCase().trim();
  const m = lc.match(/^(move|place|put)\s+(.+?)\s+(next to|to the left of|left of|to the right of|right of|above|below|to)\s+(.+)$/);
  if (!m) return { tool: 'noop', args: {} };
  const subject = m[2];
  const rel = m[3];
  const anchor = m[4];
  const canonical = `move ${subject} ${rel} ${anchor}`;
  return routeBuildRelativeMove({ prompt: canonical });
}

export async function routeBuildRelativeMove(args: any): Promise<{ tool: 'moveShape', args: any } | { tool: 'noop', args: {} }> {
  const { prompt } = args as any;
  const state = await loadCanvas();
  const shapes = flattenState(state);
  if (shapes.length === 0) return { tool: 'noop', args: {} };
  const colors = normalizeColorWords(prompt);
  const types = detectTypes(prompt);
  const lc = String(prompt || '').toLowerCase();

  // subject selection
  let subject: AnyShape | undefined;
  const subjectType = types[0];
  const subjectColor = colors[0];
  if (subjectType === 'text' && /longest/.test(lc)) {
    const texts = shapes.filter((s) => s.kind === 'text');
    subject = texts.sort((a, b) => (b.text?.length || 0) - (a.text?.length || 0))[0];
  }
  if (!subject) {
    const candidates = shapes.filter((s) => (!subjectType || s.kind === subjectType) && (!subjectColor || (s.fill || '').toLowerCase().includes(subjectColor)));
    if (candidates.length > 1) {
      const sorted = candidates.sort((a, b) => positionScore(a, lc) - positionScore(b, lc));
      subject = sorted[0];
    } else {
      subject = candidates[0];
    }
  }

  // anchor selection
  const anchorType = types[1] || types[0];
  const anchorColor = colors[1] || colors[0];
  let anchor: AnyShape | undefined;
  if (anchorType === 'rectangle' && /biggest|largest/.test(lc)) {
    const rects = shapes.filter((s) => s.kind === 'rectangle' && (!anchorColor || (s.fill || '').toLowerCase().includes(anchorColor)));
    anchor = rects.sort((a, b) => b.width * b.height - a.width * a.height)[0];
  }
  if (!anchor) {
    const candidates = shapes.filter((s) => (!anchorType || s.kind === anchorType) && (!anchorColor || (s.fill || '').toLowerCase().includes(anchorColor)));
    if (candidates.length > 1) {
      const sorted = candidates.sort((a, b) => positionScore(a, lc) - positionScore(b, lc));
      anchor = sorted[0];
    } else {
      anchor = candidates[0];
    }
  }
  if (!subject || !anchor || subject.id === anchor.id) return { tool: 'noop', args: {} };
  const relation = relationFromPrompt(prompt as string);
  const pos = computeMovePosition(subject, anchor, relation);
  return { tool: 'moveShape', args: { id: subject.id, x: pos.x, y: pos.y } };
}


