# CollabCanvas - Comprehensive Testing Checklist

## Purpose
This checklist maps directly to the rubric scoring criteria. Test systematically to ensure every rubric point is earned. Each section tells you exactly what to test and what "passing" looks like.

**Testing Setup:**
- Browser A: Your main browser (Chrome recommended)
- Browser B: Incognito/private window OR different browser
- Browser C: Third window for multi-user tests
- Network Throttling: Chrome DevTools → Network tab → Throttling dropdown

---

## Section 1: Core Collaborative Infrastructure (30 points)

### Real-Time Synchronization (12 points - Target: Excellent)

#### Object Sync (<100ms) - Test These:
- [ ] **Test 1.2:** Browser A moves rectangle → Browser B sees movement
  - ✅ Pass: Position updates within 100ms
  - ❌ Fail: Visible lag or stutter
  FAIL: Stutter
  
 
#### Cursor Sync (<50ms) - Test These:
- [ ] **Test 1.6:** Move cursor to specific coordinate → Both browsers show same position
  - ✅ Pass: Cursors overlap exactly (within 5px)
  - ❌ Fail: Cursors offset or misaligned
  FAIL: represented cursor always noticeably higher than the real one
  (relative to objects on canvas)

- [ ] **Test 1.7:** Pan/zoom in Browser A → Browser B cursor stays accurate
  - ✅ Pass: Cursor position correct after pan/zoom
  - ❌ Fail: Cursor drifts or becomes misaligned
  FAIL: represented cursor drifts after mouse-up

#### Rapid Multi-User Edits - Test These:
- [ ] **Test 1.9:** Both users move same object simultaneously
  - ✅ Pass: Object moves smoothly, settles on one final position
  - ❌ Fail: Object jumps, duplicates, or freezes
  ONLY HAVE ONE MOUSE, INCONCLUSIVE
**Scoring Guide:**
- 11-12 points: All tests pass, zero visible lag
- 9-10 points: Most tests pass, occasional minor delays
- 6-8 points: Tests pass but noticeable 200-300ms delays

---

### Conflict Resolution & State Management (9 points - Target: Excellent)

#### Simultaneous Edit Tests - Test These:
- [ ] **Test 1.10:** Browser A and B both drag same rectangle at exact same time
  - ✅ Pass: Both see consistent final position, no duplicates
  - ❌ Fail: Two rectangles appear, or different positions on each screen
  INCONCLUSIVE, ONLY ONE MOUSE
- [ ] **Test 1.11:** Browser A resizes circle while Browser B changes its color
  - ✅ Pass: Final object has both changes (new size AND new color)
  - ❌ Fail: One change lost, object corrupted, or inconsistent state
  INCONCLUSIVE, ONLY ONE MOUSE
- [ ] **Test 1.12:** Browser A moves object while Browser B deletes it
  - ✅ Pass: Object either moves OR deletes consistently on both screens
  - ❌ Fail: Ghost object, or different state on each browser
  INCONCLUSIVE, ONLY ONE MOUSE
#### Rapid Edit Storm - Test This:
- [ ] **Test 1.13:** 3 users (Browsers A, B, C) all edit same object rapidly for 10 seconds
  - User A: Resize constantly
  - User B: Change color repeatedly
  - User C: Move object around
  - ✅ Pass: Object settles into consistent state, all users see same thing
  - ❌ Fail: Corrupted state, duplicates, or different on each screen
  FAIL to the extent I can test alone: attempt to multi-drag by one user creates horrendous bouncing visible to both users
  INCONCLUSIVE, ONLY ONE MOUSE
#### Strategy Documentation - Check This:
- [ ] **Test 1.14:** README or docs explain conflict resolution strategy
  - ✅ Pass: "Last-write-wins" or similar documented clearly
  - ❌ Fail: No documentation or unclear strategy

**Scoring Guide:**
- 8-9 points: All simultaneous edits resolve correctly, strategy documented
- 6-7 points: 90%+ success rate, minor visual artifacts
- 4-5 points: Sometimes creates duplicates, strategy unclear

---

### Persistence & Reconnection (9 points - Target: Excellent)

#### Refresh Tests - Test These:

#### Network Drop Tests - Test These:
- [ ] **Test 1.20:** Chrome DevTools → Network → Offline (30 seconds) → Online
  - ✅ Pass: Auto-reconnects, canvas state syncs without data loss
  - ❌ Fail: Requires manual refresh or loses data
  INCONCLUSIVE - cursor updated live during even with throttling set to "offline"

**Scoring Guide:**
- 8-9 points: All tests pass, connection status shown, auto-reconnect works
- 6-7 points: Refresh preserves 95%+ state, reconnection mostly works
- 4-5 points: Loses last 10-30 seconds on refresh, inconsistent persistence

---

## Section 2: Canvas Features & Performance (20 points)

