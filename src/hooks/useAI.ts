/*
  File: useAI.ts
  Overview: Orchestrates AI interactions.
  Responsibilities:
    1) Classify prompt (simple | complex | chat)
    2) Chat → return content; otherwise build a plan and run it with progress callbacks
    3) Basic retry around LLM classification and planning (non-destructive phases)
  Notes:
    - We intentionally DO NOT retry execution (runPlan) to avoid duplicate side effects.
*/
import { useCallback, useState } from 'react';
// openai client imported in planner/openai; no direct usage here
import { routeAndPlanWithContext, runPlan, type ProgressCallbacks } from '../services/ai/planner';
import { beginGroup, endGroup } from '../services/history';

type UseAIResult = {
  sendPrompt: (text: string, progress?: ProgressCallbacks) => Promise<string>;
  loading: boolean;
  error: string | null;
};

export function useAI(): UseAIResult {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Clarification flow removed per new rules

  async function retry<T>(fn: () => Promise<T>, retries = 2, delayMs = 300): Promise<T> {
    let attempt = 0;
    // eslint-disable-next-line no-constant-condition
    while (true) {
      try {
        return await fn();
      } catch (e) {
        if (attempt >= retries) throw e;
        const backoff = delayMs * Math.pow(2, attempt);
        await new Promise((r) => setTimeout(r, backoff));
        attempt += 1;
      }
    }
  }

  const sendPrompt = useCallback(async (text: string, progress?: ProgressCallbacks) => {
    setLoading(true);
    setError(null);
    try {
      const baseText = text;
      const routed = await retry(() => routeAndPlanWithContext(baseText));

      if (routed.kind === 'chat') {
        return routed.message || '';
      }
      beginGroup({ source: 'ai', label: 'AI prompt', promptText: baseText });
      const result = await runPlan(
        routed.plan,
        progress ?? {},
        { maxSteps: 50, timeoutMs: 7000 }
      );
      endGroup();
      if (!result.ok) {
        setError(result.error);
        return `Error: ${result.error}`;
      }
      return 'Done.';
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


