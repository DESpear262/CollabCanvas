# CollabCanvas MVP - Task List & PR Breakdown

## Project File Structure

```
collab-canvas/
├── public/
│   └── index.html
├── src/
│   ├── components/
│   │   ├── Auth/
│   │   │   ├── Login.jsx
│   │   │   ├── SignUp.jsx
│   │   │   └── AuthForm.jsx
│   │   ├── Canvas/
│   │   │   ├── Canvas.jsx
│   │   │   ├── CanvasControls.jsx
│   │   │   └── Rectangle.jsx
│   │   ├── Multiplayer/
│   │   │   ├── Cursor.jsx
│   │   │   ├── CursorLayer.jsx
│   │   │   └── PresenceList.jsx
│   │   └── Layout/
│   │       ├── Header.jsx
│   │       └── MainLayout.jsx
│   ├── hooks/
│   │   ├── useAuth.js
│   │   ├── useCanvas.js
│   │   ├── usePresence.js
│   │   └── useCursor.js
│   ├── services/
│   │   ├── firebase.js
│   │   ├── auth.js
│   │   ├── canvas.js
│   │   └── presence.js
│   ├── utils/
│   │   ├── constants.js
│   │   └── helpers.js
│   ├── App.jsx
│   ├── index.js
│   └── index.css
├── .env.local
├── .gitignore
├── package.json
├── README.md
└── vercel.json (or firebase.json)
```

---

## PR #1: Project Setup & Deployment
**Goal:** Get basic React app running and deployed with Firebase configured

### Tasks:
- [ ] Initialize React app with Create React App or Vite
- [ ] Install dependencies (react, react-dom, firebase, konva, react-konva)
- [ ] Create Firebase project in console
- [ ] Set up Firebase config and initialize
- [ ] Add environment variables for Firebase keys
- [ ] Deploy "Hello World" to Vercel/Firebase Hosting
- [ ] Verify deployed URL is accessible

### Files Created:
- `package.json` - Dependencies and scripts
- `src/index.js` - React entry point
- `src/App.jsx` - Main app component
- `src/index.css` - Basic styles
- `src/services/firebase.js` - Firebase configuration and initialization
- `.env.local` - Firebase API keys (DO NOT COMMIT)
- `.gitignore` - Ignore node_modules, .env.local
- `README.md` - Setup instructions and deployed URL
- `vercel.json` or `firebase.json` - Deployment config

### Files Modified:
- None (new project)

### Testing:
**No Tests Required** - Manual validation sufficient for basic setup

### Validation:
- [ ] App loads at deployed URL
- [ ] Firebase connection works (check console for errors)
- [ ] No console errors

---

## PR #2: Authentication System
**Goal:** Implement Firebase email/password authentication with sign up and login

### Tasks:
- [ ] Create authentication service wrapper
- [ ] Build sign up form component
- [ ] Build login form component
- [ ] Implement useAuth custom hook
- [ ] Add authentication state management
- [ ] Create protected route logic
- [ ] Style authentication forms (minimal)
- [ ] Test sign up flow
- [ ] Test login flow
- [ ] Test persistence (refresh page stays logged in)

### Files Created:
- `src/services/auth.js` - Auth functions (signUp, login, logout, onAuthStateChanged)
- `src/hooks/useAuth.js` - Custom hook for auth state
- `src/components/Auth/SignUp.jsx` - Sign up form
- `src/components/Auth/Login.jsx` - Login form
- `src/components/Auth/AuthForm.jsx` - Shared form wrapper
- `src/components/Layout/Header.jsx` - Header with logout button

### Files Modified:
- `src/App.jsx` - Add auth state and conditional rendering
- `src/services/firebase.js` - Import and export auth instance

### Validation:
- [ ] User can sign up with email/password
- [ ] User can log in with credentials
- [ ] User stays logged in on page refresh
- [ ] Logout works correctly
- [ ] Firebase Auth console shows registered users

---

## PR #3: Multiplayer Cursor Sync
**Goal:** Real-time cursor position sync between users (<50ms)

### Tasks:
- [ ] Create presence service for Firestore
- [ ] Set up Firestore presence collection structure
- [ ] Implement cursor position tracking on mouse move
- [ ] Throttle cursor updates to 60 FPS (16ms)
- [ ] Create Cursor component for rendering other users' cursors
- [ ] Create CursorLayer component to manage all cursors
- [ ] Implement usePresence hook for real-time presence data
- [ ] Add cursor cleanup on user disconnect
- [ ] Display username label next to cursor
- [ ] Test with 2+ browser windows

### Files Created:
- `src/services/presence.js` - Presence CRUD (updateCursor, subscribeToPresence, cleanup)
- `src/hooks/usePresence.js` - Hook for presence state
- `src/hooks/useCursor.js` - Hook for cursor tracking
- `src/components/Multiplayer/Cursor.jsx` - Individual cursor render
- `src/components/Multiplayer/CursorLayer.jsx` - All cursors container
- `src/utils/constants.js` - Constants (CURSOR_UPDATE_THROTTLE, etc.)

