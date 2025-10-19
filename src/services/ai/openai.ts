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

/** Minimal chat helper with function-calling tool support. */
export type ChatMessage = { role: 'system' | 'user' | 'assistant'; content: string };

export type ToolDef = { name: string; description: string; parameters: Record<string, unknown> };

export async function chatWithTools(
  messages: ChatMessage[],
  tools: ToolDef[],
  options: { model?: string; temperature?: number } = {}
): Promise<any> {
  const c = getOpenAI();
  const model = options.model ?? 'gpt-4o-mini';
  const temperature = options.temperature ?? 0.2;
  const toolPayload = tools.map((t) => ({ type: 'function', function: { name: t.name, description: t.description, parameters: t.parameters } }));
  const res = await c.chat.completions.create({
    model,
    temperature,
    max_tokens: 256,
    messages: messages as any,
    tools: toolPayload as any,
  } as any);
  if (import.meta.env.DEV) console.log('[openai] chatWithTools raw', res);
  return res;
}