### Canvas Functionality (8 points - Target: Excellent)

#### Basic Features - Test These:

#### Transform Operations - Test These:
- [ ] **Test 2.4:** Move object by dragging
  - ✅ Pass: Smooth drag, updates position
  - ❌ Fail: Jumpy or broken
  FAIL: Jumpy

#### Advanced Features - Test These:
- [ ] **Test 2.8:** Multi-select with shift-click
  - ✅ Pass: Can select multiple objects, visual indication
  - ❌ Fail: Can't multi-select
  FAIL, nothing happens
- [ ] **Test 2.9:** Layer management (bring to front/send to back)
  - ✅ Pass: Z-index changes work
  - ❌ Fail: Not implemented or broken
  FAIL, broken
- [ ] **Test 2.10:** In-place text editing
  - ✅ Pass: Double-click text to edit inline
  - ❌ Fail: Must recreate text object
  FAIL: double-click does nothing with either 1 or 2 control selected
- [ ] **Test 2.11:** Duplicate object
  - ✅ Pass: Duplicate creates copy
  - ❌ Fail: Not implemented
  FAIL: can't find control

- [ ] **Test 2.13 (NEW):** Z-index via UI/shortcuts
  - ✅ Pass: Bring forward/backward and to front/back via toolbar or shortcuts updates order across clients
  - ❌ Fail: No UI/shortcut control or desync across clients
  FAIL: can't test because Z-index changer doesn't work
- [ ] **Test 2.14 (NEW):** Color picker recent colors (if implemented)
  - ✅ Pass: Recent colors capture last 8, MRU order, applied to selection
  - ❌ Fail: Recent list wrong length/order or not applied
  FAIL: can't identify control
- [ ] **Test 2.15 (NEW):** Export PNG
  - ✅ Pass: Export downloads PNG with visible current canvas content
  - ❌ Fail: No download or wrong content

**Scoring Guide:**
- 7-8 points: All basic features + 4+ advanced features working smoothly
- 5-6 points: All basic features + 2-3 advanced features
- 3-4 points: Basic features work, limited advanced features

---

### Performance & Scalability (12 points - Target: Excellent)

#### Object Load Tests - Test These:
- [ ] **Test 2.12:** Create 100 objects → pan/zoom rapidly
  - ✅ Pass: Maintains 60 FPS (smooth, no stutter)
  - ❌ Fail: Drops below 60 FPS, laggy
  
- [ ] **Test 2.13:** Create 300 objects → pan/zoom rapidly
  - ✅ Pass: Maintains 60 FPS
  - ❌ Fail: Noticeable slowdown
  
- [ ] **Test 2.14:** Create 500 objects → pan/zoom rapidly
  - ✅ Pass: Maintains 60 FPS (THIS IS THE KEY TEST)
  - ❌ Fail: Drops below 60 FPS
  
- [ ] **Test 2.15:** Check FPS counter (Chrome DevTools → Rendering → FPS meter)
  - ✅ Pass: 60 FPS steady during all interactions
  - ❌ Fail: FPS drops below 60

#### Multi-User Scalability - Test These:
- [ ] **Test 2.16:** 2 users creating/moving objects simultaneously
  - ✅ Pass: No performance degradation
  - ❌ Fail: Lag appears with 2 users
  
- [ ] **Test 2.17:** 3 users editing simultaneously
  - ✅ Pass: Smooth performance
  - ❌ Fail: Noticeable slowdown
  
- [ ] **Test 2.18:** 5 users editing simultaneously
  - ✅ Pass: Smooth performance (THIS IS THE KEY TEST)
  - ❌ Fail: Major slowdown or broken
  
- [ ] **Test 2.19:** 5 users + 200 objects on canvas
  - ✅ Pass: Still maintains 60 FPS
  - ❌ Fail: Performance degrades

#### Bonus Scale Tests (Optional):
- [ ] **Test 2.20:** 10+ concurrent users
  - ✅ Pass: Still works smoothly (+1 bonus point)
  - ❌ Fail: Doesn't affect base score
  
- [ ] **Test 2.21:** 1000+ objects at 60 FPS
  - ✅ Pass: Maintains performance (+1 bonus point)
  - ❌ Fail: Doesn't affect base score

**Scoring Guide:**
- 11-12 points: 500+ objects at 60 FPS, 5+ users no degradation
- 9-10 points: 300+ objects at 60 FPS, 4-5 users minor slowdown
- 6-8 points: 100+ objects at 60 FPS, 2-3 users supported

---

## Section 3: Advanced Figma-Inspired Features (15 points)

### Feature Inventory Checklist

Count your implemented features and map to rubric:

