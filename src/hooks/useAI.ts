/*
  File: useAI.ts
  Overview: Hook to send user prompts to OpenAI using function-calling scaffolding.
*/
import { useCallback, useState } from 'react';
import { getOpenAI } from '../services/ai/openai';

type UseAIResult = {
  sendPrompt: (text: string) => Promise<string>;
  loading: boolean;
  error: string | null;
};

export function useAI(): UseAIResult {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const sendPrompt = useCallback(async (text: string) => {
    setLoading(true);
    setError(null);
    try {
      const openai = getOpenAI();
      const res = await openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: 'You are a helpful assistant for a collaborative canvas app.' },
          { role: 'user', content: text },
        ],
      } as any);
      const reply = res.choices?.[0]?.message?.content || '';
      return reply;
    } catch (e: any) {
      const msg = e?.message || 'AI request failed';
      setError(msg);
      return '';
    } finally {
      setLoading(false);
    }
  }, []);

  return { sendPrompt, loading, error };
}


