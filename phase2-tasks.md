# CollabCanvas Phase 2 - Task List & PR Breakdown

## Updated Project File Structure

```
collab-canvas/
├── src/
│   ├── components/
│   │   ├── Auth/
│   │   │   ├── Login.jsx
│   │   │   ├── SignUp.jsx
│   │   │   └── AuthForm.jsx
│   │   ├── Canvas/
│   │   │   ├── Canvas.jsx
│   │   │   ├── CanvasControls.jsx
│   │   │   ├── Rectangle.jsx
│   │   │   ├── Circle.jsx
│   │   │   └── TextBox.jsx
│   │   ├── Multiplayer/
│   │   │   ├── Cursor.jsx
│   │   │   ├── CursorLayer.jsx
│   │   │   └── PresenceList.jsx
│   │   ├── AI/                          # NEW
│   │   │   ├── ChatPanel.jsx
│   │   │   ├── ChatMessage.jsx
│   │   │   ├── ChatInput.jsx
│   │   │   └── ThinkingIndicator.jsx
│   │   └── Layout/
│   │       ├── Header.jsx
│   │       └── MainLayout.jsx
│   ├── hooks/
│   │   ├── useAuth.js
│   │   ├── useCanvas.js
│   │   ├── usePresence.js
│   │   ├── useCursor.js
│   │   ├── useAI.js                      # NEW
│   │   └── useChat.js                    # NEW
│   ├── services/
│   │   ├── firebase.js
│   │   ├── auth.js
│   │   ├── canvas.js
│   │   ├── presence.js
│   │   └── ai/                           # NEW
│   │       ├── client.js                 # LLM client (OpenAI or Claude)
│   │       ├── tools.js                  # Tool schema definitions
│   │       ├── executor.js               # Execute function calls
│   │       └── planner.js                # Multi-step planning
│   ├── utils/
│   │   ├── constants.js
│   │   └── helpers.js
│   ├── App.jsx
│   ├── index.js
│   └── index.css
├── .env.local                            # Add AI API keys
├── package.json
└── README.md
```

---

## PR #12: AI Service Layer Foundation
**Goal:** Set up OpenAI integration and tool schema

### Tasks:
- [ ] Install OpenAI SDK (`npm install openai`)
- [ ] Add OpenAI API key to `.env.local`
- [ ] Create OpenAI client service wrapper
- [ ] Define tool schema for all canvas functions
- [ ] Implement tool registry pattern for extensibility
- [ ] Test basic OpenAI connectivity
- [ ] Test tool schema validation

### Files Created:
- `src/services/ai/openai.js` - OpenAI client initialization and config
- `src/services/ai/tools.js` - Tool definitions for createShape, createText, moveShape, resizeShape, deleteShape, getCanvasState, selectShapes
- `src/services/ai/executor.js` - Stub for executing tool calls
- `src/services/ai/planner.js` - Stub for multi-step planning

### Files Modified:
- `.env.local` - Add `REACT_APP_OPENAI_API_KEY`
- `package.json` - Add openai dependency

### Testing:

**Unit Tests - NO FAIL:**
- [ ] `openai.js` - OpenAI client initializes with valid API key
- [ ] `tools.js` - Tool schema validates correct parameters
- [ ] `tools.js` - Tool schema rejects invalid parameters
- [ ] Tool registry returns all defined tools

**Unit Tests - FLAG FOR LATER:**
- [ ] Handles API key missing/invalid gracefully
- [ ] Tool schema descriptions are clear and helpful

### Files Created for Testing:
- `src/services/ai/__tests__/openai.test.js`
- `src/services/ai/__tests__/tools.test.js`

### Validation:
- [ ] OpenAI client connects successfully
- [ ] All 7 tool schemas defined
- [ ] Tool validation works correctly
- [ ] No console errors

---

## PR #13: AI Executor & Canvas Integration
**Goal:** Connect AI tool calls to existing canvas functions