#### Tier 1 Features (2 points each, max 3 = 6 points):
- [ ] **F3.1:** Color picker with recent colors/palettes
- [ ] **F3.2:** Undo/redo with keyboard shortcuts (Cmd+Z/Cmd+Shift+Z)
- [ ] **F3.3:** Keyboard shortcuts (Delete, Duplicate, Arrow keys)
- [ ] **F3.4:** Export canvas as PNG/SVG
- [ ] **F3.5:** Snap-to-grid or smart guides
- [ ] **F3.6:** Object grouping/ungrouping
- [ ] **F3.7:** Copy/paste functionality

**Test each implemented feature:**
- [ ] Feature works correctly
- [ ] Feature syncs to all users (if applicable)
- [ ] No bugs or crashes

#### Tier 2 Features (3 points each, max 2 = 6 points):
- [ ] **F3.8:** Component system (reusable components)
- [ ] **F3.9:** Layers panel with drag-to-reorder
- [ ] **F3.10:** Alignment tools (align left/right/center, distribute)
- [ ] **F3.11:** Z-index management (bring to front, send to back)
- [ ] **F3.12:** Selection tools (lasso select, select all of type)
- [ ] **F3.13:** Styles/design tokens (save and reuse colors, text styles)
- [ ] **F3.14:** Canvas frames/artboards

**Test each implemented feature:**
- [ ] Feature works correctly
- [ ] Feature syncs to all users (if applicable)
- [ ] No bugs or crashes

#### Tier 3 Features (3 points each, max 1 = 3 points):
- [ ] **F3.15:** Auto-layout (flexbox-like spacing)
- [ ] **F3.16:** Collaborative comments/annotations
- [ ] **F3.17:** Version history with restore
- [ ] **F3.18:** Plugins or extensions system
- [ ] **F3.19:** Vector path editing (pen tool)
- [ ] **F3.20:** Advanced blend modes and opacity
- [ ] **F3.21:** Prototyping/interaction modes

**Test each implemented feature:**
- [ ] Feature works correctly
- [ ] Feature is production-quality
- [ ] No bugs or crashes

**Scoring Guide:**
- 13-15 points: 3 Tier 1 + 2 Tier 2 + 1 Tier 3, all working excellently
- 10-12 points: 2-3 Tier 1 + 1-2 Tier 2, all working well
- 6-9 points: 2-3 Tier 1 OR 1 Tier 2 working adequately

---

## Section 4: AI Canvas Agent (25 points)

### Command Breadth & Capability (10 points - Target: Excellent)

#### Creation Commands - Test These (Need 2+):
- [ ] **Test 4.1:** "Create a red circle at position 100, 200"
  - ✅ Pass: Red circle appears at correct position
  - ❌ Fail: Wrong color, wrong position, or doesn't create
  
- [ ] **Test 4.2:** "Add a text layer that says 'Hello World'"
  - ✅ Pass: Text appears with correct content
  - ❌ Fail: Wrong text or doesn't create
  
- [ ] **Test 4.3:** "Make a 200x300 blue rectangle"
  - ✅ Pass: Rectangle with correct dimensions and color
  - ❌ Fail: Wrong size or color
  
- [ ] **Test 4.4:** Try 2-3 variations of creation commands
  - Different phrasing, different shapes
  - ✅ Pass: AI understands variations
  - ❌ Fail: Only works with exact phrasing

#### Manipulation Commands - Test These (Need 2+):
- [ ] **Test 4.5:** Create a shape, then "Move the blue rectangle to the center"
  - ✅ Pass: Object moves to center of canvas
  - ❌ Fail: Doesn't move or wrong position
  
- [ ] **Test 4.6:** "Resize the circle to be twice as big"
  - ✅ Pass: Circle doubles in size
  - ❌ Fail: Wrong size or doesn't resize
  
- [ ] **Test 4.7:** "Delete all red shapes"
  - ✅ Pass: All red objects removed
  - ❌ Fail: Doesn't delete or deletes wrong objects
  
- [ ] **Test 4.8:** "Rotate the text 45 degrees" (if rotation implemented)
  - ✅ Pass: Text rotates correctly
  - ❌ Fail: Doesn't rotate

#### Layout Commands - Test These (Need 1+):
- [ ] **Test 4.9:** Create 3 shapes, then "Arrange these in a horizontal row"
  - ✅ Pass: Shapes arranged horizontally with spacing
  - ❌ Fail: Poor arrangement or doesn't work
  
- [ ] **Test 4.10:** "Create a grid of 3x3 squares"
  - ✅ Pass: 9 squares in grid layout
  - ❌ Fail: Wrong count or poor layout
  
- [ ] **Test 4.11:** "Space these elements evenly"
  - ✅ Pass: Selected objects distributed evenly
  - ❌ Fail: Doesn't space correctly

#### Complex Commands - Test These (Need 1+):
- [ ] **Test 4.12:** "Create a login form with username and password fields"
  - ✅ Pass: 3+ elements (username field, password field, button) arranged vertically
  - ❌ Fail: <3 elements or poor layout
  