### Files Modified:
- `src/App.jsx` - Add CursorLayer component
- `src/services/firebase.js` - Import and export Firestore instance

### Validation:
- [ ] Open 2 browser windows (different users)
- [ ] Mouse movement appears on other screen in <50ms
- [ ] Username displays next to cursor
- [ ] Cursor disappears when user disconnects
- [ ] No performance issues with cursor movement

---

## PR #4: Presence Awareness UI
**Goal:** Display list of online users

### Tasks:
- [ ] Create PresenceList component
- [ ] Style presence list (sidebar or header)
- [ ] Show online user count
- [ ] Display all connected usernames
- [ ] Update presence "lastSeen" timestamp
- [ ] Handle user join/leave events
- [ ] Add visual indicator for "online" status

### Files Created:
- `src/components/Multiplayer/PresenceList.jsx` - Online users list

### Files Modified:
- `src/App.jsx` - Add PresenceList component
- `src/services/presence.js` - Add updatePresence function for heartbeat
- `src/hooks/usePresence.js` - Add logic to filter online users

### Validation:
- [ ] Online users list shows all connected users
- [ ] List updates when users join/leave
- [ ] User count is accurate

---

## PR #5: Basic Canvas with Pan & Zoom
**Goal:** Konva.js canvas with smooth pan and zoom controls

### Tasks:
- [ ] Install react-konva and konva
- [ ] Create Canvas component with Konva Stage
- [ ] Implement pan functionality (drag canvas)
- [ ] Implement zoom functionality (mouse wheel)
- [ ] Set canvas size (e.g., 5000x5000)
- [ ] Add zoom limits (min/max)
- [ ] Ensure 60 FPS performance
- [ ] Add canvas background/grid (optional)

### Files Created:
- `src/components/Canvas/Canvas.jsx` - Main Konva Stage component
- `src/components/Canvas/CanvasControls.jsx` - Pan/zoom controls (optional UI)
- `src/hooks/useCanvas.js` - Canvas state management hook

### Files Modified:
- `src/App.jsx` - Replace placeholder with Canvas component
- `src/utils/constants.js` - Add canvas constants (size, zoom limits)

### Validation:
- [ ] Canvas renders without errors
- [ ] Can pan by dragging
- [ ] Can zoom with mouse wheel
- [ ] Maintains 60 FPS during interactions
- [ ] Zoom has reasonable limits

---

## PR #6: Rectangle Creation
**Goal:** Users can create rectangles by clicking on canvas

### Tasks:
- [ ] Create Rectangle component (Konva.Rect)
- [ ] Implement click-to-create rectangle logic
- [ ] Generate unique IDs for each rectangle
- [ ] Set default rectangle properties (color, size)
- [ ] Render rectangles on canvas
- [ ] Store rectangles in local state
- [ ] Test creating multiple rectangles

### Files Created:
- `src/components/Canvas/Rectangle.jsx` - Konva Rectangle component

### Files Modified:
- `src/components/Canvas/Canvas.jsx` - Add rectangle creation logic and rendering
- `src/hooks/useCanvas.js` - Add rectangle state management
- `src/utils/constants.js` - Add default rectangle properties
- `src/utils/helpers.js` - Add generateId() function

### Validation:
- [ ] Click creates rectangle at cursor position
- [ ] Rectangles have unique IDs
- [ ] Multiple rectangles can be created
- [ ] Rectangles render correctly

---

## PR #7: Rectangle Movement (Local)
**Goal:** Users can drag rectangles around the canvas

### Tasks:
- [ ] Add draggable prop to Rectangle component
- [ ] Implement onDragEnd handler
- [ ] Update rectangle position in state
- [ ] Ensure smooth drag performance
- [ ] Test dragging multiple rectangles

### Files Modified:
- `src/components/Canvas/Rectangle.jsx` - Add drag handlers
- `src/components/Canvas/Canvas.jsx` - Update rectangle position on drag
- `src/hooks/useCanvas.js` - Add updateRectangle function

### Validation:
- [ ] Rectangles can be dragged smoothly
- [ ] Position updates correctly
- [ ] No performance issues during drag
- [ ] Multiple rectangles can be moved independently

---

## PR #8: Canvas State Persistence (Firestore)
**Goal:** Save and load canvas state from Firestore

### Tasks:
- [ ] Create canvas service for Firestore operations
- [ ] Set up Firestore canvas collection structure
- [ ] Implement saveCanvas function
- [ ] Implement loadCanvas function on mount
- [ ] Subscribe to real-time canvas updates
- [ ] Save rectangles to Firestore on create
- [ ] Save rectangle updates on move
- [ ] Test persistence across page refresh

### Files Created:
- `src/services/canvas.js` - Canvas CRUD (saveObject, updateObject, deleteObject, subscribeToCanvas)

