# CollabCanvas MVP - Product Requirements Document

## Project Overview
CollabCanvas is a real-time collaborative design canvas that allows multiple users to create, edit, and manipulate simple shapes simultaneously on a single shared canvas. The MVP focuses exclusively on establishing bulletproof multiplayer infrastructure within a 24-hour deadline.

**Deadline:** Tuesday (24 hours from start)  
**Success Criteria:** Solid collaborative foundation over feature richness  
**Canvas Model:** Single shared canvas - all authenticated users collaborate on the same workspace

---

## User Stories

### Primary User: Designer/Creator
- As a designer, I want to create basic shapes on a canvas so that I can start building visual compositions
- As a designer, I want to move objects around the canvas so that I can arrange my design
- As a designer, I want to pan and zoom the canvas so that I can navigate a large workspace
- As a designer, I want to see other users' cursors in real-time so that I know where they're working
- As a designer, I want changes to sync immediately so that collaboration feels seamless

### Secondary User: Collaborator
- As a collaborator, I want to see who else is online so that I know who I'm working with
- As a collaborator, I want my edits to appear instantly for others so that we can work together efficiently
- As a collaborator, I want to return to the canvas and see my previous work so that I don't lose progress

### System User
- As the system, I need to handle multiple simultaneous edits without breaking
- As the system, I need to persist canvas state so that work isn't lost on disconnect

---

## MVP Feature Requirements

### 1. Canvas Core (Priority: CRITICAL)
- **Pan & Zoom**
  - Mouse drag to pan
  - Mouse wheel to zoom
  - Smooth 60 FPS performance
  - Workable canvas size (e.g., 5000x5000px)

- **Shape Support (Minimum 1 Type)**
  - Rectangle OR Circle OR Text
  - Solid color fills
  - Basic visual rendering

### 2. Object Manipulation (Priority: CRITICAL)
- **Create Objects**
  - Click/drag to create shapes
  - Objects appear on canvas immediately

- **Move Objects**
  - Click and drag to reposition
  - Updates position in real-time

### 3. Real-Time Collaboration (Priority: CRITICAL)
- **Multiplayer Cursors**
  - Show cursor position for all users
  - Display username label next to cursor
  - Update position <50ms

- **Object Synchronization**
  - Changes broadcast to all users
  - Updates appear <100ms
  - Handle 2+ concurrent users

- **Presence Awareness**
  - Display list of online users
  - Show when users join/leave

### 4. Authentication (Priority: CRITICAL)
- **User Accounts**
  - Firebase email/password authentication
  - Persistent identity across sessions
  - Username/email displayed with cursor

### 5. State Persistence (Priority: CRITICAL)
- **Canvas State**
  - Save all objects to backend
  - Persist across disconnects
  - Restore state on reconnect

### 6. Deployment (Priority: CRITICAL)
- **Public Access**
  - Live URL accessible to testers
  - Support 5+ concurrent users
  - Stable under load

---

## Tech Stack Recommendations

### Selected Tech Stack: Firebase

**Components:**
- **Frontend:** React + Konva.js (2D canvas rendering)
- **Backend:** Firestore (real-time DB) + Firebase Auth (Email/Password)
- **Hosting:** Vercel or Firebase Hosting

**Rationale:**
- Firestore real-time listeners handle sync automatically
- Built-in authentication with email/password
- Automatic state persistence
- Minimal backend code required
- Free tier sufficient for MVP testing

---

## Technical Architecture

### Data Model (Firestore Example)
```
/canvas (single document)
  - objects: Map<objectId, ObjectData>
  - metadata: { created, updated }

/presence/users/{userId}
  - username: string
  - cursor: { x, y }
  - lastSeen: timestamp

ObjectData:
  - id: string
  - type: 'rectangle'
  - x, y: number
  - width, height: number
  - color: string
  - rotation: number
```

### Real-Time Sync Strategy
1. **Local-first updates:** Update local state immediately for responsiveness
2. **Broadcast changes:** Push updates to Firestore
3. **Listen for remote changes:** Subscribe to Firestore updates from other users
4. **Conflict resolution:** Last write wins (document timestamp)

### Performance Considerations
- Use React memo/useMemo to prevent unnecessary re-renders
- Throttle cursor position updates (every 16ms / 60 FPS)
- Batch object updates where possible
- Use Konva's layer caching for static objects

---



## Critical Path (24-Hour Timeline)

### Hour 0-2: Foundation
- Project setup (React + Firebase)
- Deploy placeholder app

### Hour 2-4: Authentication
- Firebase email/password auth flow
- Basic sign up/login UI

### Hour 4-12: Multiplayer Sync (TOP PRIORITY)
- Cursor position sync between users
- Test with 2+ browser windows
- Presence detection (who's online)
- Validate <50ms cursor updates

### Hour 12-16: Core Canvas
- Konva.js canvas setup
- Pan and zoom implementation
- Create rectangles on click

### Hour 16-20: Object Sync
- Rectangle creation/movement sync
- Validate <100ms object updates
- Firestore persistence

### Hour 20-24: Polish & Testing
- Multi-user testing (2-3 browsers)
- Performance validation (60 FPS)
- Bug fixes
- Final deployment

---

## Risk Mitigation

### High-Risk Areas:
1. **Real-time sync performance:** Test early with multiple users
2. **State conflicts:** Keep conflict resolution simple (last write wins)
3. **Network latency:** Use local-first updates for responsiveness
4. **Firestore limits:** Monitor read/write usage on free tier

### Mitigation Strategies:
- Start with multiplayer infrastructure FIRST
- Test with 2+ browser windows from hour 8 onward
- Keep feature scope minimal
- Have rollback plan if Firebase issues arise (switch to Supabase)

---

## Testing Requirements

### Manual Test Cases:
1. ✅ Create object → appears on both screens
2. ✅ Move object → syncs in <100ms
3. ✅ User joins → presence list updates
4. ✅ User disconnects → cursor disappears
5. ✅ Refresh page → canvas state restored
6. ✅ Rapid object creation → no sync failures
7. ✅ Pan/zoom → maintains 60 FPS

### Load Testing:
- 2 concurrent users (minimum)
- 5 concurrent users (target)
- 50 objects on canvas simultaneously

---

## Success Metrics

### Hard Requirements (Must Pass):
- ✅ Deployed and publicly accessible
- ✅ User authentication working
- ✅ At least 1 shape type functional
- ✅ Real-time sync between 2+ users
- ✅ Multiplayer cursors with labels
- ✅ Presence awareness
- ✅ State persists on disconnect

### Performance Targets:
- ✅ 60 FPS during pan/zoom
- ✅ Object sync <100ms
- ✅ Cursor sync <50ms
- ✅ Supports 5+ concurrent users

---

## Next Steps

1. **Review & Approve:** Validate this PRD aligns with project goals
2. **Tech Stack Decision:** Confirm Firebase vs alternatives
3. **Project Setup:** Initialize repository and deploy pipeline
4. **Begin Development:** Start with auth → canvas → multiplayer

**Key Principle:** Multiplayer sync is non-negotiable. If time runs short, cut features, not collaboration quality.