- [ ] **Test 4.13:** "Build a navigation bar with 4 menu items"
  - ✅ Pass: 4+ elements arranged horizontally like a nav bar
  - ❌ Fail: Poor layout or wrong count
  
- [ ] **Test 4.14:** "Make a card layout with title and description"
  - ✅ Pass: 2+ text elements arranged like a card
  - ❌ Fail: Poor layout

#### Command Count Check:
- [ ] **Total distinct command types working:** _____ (need 6+ for Satisfactory, 8+ for Excellent)

**Scoring Guide:**
- 9-10 points: 8+ distinct commands, covers all categories, diverse and meaningful
- 7-8 points: 6-7 commands, covers most categories, good variety
- 5-6 points: Exactly 6 commands, limited variety

---

### Complex Command Execution (8 points - Target: Excellent)

#### Login Form Test - Test This:
- [ ] **Test 4.15:** "Create a login form with username and password fields"
  - ✅ Excellent (7-8 pts): 3+ elements properly arranged, smart positioning, looks like a form
  - ✅ Good (5-6 pts): 2-3 elements, basic layout
  - ❌ Satisfactory (3-4 pts): Elements created but poorly arranged
  - ❌ Poor (0-2 pts): Fails or nonsensical result

#### Multi-Step Execution - Test These:
- [ ] **Test 4.16:** Complex command creates multiple objects in sequence
  - ✅ Pass: Can see objects appear one by one (or quickly in sequence)
  - ❌ Fail: All appear at once or fail partway through
  
- [ ] **Test 4.17:** Watch chat for AI planning feedback
  - ✅ Pass: AI shows "Creating username field... Creating password field..." etc.
  - ❌ Fail: No feedback on multi-step process

#### Ambiguity Handling - Test These:
- [ ] **Test 4.18:** "Make it bigger" (without selecting object)
  - ✅ Pass: AI asks for clarification or makes reasonable assumption
  - ❌ Fail: Errors or does something nonsensical
  
- [ ] **Test 4.19:** "Create a button" (no position specified)
  - ✅ Pass: AI places button at reasonable default position
  - ❌ Fail: Errors or places randomly

**Scoring Guide:**
- 7-8 points: Login form creates 3+ properly arranged elements, handles ambiguity well
- 5-6 points: Complex commands work but simpler, 2-3 elements arranged
- 3-4 points: Elements created but poorly arranged

---

### AI Performance & Reliability (7 points - Target: Excellent)

#### Response Time Tests - Test These:
- [ ] **Test 4.20:** Simple command ("Create a blue circle") → time response
  - ✅ Excellent (<2s): Response appears in under 2 seconds
  - ✅ Good (2-3s): Response within 2-3 seconds
  - ❌ Satisfactory (3-5s): Response takes 3-5 seconds
  - ❌ Poor (>5s): Takes over 5 seconds
  
- [ ] **Test 4.21:** Complex command ("Create login form") → time response
  - ✅ Excellent (<5s): Complete within 5 seconds
  - ✅ Good (5-8s): Complete within 5-8 seconds
  - ❌ Satisfactory (8-10s): Takes 8-10 seconds
  - ❌ Poor (>10s): Takes over 10 seconds

#### Metrics Logging (NEW):
- [ ] **Test 4.M1:** Record measured cursor/object latencies and AI response times
  - ✅ Pass: Paste measured numbers into `memory-bank/progress.md` or `docs/PERFORMANCE.md`
  - ❌ Fail: No recorded metrics

#### Accuracy Tests - Test These:
- [ ] **Test 4.22:** Run 10 simple commands, count successes
  - ✅ Excellent: 9-10 work correctly (90%+)
  - ✅ Good: 8 work correctly (80%+)
  - ❌ Satisfactory: 6-7 work correctly (60%+)
  - ❌ Poor: <6 work correctly
  
- [ ] **Test 4.23:** Run 5 complex commands, count successes
  - ✅ Excellent: 4-5 create reasonable layouts
  - ✅ Good: 3-4 create acceptable layouts
  - ❌ Satisfactory: 2-3 create basic layouts
  - ❌ Poor: <2 work

#### UX & Feedback - Test These:
- [ ] **Test 4.24:** Chat shows "thinking" indicator while processing
  - ✅ Pass: Clear visual feedback
  - ❌ Fail: No feedback, feels broken
  
- [ ] **Test 4.25:** Chat shows success/error messages
  - ✅ Pass: Clear feedback on command result
  - ❌ Fail: Silent execution
  
- [ ] **Test 4.26:** Failed commands show helpful error messages
  - ✅ Pass: Explains what went wrong
  - ❌ Fail: Generic error or no message

