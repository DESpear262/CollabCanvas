# Tech Context — CollabCanvas

## Technologies
- React 19, Vite 7, TypeScript ~5.9
- Konva 10 + react-konva 19 (canvas rendering)
- Firebase 12 (Auth, Firestore, Realtime Database, Hosting)
- OpenAI SDK ^4.104 (AI function calling)
- Vitest 3 + @vitest/coverage-v8 for testing

## Development Setup
- Node.js 18+
- `npm install`
- Local dev: `npm run dev` → http://localhost:5173
- Build: `npm run build`, Preview: `npm run preview`

## Environment Variables (`.env.local`)
```
VITE_FIREBASE_API_KEY=...
VITE_FIREBASE_AUTH_DOMAIN=...
VITE_FIREBASE_PROJECT_ID=...
VITE_FIREBASE_STORAGE_BUCKET=...
VITE_FIREBASE_MESSAGING_SENDER_ID=...
VITE_FIREBASE_APP_ID=...

# AI
VITE_OPENAI_API_KEY=sk-...
```

## Firebase Configuration
- `firebase.json` for Hosting and database rules
- RTDB rules in `database.rules.json`
- Firestore rules in `firestore.rules` (if used)
- Deploy hosting: `npx firebase-tools deploy --only hosting --project <id>`
- Deploy RTDB rules: `npx firebase-tools deploy --only database --project <id>`

## Code Structure
- Components: `src/components/**` (Canvas, Auth, Layout, Multiplayer)
- Context: `src/context/**` (transform, selection, layout, tools)
- Hooks: `src/hooks/**` (auth, presence, cursor, history, AI)
- Services: `src/services/**` (firebase, auth, presence, canvas, ai/*)
- Utils: `src/utils/**`

## Technical Constraints
- Single shared document `canvas/default`
- Last-write-wins conflict policy
- Presence in RTDB for low latency
- Keep functions <75 LOC; files <750 LOC where practical

## Dependencies (from package.json)
- `firebase`, `react`, `react-dom`, `konva`, `react-konva`, `lucide-react`, `openai`
- Dev: `vite`, `typescript`, `vitest`, `@vitest/coverage-v8`, `firebase-tools`

## Testing
- `npm run test` for headless tests
- Focus tests on tool validation, executor, planner, and canvas service APIs

## Deployment
- Firebase Hosting serves SPA with rewrites to `/index.html`
- Build artifacts in `dist/`
