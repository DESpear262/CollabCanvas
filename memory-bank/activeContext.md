# Active Context — CollabCanvas

## Current Focus
- Restore Memory Bank documentation and keep it authoritative for resets
- Stabilize AI planning/execution flows and align tool schemas with canvas services

## Recent Changes
- Memory bank rebuilt with project brief, product context, system patterns, and tech context
- AI code under active edits: `src/services/ai/planner.ts`, `executor.ts`, `tools.ts`; `src/hooks/useAI.ts` updated
- `src/components/AI/ChatPanel.tsx` removed (likely replaced or consolidated)

## Decisions
- Maintain single shared canvas (`canvas/default`)
- Keep internal tool key `'pan'` while labeling UI as "Transform"
- Use last-write-wins for conflict resolution

## Next Steps (Short Term)
- Finalize `progress.md` with working features vs open gaps
- Ensure AI tools match runtime canvas APIs; add missing adapters if needed
- Validate presence and cursor latency in multi-user tests

## Risks / Considerations
- Planner generating tool calls not covered by `tools.ts`
- Ambiguous natural language without selection context
- Performance regressions from AI-driven batch operations

## Coordination
- Keep README and memory bank in sync when capabilities change
- Update `docs/` for performance and testing if scope expands
