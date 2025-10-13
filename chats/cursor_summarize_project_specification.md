# Summarize project specification documents
_Exported on 10/13/2025 at 17:13:21 CDT from Cursor (1.7.44)_

---

**User**

The files in this directory are the project specification documents for a piece of software I'm trying to build. Read them over and then summarize their contents for me.

---

**Cursor**

I'll scan the three specification files to understand their content and then summarize them.

I’ve read all three docs; here’s a concise summary of what they define.

### PRD (prd.md)
- **Goal/MVP**: Build CollabCanvas, a real-time shared design canvas within 24 hours, prioritizing robust multiplayer over features.
- **Core users**: Designer (create/move shapes, pan/zoom, see others’ cursors), Collaborator (presence, instant edits, persistence), System (handle concurrent edits, persist state).
- **MVP features (critical)**:
  - **Canvas core**: Pan/zoom at 60 FPS; one simple shape type.
  - **Object manipulation**: Create and move shapes; immediate local rendering.
  - **Real-time collaboration**: Cursors with labels (<50ms), object sync (<100ms), presence list.
  - **Auth**: Firebase email/password with persistent identity.
  - **Persistence**: Save/restore canvas state via backend.
  - **Deployment**: Public URL; 5+ concurrent users.
- **Tech stack**: React + Konva on frontend; Firebase Auth + Firestore; deploy to Vercel or Firebase Hosting.
- **Architecture details**:
  - **Data model**: Single `/canvas` doc holding objects; `/presence/users/{userId}` with username, cursor, lastSeen.
  - **Sync strategy**: Local-first, broadcast to Firestore, listen to remote, last-write-wins.
  - **Performance**: Memoization, throttle cursor to ~16ms, batch updates, Konva layer caching.
- **Timeline (24h)**: Setup → Auth → Multiplayer cursors/presence → Canvas pan/zoom → Rectangle creation/movement sync → Polish/testing/deploy.
- **Risks & mitigation**: Real-time performance, conflicts, latency, Firestore limits; test early with multiple windows, keep scope minimal, fallback to Supabase if needed.
- **Testing & metrics**: Manual and load tests; hard pass criteria include deployment, auth, at least one shape, real-time sync, presence, persistence, performance targets.

### Architecture Diagram (architecture.mermaid)
- **Clients**: Two browsers (A/B) running a React app with `Konva` canvas and hooks (`useAuth`, `useCanvas`, `usePresence`, `useCursor`).
- **Service layer**: `auth.js`, `canvas.js`, `presence.js`, `firebase.js`.
- **Backend (Firebase)**: Auth + Firestore with collections:
  - **`canvas` document** for objects and metadata.
  - **`presence/users`** for online user data and cursors.
- **Flows**:
  - **Auth**: Client hooks → `auth.js` → Firebase Auth (token roundtrip).
  - **Canvas**: `canvas.js` writes/reads `canvas` doc; real-time listener updates canvases on both clients.
  - **Presence/Cursors**: `presence.js` writes cursor/user data to `presence/users`; real-time listener updates cursor renders on both canvases.
- **Deployment**: Vercel/Firebase Hosting serving the React app, with CDN for static assets; explicit latency targets noted (<50ms cursors, <100ms object changes).

### Task List & PR Breakdown (tasks.md)
- **Repo structure**: React app with `components` (Auth, Canvas, Multiplayer, Layout), `hooks`, `services`, `utils`, and standard entry files.
- **PRs (11 total)**:
  - 1: Project setup & deployment (Firebase init, env vars, deploy “Hello World”).
  - 2: Authentication (email/password, forms, `useAuth`, protected routes).
  - 3: Multiplayer cursor sync (`presence` service, 60 FPS throttle, cursors UI).
  - 4: Presence UI (online users list, join/leave, lastSeen heartbeat).
  - 5: Canvas pan & zoom (Konva Stage, 60 FPS).
  - 6: Rectangle creation (click-to-create, IDs, defaults).
  - 7: Rectangle movement (drag, update state).
  - 8: Firestore persistence (load/save/subscribe canvas).
  - 9: Real-time object sync across users (<100ms, conflict handling).
  - 10: Multi-user testing & fixes (5+ users, reconnects, perf).
  - 11: Final polish & deployment (UX tweaks, errors, README, demo).
- **Validation**: Checklists per PR for functionality and stability.
- **Estimates**: 18–28 hours total; critical path is PRs 3, 8, 9 with dependencies (Auth before presence; Canvas before rectangles; Persistence before real-time sync).

- Ensures a focused, Firebase-based real-time MVP with clear timelines, architecture, and stepwise PR plan aligned to measurable latency and performance targets.

---

**User**

Cool. That looks good. Let's get started!

---

**Cursor**

I'll create a TODO list for PR #1 and start by scaffolding the Vite React app, then install the required dependencies.

I'll scaffold the project with Vite in a new `collab-canvas` directory and run the install non-interactively.

npm isn't available on this system, so I'll install Node.js LTS via winget, then scaffold the Vite app.

Node.js LTS was installed, but the current shell didn't pick up PATH changes. I'll use the full path to npx/npm to scaffold the Vite app and install packages now.

---

**User**

Okay, I rejiggered my settings for my Node install. Running `node -v` and `npm -v` gets the expected output now. Before you continue, though, populate the .gitignore for this project based on the tech stack described in the tasks.md and architecture.mermaid. Include .env files as well.

