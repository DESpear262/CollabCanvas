# System Patterns — CollabCanvas

## Architecture Overview
- Frontend: React + Vite + TypeScript
- Rendering: Konva/react-konva in a pan/zoom Stage
- State: React Contexts for canvas transform and tool selection
- Services: `firebase.ts` (SDK init), `auth.ts`, `presence.ts`, `canvas.ts`
- Data: Firestore for canvas state, RTDB for presence/cursors
- AI Layer (Phase 2): `openai.ts`, `tools.ts`, `executor.ts`, `planner.ts`

## Key Design Decisions
- Single shared canvas (`canvas/default`) to simplify sync and UX
- Local-first updates followed by Firestore writes; listeners reconcile remote changes
- Conflict handling: last-write-wins, acceptable for MVP and Phase 2
- Presence in RTDB for lower-latency cursor streams; Firestore reserved for durable canvas objects
- UI label says "Transform" while internal tool key remains `'pan'` for backwards compatibility

## Component Relationships
- `Canvas` renders Konva Stage and layers; toolbars drive interactions
- Contexts expose transform and tool state across components
- Hooks (`usePresence`, `useCursor`, `useHistory`, `useAI`) encapsulate side-effects
- Services isolate Firebase operations and canvas data APIs

## Data Model (essentials)
- Presence (RTDB): `presence/{uid}` → `{ uid, email, displayName, cursor, lastSeen }`
- Canvas (Firestore): `canvas/default` → `{ rectsById, circlesById, textsById }`

## Realtime Flows
- Cursor/presence: heartbeat updates `lastSeen`; others subscribe and render overlays
- Canvas edits: optimistic local change → Firestore upsert → remote listeners update peers
- Throttling/loop prevention to maintain smoothness under multi-user edits

## AI Integration Patterns
- Tool registry defined in `tools.ts` with JSON-schema-like parameter validation
- Executor validates and dispatches to canvas service APIs
- Planner assembles multi-step sequences for complex tasks (e.g., login form)
- Same persistence and sync path as manual edits; no special AI state

## Extensibility
- Add commands by extending tool definitions and corresponding canvas functions
- Keep executor generic; avoid tool-specific branching
- Ensure new features remain within performance budgets and respect shared state

## Testing and Quality
- Vitest for unit/integration tests; mock LLM responses for deterministic checks
- Manual multi-user testing for latency and sync behavior
- Performance targets: <50ms cursors, <100ms objects, 60 FPS interactions