### Files Modified:
- `src/hooks/useCanvas.js` - Integrate Firestore sync
- `src/components/Canvas/Canvas.jsx` - Load canvas on mount
- `src/services/firebase.js` - Ensure Firestore is initialized

### Validation:
- [ ] Create rectangle → persists in Firestore
- [ ] Refresh page → rectangles still there
- [ ] Move rectangle → position updates in Firestore
- [ ] Check Firebase console to verify data

---

## PR #9: Real-Time Object Sync
**Goal:** Rectangle changes sync across all users in <100ms

### Tasks:
- [ ] Subscribe to Firestore canvas updates
- [ ] Listen for new rectangles from other users
- [ ] Listen for rectangle position updates
- [ ] Prevent sync loops (don't re-sync own changes)
- [ ] Handle conflict resolution (last write wins)
- [ ] Test with 2+ users creating rectangles
- [ ] Test with 2+ users moving rectangles
- [ ] Measure sync latency

### Files Modified:
- `src/hooks/useCanvas.js` - Add real-time listener for canvas changes
- `src/services/canvas.js` - Refine update logic to prevent loops

### Validation:
- [ ] User A creates rectangle → User B sees it instantly
- [ ] User A moves rectangle → User B sees update <100ms
- [ ] Both users can create/move simultaneously
- [ ] No duplicate rectangles
- [ ] No sync errors in console

---

## PR #10: Multi-User Testing & Bug Fixes
**Goal:** Ensure app works flawlessly with 5+ concurrent users

### Tasks:
- [ ] Test with 5+ browser windows/users
- [ ] Verify cursor sync with multiple users
- [ ] Verify object sync with rapid changes
- [ ] Test disconnect/reconnect scenarios
- [ ] Fix any race conditions or sync bugs
- [ ] Optimize performance if FPS drops
- [ ] Add error handling for network failures
- [ ] Test on deployed URL (not just localhost)

### Files Modified:
- Any files with bugs discovered during testing
- `src/utils/helpers.js` - Add error handling utilities if needed
- `src/services/canvas.js` - Add retry logic for failed writes
- `src/services/presence.js` - Add reconnection handling

### Validation:
- [ ] 5+ users can work simultaneously without issues
- [ ] Cursor sync works for all users
- [ ] Object sync works for all users
- [ ] No crashes on disconnect/reconnect
- [ ] Performance maintains 60 FPS
- [ ] All MVP requirements met

---

## PR #11: Final Polish & Deployment
**Goal:** Clean up UI, finalize deployment, submit

### Tasks:
- [ ] Add minimal styling for better UX
- [ ] Add loading states
- [ ] Add error messages for auth failures
- [ ] Verify all MVP checklist items
- [ ] Update README with setup instructions
- [ ] Add deployed URL to README
- [ ] Final deployment
- [ ] Record demo video
- [ ] Submit project

### Files Modified:
- `src/index.css` - Final styling
- `src/components/Auth/Login.jsx` - Add error states
- `src/components/Auth/SignUp.jsx` - Add error states
- `src/components/Layout/Header.jsx` - Polish header
- `README.md` - Complete documentation
- Any final bug fixes

### Validation:
- [ ] App is visually presentable
- [ ] No console errors
- [ ] Deployed URL works reliably
- [ ] README has clear setup instructions
- [ ] All MVP requirements verified:
  - [ ] Basic canvas with pan/zoom ✓
  - [ ] Rectangle creation and movement ✓
  - [ ] Real-time sync between 2+ users ✓
  - [ ] Multiplayer cursors with name labels ✓
  - [ ] Presence awareness (who's online) ✓
  - [ ] User authentication (email/password) ✓
  - [ ] Deployed and publicly accessible ✓

---

## Time Estimates

| PR # | Description | Estimated Time |
|------|-------------|----------------|
| 1 | Project Setup & Deployment | 1-2 hours |
| 2 | Authentication System | 2-3 hours |
| 3 | Multiplayer Cursor Sync | 3-4 hours |
| 4 | Presence Awareness UI | 1 hour |
| 5 | Basic Canvas with Pan & Zoom | 2-3 hours |
| 6 | Rectangle Creation | 1-2 hours |
| 7 | Rectangle Movement (Local) | 1 hour |
| 8 | Canvas State Persistence | 2-3 hours |
| 9 | Real-Time Object Sync | 2-3 hours |
| 10 | Multi-User Testing & Bug Fixes | 2-4 hours |
| 11 | Final Polish & Deployment | 1-2 hours |
| **Total** | | **18-28 hours** |

---

## Notes

- **Critical Path:** PRs 3, 8, and 9 are the most important. These are the multiplayer core.
- **Dependencies:** 
  - PR #2 must be complete before PR #3 (need auth for user IDs)
  - PR #5 must be complete before PR #6-7 (need canvas before rectangles)
  - PR #8 must be complete before PR #9 (need persistence before sync)
- **Testing:** Test each PR with multiple browser windows before moving to the next
- **Performance:** Monitor FPS in Chrome DevTools Performance tab during PRs 5, 7, 9, 10