#### Shared State Tests - Test These:
- [ ] **Test 4.27:** Browser A uses AI to create shape → Browser B sees it immediately
  - ✅ Pass: Appears on all screens in <100ms
  - ❌ Fail: Doesn't sync or delayed
  
- [ ] **Test 4.28:** Browser A and Browser B both use AI simultaneously
  - ✅ Pass: Both commands execute, no conflicts
  - ❌ Fail: One fails or objects conflict

**Scoring Guide:**
- 6-7 points: Sub-2s responses, 90%+ accuracy, natural UX, shared state flawless
- 4-5 points: 2-3s responses, 80%+ accuracy, good UX, shared state mostly works
- 2-3 points: 3-5s responses, 60%+ accuracy, basic UX, shared state has issues

---

## Section 5: Technical Implementation (10 points)

### Architecture Quality (5 points - Target: Excellent)

#### Code Organization - Check These:
- [ ] **Test 5.1:** Open codebase, check file structure
  - ✅ Pass: Clear folders (components, services, hooks), logical organization
  - ❌ Fail: Messy, files in wrong places, hard to navigate
  
- [ ] **Test 5.2:** Check component files
  - ✅ Pass: Single responsibility, clear purpose, not too large
  - ❌ Fail: Giant files, unclear purpose, mixed concerns
  
- [ ] **Test 5.3:** Check services layer
  - ✅ Pass: Clean separation (auth, canvas, AI), modular
  - ❌ Fail: Mixed concerns, hard to follow

#### Error Handling - Test These:
- [ ] **Test 5.4:** Disconnect internet mid-operation
  - ✅ Pass: Graceful handling, clear error message, recovers on reconnect
  - ❌ Fail: Crashes, no error message, or breaks
  
- [ ] **Test 5.5:** Try invalid AI command
  - ✅ Pass: Shows helpful error, doesn't crash
  - ❌ Fail: Crashes or silent failure
  
- [ ] **Test 5.6:** Try to move object that doesn't exist
  - ✅ Pass: Handles gracefully
  - ❌ Fail: Console errors or crashes

#### Modularity - Check These:
- [ ] **Test 5.7:** Check if AI tools are in registry pattern
  - ✅ Pass: Can add new tools without changing other code
  - ❌ Fail: Adding tools requires changing multiple files
  
- [ ] **Test 5.8:** Check if canvas operations are reusable
  - ✅ Pass: Functions can be called from UI or AI
  - ❌ Fail: Duplicate code for UI vs AI operations

**Scoring Guide:**
- 5 points: Clean organization, proper error handling, scalable architecture, modular
- 4 points: Solid structure, minor issues, generally maintainable
- 3 points: Functional but messy, some architectural concerns

---

### Authentication & Security (5 points - Target: Excellent)

#### Auth Functionality - Test These:
- [ ] **Test 5.9:** Sign up with new account
  - ✅ Pass: Creates account, logs in automatically
  - ❌ Fail: Broken or errors
  
- [ ] **Test 5.10:** Log out and log back in
  - ✅ Pass: Login works, returns to canvas
  - ❌ Fail: Broken login
  
- [ ] **Test 5.11:** Refresh page while logged in
  - ✅ Pass: Stays logged in
  - ❌ Fail: Logs out on refresh
  
- [ ] **Test 5.12:** Try to access canvas without logging in
  - ✅ Pass: Redirects to login
  - ❌ Fail: Can access canvas without auth

#### Security - Check These:
- [ ] **Test 5.13:** Check .gitignore includes .env.local
  - ✅ Pass: API keys not in git
  - ❌ Fail: Keys exposed in repository
  
- [ ] **Test 5.14:** Check Firebase security rules
  - ✅ Pass: Rules require authentication
  - ❌ Fail: No rules or allow public access
  
- [ ] **Test 5.15:** Try to edit canvas without authentication (if possible)
  - ✅ Pass: Blocked by Firestore rules
  - ❌ Fail: Can edit without auth
  
- [ ] **Test 5.16:** Check for exposed credentials in code
  - ✅ Pass: All secrets in .env.local
  - ❌ Fail: API keys hardcoded

**Scoring Guide:**
- 5 points: Robust auth, proper session handling, protected routes, no exposed credentials
- 4 points: Functional auth, minor security considerations, generally secure
- 3 points: Basic auth works, some security gaps

---

## Section 6: Documentation & Submission Quality (5 points)

### Repository & Setup (3 points - Target: Excellent)

#### README Check - Review These:
- [ ] **Test 6.1:** README has project title and description
  - ✅ Pass: Clear overview of what the app does
  - ❌ Fail: Missing or unclear
  
- [ ] **Test 6.2:** README has setup instructions
  - ✅ Pass: Step-by-step: clone, install, configure Firebase, run
  - ❌ Fail: Missing or incomplete
  
