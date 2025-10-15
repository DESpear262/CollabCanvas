# CollabCanvas

A real-time collaborative canvas MVP built with React + Vite + TypeScript. Multiplayer is powered by Firebase (Auth + Firestore), with low-latency cursors/presence via Firebase Realtime Database. Deployed to Firebase Hosting.

## Deployed Link

- https://collabcanvas-ef253.web.app/
- Tech stack:
  - Frontend: React ^19, Vite ^7, TypeScript ~5.9
  - Realtime/Backend: Firebase Authentication, Firestore (objects/persistence), Realtime Database (cursors/presence), Firebase Hosting
  - Canvas: Konva + react-konva

## Setup Guide

1) Prerequisites
   - Node.js 18+ and npm
   - A Firebase project with Authentication, Firestore, Realtime Database, and Hosting enabled

2) Clone and install
```
git clone <this-repo-url>
cd CollabCanvas
npm install
```

3) Configure environment variables
   - Create `./.env.local` and populate with your Firebase Web App credentials (see below).

4) Run locally
```
npm run dev
# open http://localhost:5173
```

5) Build and deploy to Firebase Hosting
```
npm run build
npx firebase-tools deploy --only hosting --project collabcanvas-ef253
```

6) Deploy Realtime Database rules
```
npx firebase-tools deploy --only database --project collabcanvas-ef253
```

## Project Structure

Flat single-app project:

```
.
├─ public/
├─ src/
│  ├─ components/
│  │  ├─ Auth/
│  │  ├─ Layout/
│  │  └─ Multiplayer/        # Cursor, CursorLayer
│  ├─ hooks/                  # useAuth, usePresence, useCursor
│  ├─ services/               # firebase.ts (SDK init), auth.ts, presence.ts
│  ├─ utils/                  # constants.ts
│  ├─ App.tsx
│  └─ main.tsx
├─ dist/
├─ firebase.json              # Hosting + RTDB rules path
├─ database.rules.json        # RTDB rules (presence)
├─ .firebaserc
├─ package.json
├─ tsconfig.json
└─ vercel.json (optional)
```

## Environment Variables

Create `./.env.local` with your Firebase web app credentials (Project Settings → Your web app):

```
VITE_FIREBASE_API_KEY=your_key
VITE_FIREBASE_AUTH_DOMAIN=your_project.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=your_project_id
VITE_FIREBASE_STORAGE_BUCKET=your_project.appspot.com
VITE_FIREBASE_MESSAGING_SENDER_ID=1234567890
VITE_FIREBASE_APP_ID=1:1234567890:web:abcdef123456
```

Notes:
- Vite only exposes variables prefixed with `VITE_` to client code.
- After changing `.env.local`, restart the dev server and rebuild before deploying.

## Authentication (Email/Password)

- Enable Email/Password in Firebase Console → Authentication → Sign-in method.
- The app provides Sign up and Log in forms; auth state gates the UI in `App.tsx`.
- Authorized domains: ensure localhost and your Hosting domain are allowed.

## Cursors & Presence (Realtime Database)

- We use Firebase Realtime Database for low-latency cursor sync under `presence/{uid}`.
- RTDB Rules (`database.rules.json`):
```
{
  "rules": {
    ".read": false,
    ".write": false,
    "presence": {
      ".read": "auth != null",
      "$uid": { ".write": "auth != null && auth.uid == $uid" }
    }
  }
}
```
- Deploy rules:
```
npx firebase-tools deploy --only database --project collabcanvas-ef253
```

### Presence behavior
- Heartbeat updates `lastSeen` periodically; the Online list shows users seen within a configurable window (currently 5 minutes).
- Presence list is pinned to the right and does not reduce the active area.
- Future enhancements (see `TODO.md`): idle/away detection, tooltips, animations, and avatar colors.

## Architecture Overview

- Frontend (React + Vite + TypeScript)
  - Rendering and interactions via Konva/react-konva within a pan/zoom Stage
  - UI state via React Contexts: `CanvasTransformContext`, `ToolContext`

- Services layer (`src/services/`)
  - `firebase.ts`: initializes Auth, Firestore, and RTDB (with offline persistence for Firestore)
  - `auth.ts`: email/password auth, sign-in/out
  - `presence.ts`: RTDB presence under `presence/{uid}` with `{ uid, email, displayName, cursor, lastSeen }`
  - `canvas.ts`: Firestore persistence for canvas objects (map-per-object upserts: `rectsById`, `circlesById`, `textsById`)

- Data model
  - Presence (RTDB):
    - Path: `presence/{uid}`
    - Fields: `uid`, `email`, `displayName`, `cursor: {x,y}|null`, `lastSeen: number (ms)`
    - onDisconnect removes `presence/{uid}` for immediate disappearance
  - Canvas (Firestore):
    - Doc: `canvas/default`
    - Fields: `rectsById`, `circlesById`, `textsById` keyed by id; each record includes metadata for conflict handling

- Realtime flows
  - Cursor/presence: client emits cursor + heartbeat to RTDB; others subscribe and render in overlay
  - Canvas edits: local-first updates; granular upserts to Firestore; remote snapshots applied with loop prevention and throttling

## Scripts

From the repo root:

- Development:
  - `npm install`
  - `npm run dev` (http://localhost:5173)
- Production build:
  - `npm run build`
  - `npm run preview`

## Deploy (Firebase Hosting)

- Hosting config serves `dist` and SPA rewrites to `/index.html`.
- Deploy:
```
npm run build
npx firebase-tools deploy --only hosting --project collabcanvas-ef253
```

## Roadmap

- PR #1: Project setup & deploy (DONE)
- PR #2: Custom email/password auth (DONE)
- PR #3: Multiplayer cursor sync via RTDB (DONE)
- PR #4: Presence UI (online users list)
- PR #5: Canvas pan & zoom (Konva Stage)
- PR #6: Rectangle creation
- PR #7: Rectangle movement
- PR #8: Firestore persistence (save/load/subscribe)
- PR #9: Real-time object sync across users
- PR #10: Multi-user testing & bug fixes
- PR #11: Final polish & deployment
