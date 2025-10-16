# Planner

## Overview
- Orchestration flow:
  1. classifyPrompt(prompt) → simple | complex | chat: ...
  2. if chat → return message
  3. else buildPlan(prompt) via tool-calling
  4. runPlan(plan) with guardrails (maxSteps, timeout, per-step validation)

## Prompts
- Classifier (system summary):
  - You are an orchestration classifier inside a Figma-like canvas app.
  - Tools currently available: createShape(rectangle|circle), createText, moveShape, resizeShape, deleteShape
  - Respond strictly with: simple | complex | chat: <text>

- Planner (system summary):
  - You are a planner that outputs a sequence of function calls to manipulate a canvas.
  - Tools are provided as function schemas (OpenAI tool calling).

## Assumptions
- “simple” implies one tool call suffices.
- “complex” implies multi-step plan.
- “chat” implies non-actionable; display message to user.

## Failure Modes
- Model returns unexpected text → fallback: simple/complex heuristic
- Malformed tool args → rejected by validateParams
- Step timeouts → stop-on-failure and surface error

## Examples
- “create a 200x200 blue square at 100, 100” → simple
- “create 3 circles in a row” → complex
- “what shortcuts do you support?” → chat: …
