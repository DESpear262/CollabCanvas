/*
  File: src/services/ai/openai.ts
  Overview: Thin OpenAI client wrapper for function-calling based canvas tools.
  Usage:
    - Import `getOpenAI()` to access a singleton client.
    - Use `healthcheck()` during development to verify API connectivity.
  Env:
    - Expects `VITE_OPENAI_API_KEY` to be present at build/runtime (Vite exposes import.meta.env).
*/

import OpenAI from 'openai';

let client: OpenAI | null = null;

/** Return a singleton OpenAI client configured from Vite env. */
export function getOpenAI(): OpenAI {
  if (client) return client;
  const apiKey = import.meta.env.VITE_OPENAI_API_KEY as string | undefined;
  if (!apiKey) {
    throw new Error('Missing VITE_OPENAI_API_KEY');
  }
  client = new OpenAI({ apiKey, dangerouslyAllowBrowser: true });
  return client;
}

/**
 * Quick connectivity smoke test. Returns the model name or throws.
 * Note: Use a cheap endpoint. Here we call models list which is inexpensive.
 */
export async function healthcheck(): Promise<string> {
  const c = getOpenAI();
  // The SDK supports client.models.list(); in browsers, availability may vary.
  // Fallback to a trivial chat call if needed later.
  try {
    const models = await c.models.list();
    if (import.meta.env.DEV) console.log('[openai] models.list result', models);
    const first = models.data?.[0]?.id ?? 'ok';
    return String(first);
  } catch (err) {
    if (import.meta.env.DEV) console.log('[openai] models.list error', err);
    // Surface concise error for UI/console
    throw new Error('OpenAI connectivity failed');
  }
}
