/*
  File: classificationLog.ts
  Overview: Lightweight Firestore logger for prompt classification events used to train a specialized classifier later.
  Usage: Call logClassification({ prompt, label, modelVersion?, meta? }) whenever a prompt is classified.
  Notes:
    - Stores only a small snippet and a SHA-256 hash of the full prompt to minimize PII exposure and storage costs.
    - This module intentionally avoids reads; collection is intended for offline analytics/export.
*/
import { db } from '../firebase';
import { addDoc, collection, serverTimestamp } from 'firebase/firestore';

export type ClassificationLabel = 'chat' | 'simple' | 'complex';

export async function logClassification(input: {
  prompt: string;
  label: ClassificationLabel;
  modelVersion?: string;
  meta?: Record<string, unknown>;
}): Promise<void> {
  const { prompt, label, modelVersion, meta } = input;
  const promptSnippet = prompt.slice(0, 180);
  const promptHash = await sha256(prompt);

  await addDoc(collection(db, 'classifications'), {
    promptHash,
    promptSnippet,
    label,
    modelVersion: modelVersion ?? null,
    createdAt: serverTimestamp(),
    meta: meta ?? null,
  });
}

async function sha256(text: string): Promise<string> {
  const enc = new TextEncoder().encode(text);
  const buf = await crypto.subtle.digest('SHA-256', enc);
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}