### Tasks:
- [ ] Implement executor to map tool calls to canvas functions
- [ ] Connect executor to existing canvas API (useCanvas hook)
- [ ] Add error handling for invalid tool calls
- [ ] Implement `getCanvasState()` to return current objects
- [ ] Implement `selectShapes()` to query objects by criteria
- [ ] Test each tool function executes correctly
- [ ] Validate AI-created objects sync to all users

### Files Created:
- None (implementing stubs from PR #12)

### Files Modified:
- `src/services/ai/executor.js` - Full implementation of tool execution
- `src/hooks/useCanvas.js` - Expose functions for AI executor (if not already exposed)
- `src/services/canvas.js` - Add helper functions if needed (getCanvasState, selectShapes)

### Testing:

**Unit Tests - NO FAIL:**
- [ ] `executor.js` - createShape() calls canvas API correctly
- [ ] `executor.js` - moveShape() updates object position
- [ ] `executor.js` - resizeShape() updates object dimensions
- [ ] `executor.js` - deleteShape() removes object
- [ ] `executor.js` - rejects calls with missing parameters
- [ ] `getCanvasState()` returns accurate snapshot
- [ ] `selectShapes()` filters objects by color/type correctly

**Integration Tests - NO FAIL:**
- [ ] AI creates rectangle → appears on canvas
- [ ] AI-created object syncs to second client
- [ ] AI moves object → position updates on all clients
- [ ] AI deletes object → removed from all clients

**Integration Tests - FLAG FOR LATER:**
- [ ] Handles Firestore write failures gracefully
- [ ] Multiple rapid AI commands don't cause sync conflicts

### Files Created for Testing:
- `src/services/ai/__tests__/executor.test.js`

### Validation:
- [ ] All tool functions execute correctly
- [ ] AI-created objects appear on canvas
- [ ] Objects sync to all connected users
- [ ] Error handling works for invalid calls

---

## PR #14: Multi-Step Planning System
**Goal:** Enable AI to execute complex commands requiring multiple steps

### Tasks:
- [ ] Implement planner to detect complex operations
- [ ] Create planning prompts for LLM
- [ ] Generate step-by-step execution plans
- [ ] Execute plans sequentially using executor
- [ ] Add validation between steps
- [ ] Test simple complex command (e.g., "create 3 circles in a row")
- [ ] Test advanced complex command (e.g., "create a login form")

### Files Created:
- None (implementing stub from PR #12)

### Files Modified:
- `src/services/ai/planner.js` - Full multi-step planning implementation
- `src/services/ai/executor.js` - Add sequential execution support

### Testing:

**Unit Tests - NO FAIL:**
- [ ] Planner detects single-step vs multi-step commands
- [ ] Planner generates valid execution plan (array of tool calls)
- [ ] Sequential execution runs steps in order
- [ ] Stops execution if step fails

**Integration Tests - NO FAIL:**
- [ ] "Create 3 circles in a row" → 3 circles appear aligned
- [ ] "Create a login form" → username, password, button appear
- [ ] Multi-step execution completes within 5 seconds
- [ ] All steps sync to other users in real-time

**Integration Tests - FLAG FOR LATER:**
- [ ] Complex commands create visually reasonable layouts
- [ ] AI can recover from mid-sequence failures
- [ ] Planning doesn't timeout on very complex requests

### Files Created for Testing:
- `src/services/ai/__tests__/planner.test.js`

### Validation:
- [ ] Simple multi-step commands work (3 shapes in a row)
- [ ] Complex commands work (login form with 3+ elements)
- [ ] Steps execute sequentially without errors
- [ ] All steps sync to collaborators

---

## PR #15: Chat UI Components
**Goal:** Build user interface for AI interaction

### Tasks:
- [x] Create ChatPanel component (container)
- [x] Create ChatInput component (text field + submit)
- [x] Create ChatMessage component (displays user/AI messages)
- [ ] Create ThinkingIndicator component (loading state)
- [x] Add chat history state management
- [ ] Add toggle to show/hide chat panel
- [x] Style chat UI (minimal but functional)
- [x] Add keyboard shortcuts (Enter to send, Escape to close)

### Files Created:
- `src/components/AI/ChatPanel.jsx` - Main chat container
- `src/components/AI/ChatInput.jsx` - Input field with submit button
- `src/components/AI/ChatMessage.jsx` - Individual message bubble
- `src/components/AI/ThinkingIndicator.jsx` - Loading/processing indicator
- `src/hooks/useChat.js` - Chat state management hook

### Files Modified:
- `src/App.jsx` - Add ChatPanel component
- `src/index.css` - Add chat UI styles

### Testing:
**No Tests Required** - UI component, visual validation sufficient

### Validation:
- [x] Chat panel renders without errors
- [x] Can type messages in input field
- [x] Messages display in chat history
- [ ] Toggle show/hide works
- [ ] Thinking indicator appears during loading
- [x] UI doesn't block canvas interaction

---

## PR #16: Connect Chat to AI Backend
**Goal:** Wire up chat UI to LLM and executor

### Tasks:
- [ ] Create useAI hook to manage AI requests
- [ ] Send user messages to LLM with tool schema
- [ ] Parse LLM response for function calls
- [ ] Execute function calls via executor
- [ ] Display AI responses in chat
- [ ] Handle errors and display in chat
- [ ] Add retry logic for failed requests
- [ ] Test end-to-end: user types → AI executes → canvas updates

### Files Created:
- `src/hooks/useAI.js` - AI command execution hook

### Files Modified:
- `src/components/AI/ChatPanel.jsx` - Connect to useAI hook
- `src/components/AI/ChatInput.jsx` - Call AI on message send
- `src/services/ai/openai.js` - Add function to send message with tools

### Testing:

**Integration Tests - NO FAIL:**
- [ ] User sends "create a blue circle" → circle appears on canvas
- [ ] AI response appears in chat after execution
- [ ] Error message displays if AI command fails
- [ ] Multiple commands execute sequentially without breaking

**Integration Tests - FLAG FOR LATER:**
- [ ] Response time <2s for simple commands
- [ ] Handles ambiguous commands reasonably
- [ ] Chat history persists during session
- [ ] Concurrent AI usage from 2 users doesn't conflict

### Files Created for Testing:
- `src/hooks/__tests__/useAI.test.js`
- `src/__tests__/integration/ai-chat.test.js`

### Validation:
- [ ] End-to-end flow works: type command → AI creates object → syncs to users
- [ ] Error handling displays helpful messages
- [ ] Chat feels responsive (<2s for simple commands)
- [ ] No console errors during AI execution

---

## PR #17: Command Coverage & Testing
**Goal:** Ensure all 6+ command types work reliably

### Tasks:
- [ ] Test all creation commands (rectangle, circle, text)
- [ ] Test all manipulation commands (move, resize, delete)
- [ ] Test all layout commands (arrange in row, grid, spacing)
- [ ] Test complex command (login form)
- [ ] Document supported commands in README
- [ ] Add example commands to chat UI (optional placeholder text)
- [ ] Fix any command execution bugs
- [ ] Optimize response times

### Files Created:
- `docs/AI_COMMANDS.md` - Documentation of all supported commands (optional)

### Files Modified:
- `src/services/ai/tools.js` - Refine tool descriptions for better LLM understanding
- `src/services/ai/planner.js` - Improve multi-step logic based on testing
- `README.md` - Add section on AI commands

### Testing:

**Integration Tests - NO FAIL:**
- [ ] Each of the 6+ command types executes successfully
- [ ] Commands produce expected results on canvas
- [ ] All commands sync to multiple users
- [ ] Login form creates at least 3 objects in reasonable layout

**Integration Tests - FLAG FOR LATER:**
- [ ] 90%+ accuracy on simple commands
- [ ] Complex commands create visually acceptable layouts
- [ ] AI handles variations of commands (different phrasing)
- [ ] Performance meets <2s target for simple, <5s for complex

### Files Created for Testing:
- `src/__tests__/integration/ai-commands.test.js`

### Validation:
- [ ] 6+ distinct command types working
- [ ] At least 1 complex multi-step command works
- [ ] Commands are reliable and consistent
- [ ] Documentation exists for supported commands

---

## PR #18: TODO Item - Cursor Mirror Offset Fix
**Goal:** Make cursor positions pixel-perfect across pan/zoom

### Tasks:
- [ ] Debug cursor offset calculation
- [ ] Account for zoom level in cursor transform
- [ ] Account for pan offset in cursor position
- [ ] Test cursor accuracy at various zoom levels
- [ ] Test cursor accuracy after panning
- [ ] Verify fix doesn't break cursor performance

### Files Modified:
- `src/components/Multiplayer/Cursor.jsx` - Fix transform calculation
- `src/hooks/useCursor.js` - Adjust position calculation if needed

### Testing:

**Unit Tests - NO FAIL:**
- [ ] Cursor transform accounts for zoom level
- [ ] Cursor transform accounts for pan offset
- [ ] Position calculation is accurate at zoom = 0.5, 1.0, 2.0

**Integration Tests - NO FAIL:**
- [ ] Cursor positions match exactly on two clients (no zoom/pan)
- [ ] Cursor positions stay accurate after zooming
- [ ] Cursor positions stay accurate after panning
- [ ] Cursor positions accurate with both zoom AND pan

### Files Created for Testing:
- `src/components/Multiplayer/__tests__/Cursor.test.js`

### Validation:
- [ ] Open 2 browsers, hover same spot → cursors overlap exactly
- [ ] Zoom in/out → cursors still overlap exactly
- [ ] Pan canvas → cursors still overlap exactly
- [ ] No performance degradation

---

## PR #19: TODO Item - Mid-Drag Jitter Smoothing
**Goal:** Improve real-time drag smoothness with better throttling/tweening

### Tasks:
- [ ] Profile current drag performance
- [ ] Tune throttle timing for position updates
- [ ] Implement tween/interpolation for smoother motion
- [ ] Add update queue to prevent dropped frames
- [ ] Test with rapid mouse movement
- [ ] Test with network throttling (simulate slow connection)
- [ ] Ensure fix doesn't increase latency

### Files Modified:
- `src/hooks/useCanvas.js` - Adjust drag update throttling
- `src/components/Canvas/Rectangle.jsx` - Add tween logic if needed
- `src/components/Canvas/Circle.jsx` - Add tween logic if needed
- `src/components/Canvas/TextBox.jsx` - Add tween logic if needed
- `src/utils/helpers.js` - Add tween/interpolation utility functions

### Testing:

**Unit Tests - NO FAIL:**
- [ ] Throttle limits updates to reasonable rate (16ms intervals)
- [ ] Update queue doesn't drop position updates
- [ ] Tween interpolation smooths between positions

**Integration Tests - FLAG FOR LATER:**
- [ ] Visual smoothness improved during drag
- [ ] No visible jitter on remote client during drag
- [ ] Latency stays <100ms despite smoothing
- [ ] Works well on throttled network (3G simulation)

### Files Created for Testing:
- `src/hooks/__tests__/useCanvas.drag.test.js`

### Validation:
- [ ] Drag object rapidly → smooth motion on both clients
- [ ] No visible jitter or stuttering
- [ ] Latency acceptable (<100ms)
- [ ] Works on slow network connections

---

## PR #20: TODO Item - In-Place Text Editing
**Goal:** Enable editing text objects without recreating them

### Tasks:
- [x] Click-to-edit when selected (updated from double-click per spec)
- [x] Create inline text editor component/mode
- [x] Suppress canvas hotkeys while editing
- [x] Update text content on blur/Enter
- [x] Sync text changes to all users
- [x] Style editor to closely match text appearance
- [ ] Test with various text lengths
- [ ] Handle edge cases (empty text, special characters)

### Files Created:
- `src/components/Canvas/TextEditor.jsx` - Inline text editing component (optional)

### Files Modified:
- `src/components/Canvas/TextBox.jsx` - Add double-click handler and editing mode
- `src/hooks/useCanvas.js` - Add updateTextContent function
- `src/services/canvas.js` - Add text update to Firestore

### Testing:

**Unit Tests - NO FAIL:**
- [ ] Double-click activates edit mode
- [ ] Text updates sync to Firestore
- [ ] Canvas hotkeys suppressed during editing
- [ ] Edit mode exits on blur or Enter key

**Integration Tests - NO FAIL:**
- [ ] User A edits text → User B sees update
- [ ] Editing doesn't interfere with other canvas operations
- [ ] Can edit multiple text objects sequentially

**Integration Tests - FLAG FOR LATER:**
- [ ] Handles very long text gracefully
- [ ] Handles special characters (emojis, unicode)
- [ ] Edit mode styling matches text appearance

### Files Created for Testing:
- `src/components/Canvas/__tests__/TextBox.edit.test.js`

### Validation:
- [x] Click text (while selected) activates editing
- [x] Can type and edit text inline
- [x] Changes sync to all users
- [x] Hotkeys don't interfere while editing
- [x] Works smoothly without glitches

---

## PR #21: Stretch TODO - Rotation Handles (If Time)
**Goal:** Add rotation capability to selected objects

### Tasks:
- [ ] Add rotation handle to selection transformer
- [ ] Implement rotation calculation from mouse drag
- [ ] Update object rotation property
- [ ] Sync rotation to Firestore
- [ ] Test rotation for rectangles, circles, text
- [ ] Ensure rotation works with other transforms (move, resize)

### Files Modified:
- `src/components/Canvas/Canvas.jsx` - Add rotation handle to transformer
- `src/components/Canvas/Rectangle.jsx` - Support rotation property
- `src/components/Canvas/Circle.jsx` - Support rotation property
- `src/components/Canvas/TextBox.jsx` - Support rotation property
- `src/hooks/useCanvas.js` - Add rotation update function
- `src/services/canvas.js` - Persist rotation to Firestore

### Testing:
**No Tests Required** - Stretch feature, manual validation sufficient

### Validation:
- [ ] Rotation handle appears on selected objects
- [ ] Objects rotate smoothly
- [ ] Rotation syncs to all users
- [ ] Works with all shape types

---

## PR #22: Stretch TODO - Recolor Selected Shape (If Time)
**Goal:** Apply color to selected objects easily

### Tasks:
- [ ] Add active color state to canvas
- [ ] Add color picker/palette UI
- [ ] Apply color to selected object(s)
- [ ] Sync color changes to Firestore
- [ ] Cache last 8 used colors (optional)
- [ ] Test with single and multiple selections

### Files Created:
- `src/components/Canvas/ColorPicker.jsx` - Color selection UI

### Files Modified:
- `src/components/Canvas/Canvas.jsx` - Add color picker UI and apply logic
- `src/hooks/useCanvas.js` - Add recolor function
- `src/services/canvas.js` - Update color in Firestore

### Testing:
**No Tests Required** - Stretch feature, manual validation sufficient

### Validation:
- [x] Color picker appears and works
- [x] Selecting color changes selected object
- [x] Color changes sync to all users
- [ ] Works with multiple selected objects

---

## PR #23: Final Integration Testing & Bug Fixes
**Goal:** Comprehensive testing with AI + multiplayer + all features

### Tasks:
- [ ] Test all AI commands with multiple users
- [ ] Test AI + manual operations simultaneously
- [ ] Test all TODO items work together
- [ ] Load test with 5+ users + AI commands
- [ ] Test on deployed URL (not just localhost)
- [ ] Fix any race conditions or sync bugs
- [ ] Optimize performance if needed
- [ ] Clean up console warnings/errors

### Files Modified:
- Any files with bugs discovered during testing

### Testing:

**Integration Tests - NO FAIL:**
- [ ] 5+ users use AI simultaneously without conflicts
- [ ] AI commands work while users manually edit
- [ ] All Phase 1 features still work correctly
- [ ] No regressions in sync performance (<100ms objects, <50ms cursors)
- [ ] All TODO items functional and stable

**Integration Tests - FLAG FOR LATER:**
- [ ] Performance stable with 10+ users
- [ ] Complex AI commands complete in <5s
- [ ] UI remains responsive during heavy AI usage
- [ ] No memory leaks after extended usage

### Files Created for Testing:
- `src/__tests__/integration/phase2-complete.test.js`

### Validation:
- [ ] All Phase 2 requirements met
- [ ] 6+ AI command types working
- [ ] At least 1 complex command working (login form)
- [ ] Top 3 TODO items complete
- [ ] No critical bugs
- [ ] Ready for early submission

---

## Time Estimates

| PR # | Description | Estimated Time |
|------|-------------|----------------|
| 12 | AI Service Layer Foundation | 2-3 hours |
| 13 | AI Executor & Canvas Integration | 3-4 hours |
| 14 | Multi-Step Planning System | 3-4 hours |
| 15 | Chat UI Components | 2-3 hours |
| 16 | Connect Chat to AI Backend | 2-3 hours |
| 17 | Command Coverage & Testing | 2-3 hours |
| 18 | Cursor Mirror Offset Fix | 1-2 hours |
| 19 | Mid-Drag Jitter Smoothing | 2-3 hours |
| 20 | In-Place Text Editing | 2-3 hours |
| 21 | Rotation Handles (Stretch) | 2-3 hours |
| 22 | Recolor Selected Shape (Stretch) | 1-2 hours |
| 23 | Final Integration Testing | 2-4 hours |
| **Total** | | **24-38 hours** |

**Core Requirements (PR 12-20):** ~20-28 hours  
**Stretch Goals (PR 21-22):** ~3-5 hours  
**Buffer for bugs/polish:** ~4-8 hours

---

## Dependencies

- **PR #13** requires PR #12 (need tool schemas before executor)
- **PR #14** requires PR #13 (planner uses executor)
- **PR #16** requires PR #12-15 (need backend + UI)
- **PR #17** requires PR #16 (need working integration before testing coverage)
- **PR #18-20** can be done in parallel with AI work
- **PR #21-22** can be done anytime if there's buffer time
- **PR #23** requires all previous PRs complete

---

## Critical Path

The must-complete PRs for Phase 2 success:
1. **PR #12-14** - AI backend (tools, executor, planner)
2. **PR #15-16** - Chat UI + integration
3. **PR #17** - Command testing and validation
4. **PR #18-20** - Top 3 TODO items
5. **PR #23** - Final testing

Stretch PRs (#21-22) only if time permits after critical path is complete.

---

## Notes

- **Modularity Focus:** The tool registry pattern in PR #12 is critical for Phase 3 extensibility
- **Test Philosophy:** 
  - "NO FAIL" tests block PR merging
  - "FLAG FOR LATER" tests document issues but don't block
  - Stretch PRs (#21-22) don't require formal testing
- **AI Provider Choice:** Using OpenAI GPT-4o-mini for speed and cost efficiency, with upgrade path to GPT-4o if quality issues arise
- **Performance Monitoring:** Watch for AI latency, target <2s for simple commands with GPT-4o-mini
- **Testing Framework:** Continue using Jest + React Testing Library from Phase 1