- [ ] **Test 6.3:** README lists all dependencies
  - ✅ Pass: Clear list of required packages
  - ❌ Fail: Missing or unclear
  
- [ ] **Test 6.4:** README has architecture overview
  - ✅ Pass: Explains structure (frontend, backend, AI integration)
  - ❌ Fail: No architecture explanation
  
- [ ] **Test 6.5:** README has deployed URL
  - ✅ Pass: Working link to live app
  - ❌ Fail: Missing or broken link

#### Setup Test - Actually Try This:
- [ ] **Test 6.6:** Clone repo in fresh directory, follow README setup
  - ✅ Pass: App runs locally by following README
  - ❌ Fail: Missing steps or doesn't work

**Scoring Guide:**
- 3 points: Clear README, detailed setup, architecture docs, easy to run locally
- 2 points: Adequate documentation, setup mostly clear, can run with effort
- 1 point: Minimal documentation, setup unclear

---

### Deployment (2 points - Target: Excellent)

#### Deployment Tests - Test These:
- [ ] **Test 6.7:** Open deployed URL in fresh browser (no cache)
  - ✅ Pass: Loads quickly (<3 seconds)
  - ❌ Fail: Slow load or doesn't load
  
- [ ] **Test 6.8:** Test with 5 users on deployed app
  - ✅ Pass: Stable, no crashes, maintains performance
  - ❌ Fail: Crashes or major issues
  
- [ ] **Test 6.9:** Leave deployed app open for 10 minutes, interact periodically
  - ✅ Pass: Remains stable, no errors
  - ❌ Fail: Disconnects or crashes
  
- [ ] **Test 6.10:** Check browser console on deployed app
  - ✅ Pass: No errors in console
  - ❌ Fail: Errors or warnings

**Scoring Guide:**
- 2 points: Stable deployment, publicly accessible, supports 5+ users, fast load
- 1 point: Deployed, minor stability issues, generally accessible
- 0 points: Broken deployment, not accessible

---

## Bonus Points (Maximum +5)

### Innovation (+2 points)

#### Novel Features Check:
- [ ] **Bonus 1:** Implemented features beyond requirements?
  - Examples: AI design suggestions, smart component detection, generative design
  - ✅ Pass: At least 1 truly novel feature
  - ❌ Fail: Only standard features

**Test Novel Features:**
- [ ] Feature works correctly
- [ ] Feature adds real value
- [ ] Feature is production-quality

---

### Polish (+2 points)

#### UX/UI Quality Check:
- [ ] **Bonus 2:** Exceptional UX/UI design?
  - Professional design system
  - Smooth animations
  - Delightful interactions
  - Intuitive interface
  - ✅ Pass: All 4 criteria met at high quality
  - ❌ Fail: Standard UI quality

**Test UI Polish:**
- [ ] Animations are smooth (fade in/out, transitions)
- [ ] Color scheme is consistent and professional
- [ ] Icons are clear and consistent
- [ ] Layout is intuitive
- [ ] Interactions feel responsive and polished
- [ ] No visual bugs or glitches

---

### Scale (+1 point)

#### Performance Beyond Targets:
- [ ] **Bonus 3:** Demonstrated performance beyond rubric targets?
  - 1000+ objects at 60 FPS (vs 500 required)
  - 10+ concurrent users (vs 5 required)
  - ✅ Pass: Either target exceeded
  - ❌ Fail: Meets but doesn't exceed targets

**Test Scale:**
- [ ] Create 1000+ objects, check FPS meter
- [ ] Get 10+ users collaborating simultaneously

---

## Section 7: AI Development Log (Pass/Fail)

### Requirements Check:
Need ANY 3 out of 5 sections with meaningful reflection:

- [ ] **Log 7.1:** Tools & Workflow - What AI tools used and how integrated
  - ✅ Pass: Describes specific tools (Cursor, Claude, etc.) and workflow
  - ❌ Fail: Missing or superficial
  
- [ ] **Log 7.2:** 3-5 effective prompting strategies
  - ✅ Pass: Lists specific prompts that worked well
  - ❌ Fail: Missing or generic
  
- [ ] **Log 7.3:** Code analysis - % AI-generated vs hand-written
  - ✅ Pass: Rough estimate provided with reasoning
  - ❌ Fail: Missing or no analysis
  
- [ ] **Log 7.4:** Strengths & limitations - Where AI excelled and struggled
  - ✅ Pass: Specific examples of both strengths and weaknesses
  - ❌ Fail: Missing or too vague
  
- [ ] **Log 7.5:** Key learnings - Insights about working with AI agents
  - ✅ Pass: Meaningful reflection on process
  - ❌ Fail: Missing or superficial

**Result:**
- ✅ PASS: 3+ sections complete with meaningful content
- ❌ FAIL: <3 sections or superficial content (-10 point penalty)