---

**Cursor**

I'll check for a conflicting `.gitignore` directory and rename it if present, then create the `.gitignore` file at the repo root with ignores for Node/Vite/React, Firebase, Vercel, logs, OS/editor files, and all `.env` variants.

I'll rename any existing `.gitignore` directory to avoid conflicts and write a new `.gitignore` file at the repo root tailored to Node/Vite/React, Firebase, Vercel, logs, editors, OS files, and environment files (including all .env variants while keeping `.env.example` trackable).

I’m going to create a comprehensive `.gitignore` at the repo root tailored to Node/Vite/React, Firebase, Vercel, logs, editor/OS files, and all `.env` variants (keeping `.env.example` tracked).

I'll rename any existing `.gitignore` directory to avoid conflicts, then create a new `.gitignore` file tailored to Node/Vite/React, Firebase, Vercel, logs, editor/OS files, and all `.env` variants (keeping `.env.example` tracked).

```ignore
<<'PATCH'
*** Add File: c:\Users\s94da\gauntlet\CollabCanvas\.gitignore
+# Environment variables
+.env
+.env.*
+!.env.example
+.env.local
+.env.development.local
+.env.production.local
+.env.test.local
+
+# Node
+node_modules/
+npm-debug.log*
+yarn-debug.log*
+yarn-error.log*
+pnpm-debug.log*
+lerna-debug.log*
+.bun/
+
+# Builds / Bundlers
+dist/
+build/
+.vite/
+.cache/
+.eslintcache
+.turbo/
+coverage/
+
+# Firebase
+.firebase/
+firebase-debug.log
+firebase-debug.*.log
+
+# Vercel
+.vercel/
+
+# Logs
+logs
+*.log
+debug.log
+
+# Editors / OS
+.DS_Store
+Thumbs.db
+*.swp
+*.swo
+.idea/
+.vscode/
+
PATCH
```

I'll add a comprehensive `.gitignore` at the repo root tailored to Node/Vite/React, Firebase, Vercel, logs, editor/OS files, and all `.env` variants.

```ignore
# Environment variables
.env
.env.*
!.env.example
.env.local
.env.development.local
.env.production.local
.env.test.local

# Node
node_modules/
npm-debug.log*
yarn-debug.log*
yarn-error.log*
pnpm-debug.log*
lerna-debug.log*
.bun/

# Builds / Bundlers
dist/
build/
.vite/
.cache/
.eslintcache
.turbo/
coverage/

# Firebase
.firebase/
firebase-debug.log
firebase-debug.*.log

# Vercel
.vercel/

# Logs
logs
*.log
debug.log

# Editors / OS
.DS_Store
Thumbs.db
*.swp
*.swo
.idea/
.vscode/


```

Created `.gitignore` at the repo root covering Node/Vite/React, Firebase, Vercel, logs, editor/OS files, and all `.env` variants while keeping `.env.example` trackable.

- Added ignores for: `node_modules/`, build outputs (`dist/`, `build/`, `.vite/`), caches (`.cache/`, `.eslintcache`, `.turbo/`), coverage, Firebase (`.firebase/`, debug logs), Vercel (`.vercel/`), logs, and common OS/editor files.
- Included environment file patterns: `.env`, `.env.*`, `.env.local`, `.env.development.local`, `.env.production.local`, `.env.test.local`; explicitly un-ignored `.env.example`.

---

**User**

Excellent, continue.

---

**Cursor**

I'll scaffold the Vite React app and install dependencies next.

I'll scaffold the Vite React app using the absolute path to npm (to avoid PATH issues), then run install.

I'll scaffold the Vite React app in `collab-canvas` and install base and required dependencies (firebase, konva, react-konva) now.

---

**User**

Please continue.

---

**Cursor**

I'll scaffold the Vite React app in `collab-canvas` and install firebase, konva, and react-konva using the absolute npm path so it works even if PATH isn't refreshed.

I'll update the shell PATH for this session to include the Node.js directory, then scaffold the Vite React app and install dependencies as specified.

---

**User**

It looks like I was wrong about npm being in my PATH. Sorry about that.

---

**Cursor**

I’ll set Node on PATH for this shell, scaffold the Vite app, and install deps. Approve to run this one-liner?

```powershell
$env:Path='C:\Program Files\nodejs;' + $env:Path; if (Test-Path node_modules) { Remove-Item -Recurse -Force node_modules }; if (!(Test-Path collab-canvas)) { & 'C:\Program Files\nodejs\npx.cmd' --yes create-vite@latest collab-canvas -- --template react }; cd collab-canvas; & 'C:\Program Files\nodejs\npm.cmd' install --no-fund --no-audit; & 'C:\Program Files\nodejs\npm.cmd' install firebase konva react-konva --no-fund --no-audit
```

- Installs base deps and: firebase, konva, react-konva.

```powershell
$env:Path='C:\Program Files\nodejs;' + $env:Path; if (Test-Path node_modules) { Remove-Item -Recurse -Force node_modules }; if (!(Test-Path collab-canvas)) { & 'C:\Program Files\nodejs\npx.cmd' --yes create-vite@latest collab-canvas -- --template react }; cd collab-canvas; & 'C:\Program Files\nodejs\npm.cmd' install --no-fund --no-audit; & 'C:\Program Files\nodejs\npm.cmd' install firebase konva react-konva --no-fund --no-audit
```

