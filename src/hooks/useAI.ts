/*
  File: useAI.ts
  Overview: Orchestrates AI interactions:
    1) Classify prompt (simple | complex | chat)
    2) For chat → return content; for simple/complex → build plan and run with progress logs
  Notes: All OpenAI responses and plan events are console-logged in DEV.
*/
import { useCallback, useState } from 'react';
// openai client imported in planner/openai; no direct usage here
import { classifyPrompt, buildPlan, runPlan } from '../services/ai/planner';

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
      // 1) Orchestration classification
      const cls = await classifyPrompt(text);
      console.log('[ai] classifyPrompt →', cls);
      if (cls.kind === 'chat') {
        // Return chat content to display
        return cls.message || '';
      }
      // 2) For simple/complex, build a tool-call plan and execute
      const plan = await buildPlan(text);
      console.log('[ai] buildPlan →', plan);
      const result = await runPlan(
        plan,
        {
          onStepStart: (s, i) => console.log('[ai] runPlan step start', i + 1, s.name, s.arguments),
          onStepSuccess: (s, i, data) => console.log('[ai] runPlan step success', i + 1, s.name, data),
          onStepError: (s, i, err) => console.log('[ai] runPlan step error', i + 1, s.name, err),
        },
        { maxSteps: 50, timeoutMs: 7000 }
      );
      console.log('[ai] runPlan result →', result);
      if (!result.ok) {
        setError(result.error);
        return `Error: ${result.error}`;
      }
      // Provide a brief confirmation message for the chat log
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