---

## Section 8: Demo Video (Pass/Fail)

### Video Requirements Check:

#### Real-Time Collaboration Demo (Required):
- [ ] **Video 8.1:** Show 2+ browser windows side by side
  - ✅ Pass: Both screens visible simultaneously
  - ❌ Fail: Only one screen shown
  
- [ ] **Video 8.2:** Demonstrate object creation syncing
  - ✅ Pass: Create shape in Browser A, visible in Browser B
  - ❌ Fail: Not demonstrated
  
- [ ] **Video 8.3:** Demonstrate cursor sync
  - ✅ Pass: Show both cursors moving in real-time
  - ❌ Fail: Not demonstrated
  
- [ ] **Video 8.4:** Demonstrate simultaneous editing
  - ✅ Pass: Both users edit at same time
  - ❌ Fail: Not demonstrated

#### AI Commands Demo (Required):
- [ ] **Video 8.5:** Show 6+ different AI command types
  - ✅ Pass: Clearly demonstrate 6+ distinct commands
  - ❌ Fail: <6 commands shown
  
- [ ] **Video 8.6:** Include creation commands
  - ✅ Pass: At least 2 creation commands shown
  - ❌ Fail: <2 creation commands
  
- [ ] **Video 8.7:** Include manipulation commands
  - ✅ Pass: At least 2 manipulation commands shown
  - ❌ Fail: <2 manipulation commands
  
- [ ] **Video 8.8:** Include layout command
  - ✅ Pass: At least 1 layout command shown
  - ❌ Fail: No layout command
  
- [ ] **Video 8.9:** Include complex command (login form)
  - ✅ Pass: Show login form or similar complex operation
  - ❌ Fail: No complex command

#### Advanced Features Demo (Required):
- [ ] **Video 8.10:** Walkthrough of 3+ advanced features
  - ✅ Pass: Show keyboard shortcuts, grouping, etc.
  - ❌ Fail: <3 features shown
  
- [ ] **Video 8.11:** Demonstrate performance (500 objects)
  - ✅ Pass: Show canvas with 500+ objects performing well
  - ❌ Fail: Not demonstrated

- [ ] **Video 8.12 (NEW):** Demonstrate z-index operations via UI/shortcuts
  - ✅ Pass: Bring forward/backward shown and synced
  - ❌ Fail: Not demonstrated

#### Architecture Explanation (Required):
- [ ] **Video 8.12:** Explain tech stack (React, Firebase, OpenAI)
  - ✅ Pass: Clear explanation of major components
  - ❌ Fail: No architecture explanation
  
- [ ] **Video 8.13:** Explain real-time sync approach
  - ✅ Pass: Describe how Firestore handles collaboration
  - ❌ Fail: Not explained
  
- [ ] **Video 8.14:** Explain AI integration
  - ✅ Pass: Describe how AI calls canvas functions
  - ❌ Fail: Not explained

#### Production Quality (Required):
- [ ] **Video 8.15:** Clear audio throughout
  - ✅ Pass: Can hear and understand narration
  - ❌ Fail: Audio unclear or missing
  
- [ ] **Video 8.16:** Clear video quality
  - ✅ Pass: Screen is readable, no artifacts
  - ❌ Fail: Blurry or low quality
  
- [ ] **Video 8.17:** 3-5 minute length
  - ✅ Pass: Within time limit
  - ❌ Fail: Too short (<3 min) or too long (>5 min)
  
- [ ] **Video 8.18:** Organized and easy to follow
  - ✅ Pass: Logical flow, clear demonstrations
  - ❌ Fail: Confusing or disorganized

**Result:**
- ✅ PASS: All requirements met, good quality
- ❌ FAIL: Missing requirements or poor quality (-10 point penalty)

---

## Pre-Submission Final Checklist

### Critical Path Verification:

#### Section 1 (30 points):
- [ ] Object sync <100ms ✓
- [ ] Cursor sync <50ms ✓
- [ ] Conflict resolution works ✓
- [ ] Persistence works ✓
- [ ] Connection status shown ✓

#### Section 2 (20 points):
- [ ] All shape types work ✓
- [ ] Multi-select works ✓
- [ ] 500 objects at 60 FPS ✓
- [ ] 5+ concurrent users ✓

#### Section 3 (15 points):
- [ ] Count Tier 1 features: _____ (need 2-3)
- [ ] Count Tier 2 features: _____ (need 1-2)
- [ ] All features tested ✓

#### Section 4 (25 points):
- [ ] 6+ AI command types ✓
- [ ] Complex command works ✓
- [ ] Response time <2s ✓
- [ ] Accuracy >90% ✓
- [ ] Shared state works ✓

#### Section 5 (10 points):
- [ ] Code is organized ✓
- [ ] Error handling works ✓
- [ ] Auth is secure ✓

