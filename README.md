# CollabCanvas

A real-time collaborative canvas MVP built with React + Vite + TypeScript. Multiplayer is powered by Firebase (Auth + Firestore). Deployed to Firebase Hosting.

- Live URL: https://collabcanvas-ef253.web.app
- Tech stack:
  - Frontend: React ^19, Vite ^7, TypeScript ~5.9
  - Realtime/Backend: Firebase Authentication, Firestore (upcoming), Firebase Hosting
  - Canvas: Konva + react-konva (upcoming PRs)

## Project Structure

Flat single-app project:

```
.
├─ public/               # Static assets
├─ src/                  # App source
│  ├─ components/
│  │  ├─ Auth/           # AuthForm, Login, SignUp
│  │  └─ Layout/         # Header
│  ├─ hooks/             # useAuth
│  ├─ services/          # firebase.ts (SDK init), auth.ts (helpers)
│  ├─ App.tsx            # App gating: signed-in vs auth forms
│  └─ main.tsx           # React entry
├─ dist/                 # Production build output
├─ firebase.json         # Hosting config (public=dist, SPA rewrites)
├─ .firebaserc           # Default Firebase project
├─ package.json          # Scripts and dependencies
├─ tsconfig.json         # TypeScript config (JSX enabled)
└─ vercel.json           # Optional Vercel config (not required for Firebase Hosting)
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
- The app provides Sign up and Log in forms. On success, a header shows the current user and a Sign out button.
- Auth state uses `onAuthStateChanged` and gates the UI in `App.tsx`.
- Authorized domains: ensure localhost and your Hosting domain are in Firebase Console → Authentication → Settings → Authorized domains.

## Scripts

From the repo root:

- Development:
  - `npm install` (first time)
  - `npm run dev` → launches Vite dev server (http://localhost:5173)
- Production build:
  - `npm run build` → outputs to `./dist`
  - `npm run preview` → local preview of production build

## Deploy (Firebase Hosting)

Configured for Firebase Hosting:

- `firebase.json` → public directory is `dist`, SPA rewrites to `/index.html`.
- `.firebaserc` → default project `collabcanvas-ef253`.

Deploy:

```
npm run build
npx firebase-tools deploy --only hosting --project collabcanvas-ef253
```

After deploy, visit the Hosting URL printed in the output (currently https://collabcanvas-ef253.web.app).

## Roadmap (PRs)

- PR #1: Project setup & deploy (DONE)
- PR #2: Custom email/password auth (DONE)
- PR #3: Multiplayer cursor sync (presence + throttled cursor updates)
- PR #4: Presence UI (online users list)
- PR #5: Canvas pan & zoom (Konva Stage)
- PR #6: Rectangle creation
- PR #7: Rectangle movement
- PR #8: Firestore persistence (save/load/subscribe)
- PR #9: Real-time object sync across users
- PR #10: Multi-user testing & bug fixes
- PR #11: Final polish & deployment

## Troubleshooting

- `auth/operation-not-allowed`: enable Email/Password in Firebase Console.
- `auth/invalid-api-key` or `auth/domain-not-allowed`: verify `.env.local` and Authorized domains.
- Env changes require restarting dev server and rebuilding before deploying.
