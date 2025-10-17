/*
  File: src/services/history.ts
  Overview: Global history bridge used by both React components and non-React modules (e.g., AI executor).
  Purpose:
    - Decouple history recording from React so services (like AI executor) can record diffs.
    - HistoryProvider installs a sink implementation at runtime.
*/

export type Kind = 'rect' | 'circle' | 'text';

export type RectSnapshot = { id: string; x: number; y: number; width: number; height: number; fill: string; rotation?: number; z: number };
export type CircleSnapshot = { id: string; cx: number; cy: number; radius: number; fill: string; z: number };
export type TextSnapshot = { id: string; x: number; y: number; width: number; height: number; text: string; fill: string; rotation?: number; z: number };

export type AnySnapshot =
  | ({ kind: 'rect' } & RectSnapshot)
  | ({ kind: 'circle' } & CircleSnapshot)
  | ({ kind: 'text' } & TextSnapshot);

export type UpdateChange = {
  kind: Kind;
  id: string;
  before: AnySnapshot;
  after: AnySnapshot;
};

export type HistoryGroupMeta = {
  source: 'user' | 'ai';
  label?: string;
  promptText?: string;
};

export type HistorySink = {
  beginGroup(meta: HistoryGroupMeta): void;
  endGroup(): void;
  recordCreate(items: AnySnapshot[]): void;
  recordDelete(items: AnySnapshot[]): void;
  recordUpdate(changes: UpdateChange[]): void;
};

let sink: HistorySink | null = null;

export function setHistorySink(next: HistorySink | null) {
  sink = next;
}

export function beginGroup(meta: HistoryGroupMeta) {
  sink?.beginGroup(meta);
}

export function endGroup() {
  sink?.endGroup();
}

export function recordCreate(items: AnySnapshot[]) {
  if (!items || items.length === 0) return;
  sink?.recordCreate(items);
}

export function recordDelete(items: AnySnapshot[]) {
  if (!items || items.length === 0) return;
  sink?.recordDelete(items);
}

export function recordUpdate(changes: UpdateChange[]) {
  if (!changes || changes.length === 0) return;
  sink?.recordUpdate(changes);
}