#### Section 6 (5 points):
- [ ] README complete ✓
- [ ] Deployed and stable ✓

#### Section 7 & 8:
- [ ] AI Development Log written ✓
- [ ] Demo video recorded ✓

#### Bonus Points:
- [ ] Novel features: _____ (+0 to +2)
- [ ] Polish level: _____ (+0 to +2)
- [ ] Scale exceeded: _____ (+0 to +1)

---

## Score Estimation Worksheet

### Calculate Your Score:

**Section 1: Core Collaborative Infrastructure**
- Real-Time Sync: _____ / 12
- Conflict Resolution: _____ / 9
- Persistence: _____ / 9
- **Section 1 Total: _____ / 30**

**Section 2: Canvas Features & Performance**
- Canvas Functionality: _____ / 8
- Performance: _____ / 12
- **Section 2 Total: _____ / 20**

**Section 3: Advanced Features**
- Tier 1 features × 2: _____ / 6
- Tier 2 features × 3: _____ / 6
- Tier 3 features × 3: _____ / 3
- **Section 3 Total: _____ / 15** (max 15)

**Section 4: AI Canvas Agent**
- Command Breadth: _____ / 10
- Complex Execution: _____ / 8
- Performance: _____ / 7
- **Section 4 Total: _____ / 25**

**Section 5: Technical Implementation**
- Architecture: _____ / 5
- Auth & Security: _____ / 5
- **Section 5 Total: _____ / 10**

**Section 6: Documentation**
- Repository: _____ / 3
- Deployment: _____ / 2
- **Section 6 Total: _____ / 5**

**Section 7: AI Dev Log**
- Status: _____ (PASS/FAIL)

**Section 8: Demo Video**
- Status: _____ (PASS/FAIL)

**Bonus Points**
- Innovation: _____ / 2
- Polish: _____ / 2
- Scale: _____ / 1
- **Bonus Total: _____ / 5**

---

### **FINAL SCORE: _____ / 100 (+bonus)**

**Grade:**
- 90-100+: A (Exceptional)
- 80-89: B (Strong)
- 70-79: C (Functional)
- 60-69: D (Basic)
- <60: F (Insufficient)

---

## Testing Schedule Recommendation

### Day 1 (After implementing features):
- [ ] Run all Section 1 tests (Real-time sync)
- [ ] Run all Section 2 tests (Canvas & performance)
- [ ] Fix any critical bugs found

### Day 2 (After implementing more features):
- [ ] Run all Section 3 tests (Advanced features)
- [ ] Run all Section 4 tests (AI commands)
- [ ] Fix any bugs found

### Day 3 (Before demo video):
- [ ] Run all Section 5 tests (Architecture & auth)
- [ ] Run all Section 6 tests (Documentation)
- [ ] Run final smoke test (all critical paths)
- [ ] Calculate estimated score
- [ ] Fix highest-impact bugs

### Day 4 (Submission day):
- [ ] Record demo video using this checklist
- [ ] Write AI Development Log
- [ ] Final smoke test on deployed app
- [ ] Submit

---

## Critical Bug Triage

If you find bugs during testing, prioritize fixes using this hierarchy:

### Priority 1 (Fix Immediately):
- App crashes or becomes unusable
- Authentication completely broken
- Real-time sync not working at all
- AI commands all failing
- Deployment not accessible

### Priority 2 (Fix Before Demo):
- Performance below 60 FPS with 500 objects
- Major features not working (multi-select, keyboard shortcuts)
- AI accuracy below 80%
- Sync delays over 150ms

### Priority 3 (Fix If Time):
- Minor UI bugs
- Edge case failures
- Polish issues
- Non-critical features broken

### Priority 4 (Document, Don't Fix):
- Known limitations
- Stretch features that didn't make it
- Minor visual glitches
- Edge cases that rarely occur

---

## Final Pre-Submission Checks

### 30 Minutes Before Submission:

- [ ] **Check 1:** Open deployed URL in incognito → works
- [ ] **Check 2:** Create 5 objects → all sync
- [ ] **Check 3:** Run 3 AI commands → all work
- [ ] **Check 4:** Check console → no errors
- [ ] **Check 5:** README has deployed URL
- [ ] **Check 6:** Video uploaded and accessible
- [ ] **Check 7:** AI Dev Log submitted
- [ ] **Check 8:** All files committed and pushed
- [ ] **Check 9:** Deployed app stable for 5 minutes
- [ ] **Check 10:** One final score calculation

### If All Checks Pass:
✅ **YOU'RE READY TO SUBMIT!**

---

## Good Luck! 🚀

Remember:
- Test systematically, don't skip sections
- Fix high-priority bugs first
- Document what you test
- The demo video is your chance to show off - make it count!
- 95+ points is totally achievable with thorough testing

**You've got this!**