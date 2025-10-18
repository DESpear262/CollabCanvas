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
- [x] Install OpenAI SDK (`npm install openai`)
- [x] Add OpenAI API key to `.env.local`
- [x] Create OpenAI client service wrapper
- [x] Define tool schema for all canvas functions
- [x] Implement tool registry pattern for extensibility
- [x] Test basic OpenAI connectivity
- [x] Test tool schema validation

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
- [x] `openai.js` - OpenAI client initializes with valid API key
- [x] `tools.js` - Tool schema validates correct parameters
- [x] `tools.js` - Tool schema rejects invalid parameters
- [x] Tool registry returns all defined tools

**Unit Tests - FLAG FOR LATER:**
- [x] Handles API key missing/invalid gracefully
- [x] Tool schema descriptions are clear and helpful

### Files Created for Testing:
- `src/services/ai/__tests__/openai.test.js`
- `src/services/ai/__tests__/tools.test.js`

### Validation:
- [x] OpenAI client connects successfully
- [x] All 7 tool schemas defined
- [x] Tool validation works correctly
- [x] No console errors

---

## PR #13: AI Executor & Canvas Integration
**Goal:** Connect AI tool calls to existing canvas functions

### Tasks:
- [x] Implement executor to map tool calls to canvas functions
- [x] Connect executor to existing canvas API (useCanvas hook)
- [x] Add error handling for invalid tool calls
- [x] Implement `getCanvasState()` to return current objects
- [x] Implement `selectShapes()` to query objects by criteria
- [x] Test each tool function executes correctly
- [x] Validate AI-created objects sync to all users

### Files Created:
- None (implementing stubs from PR #12)

### Files Modified:
- `src/services/ai/executor.js` - Full implementation of tool execution
- `src/hooks/useCanvas.js` - Expose functions for AI executor (if not already exposed)
- `src/services/canvas.js` - Add helper functions if needed (getCanvasState, selectShapes)

### Testing:

**Unit Tests - NO FAIL:**
- [x] `executor.js` - createShape() calls canvas API correctly
- [x] `executor.js` - moveShape() updates object position
- [x] `executor.js` - resizeShape() updates object dimensions
- [x] `executor.js` - deleteShape() removes object
- [x] `executor.js` - rejects calls with missing parameters
- [x] `getCanvasState()` returns accurate snapshot
- [x] `selectShapes()` filters objects by color/type correctly

**Integration Tests - NO FAIL:**
- [x] AI creates rectangle → appears on canvas
- [x] AI-created object syncs to second client
- [x] AI moves object → position updates on all clients
- [x] AI deletes object → removed from all clients

**Integration Tests - FLAG FOR LATER:**
- [x] Handles Firestore write failures gracefully
- [x] Multiple rapid AI commands don't cause sync conflicts

### Files Created for Testing:
- `src/services/ai/__tests__/executor.test.js`

### Validation:
- [x] All tool functions execute correctly
- [x] AI-created objects appear on canvas
- [x] Objects sync to all connected users
- [x] Error handling works for invalid calls

---

## PR #14: Multi-Step Planning System
**Goal:** Enable AI to execute complex commands requiring multiple steps

### Tasks:
- [x] Implement planner to detect complex operations
- [x] Create planning prompts for LLM
- [x] Generate step-by-step execution plans
- [x] Execute plans sequentially using executor
- [x] Add validation between steps
- [x] Test simple complex command (e.g., "create 3 circles in a row")
- [x] Test advanced complex command (e.g., "create a login form")

### Files Created:
- None (implementing stub from PR #12)

### Files Modified:
- `src/services/ai/planner.js` - Full multi-step planning implementation
- `src/services/ai/executor.js` - Add sequential execution support

### Testing:

**Unit Tests - NO FAIL:**
- [x] Planner detects single-step vs multi-step commands
- [x] Planner generates valid execution plan (array of tool calls)
- [x] Sequential execution runs steps in order
- [x] Stops execution if step fails

**Integration Tests - NO FAIL:**
- [x] "Create 3 circles in a row" → 3 circles appear aligned
- [x] "Create a login form" → username, password, button appear
- [x] Multi-step execution completes within 5 seconds
- [x] All steps sync to other users in real-time

**Integration Tests - FLAG FOR LATER:**
- [x] Complex commands create visually reasonable layouts
- [x] AI can recover from mid-sequence failures
- [x] Planning doesn't timeout on very complex requests

### Files Created for Testing:
- `src/services/ai/__tests__/planner.test.js`

### Validation:
- [x] Simple multi-step commands work (3 shapes in a row)
- [x] Complex commands work (login form with 3+ elements)
- [x] Steps execute sequentially without errors
- [x] All steps sync to collaborators

---

## PR #15: Chat UI Components
**Goal:** Build user interface for AI interaction

### Tasks:
- [x] Create ChatPanel component (container)
- [x] Create ChatInput component (text field + submit)
- [x] Create ChatMessage component (displays user/AI messages)
- [x] Create ThinkingIndicator component (loading state)
- [x] Add chat history state management
- [x] Add toggle to show/hide chat panel
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
- [x] Toggle show/hide works
- [x] Thinking indicator appears during loading (expanded and minimized states)
- [x] UI doesn't block canvas interaction

---

## PR #16: Connect Chat to AI Backend
**Goal:** Wire up chat UI to LLM and executor

### Tasks:
- [x] Create useAI hook to manage AI requests
- [x] Send user messages to LLM with tool schema
- [x] Parse LLM response for function calls
- [x] Execute function calls via executor
- [x] Display AI responses in chat
- [x] Handle errors and display in chat
- [x] Add retry logic for failed requests
- [x] Test end-to-end: user types → AI executes → canvas updates

### Files Created:
- `src/hooks/useAI.js` - AI command execution hook

### Files Modified:
- `src/components/AI/ChatPanel.jsx` - Connect to useAI hook
- `src/components/AI/ChatInput.jsx` - Call AI on message send
- `src/services/ai/openai.js` - Add function to send message with tools

### Testing:

**Integration Tests - NO FAIL:**
- [x] User sends "create a blue circle" → circle appears on canvas
- [x] AI response appears in chat after execution
- [x] Error message displays if AI command fails
- [x] Multiple commands execute sequentially without breaking

**Integration Tests - FLAG FOR LATER:**
- [x] Response time <2s for simple commands
- [x] Handles ambiguous commands reasonably
- [x] Chat history persists during session
- [x] Concurrent AI usage from 2 users doesn't conflict

### Files Created for Testing:
- `src/hooks/__tests__/useAI.test.js`
- `src/__tests__/integration/ai-chat.test.js`

### Validation:
- [x] End-to-end flow works: type command → AI creates object → syncs to users
- [x] Error handling displays helpful messages
- [x] Chat feels responsive (<2s for simple commands)
- [x] No console errors during AI execution

---

## PR #17: Command Coverage & Testing
**Goal:** Ensure all 6+ command types work reliably

### Tasks:
- [x] Test all creation commands (rectangle, circle, text)
- [x] Test all manipulation commands (move, resize, delete)
- [x] Test all layout commands (arrange in row, grid, spacing)
- [x] Test complex command (login form)
- [x] Document supported commands in README
- [x] Add example commands to chat UI (optional placeholder text)
- [x] Fix any command execution bugs
- [x] Optimize response times

### Files Created:
- `docs/AI_COMMANDS.md` - Documentation of all supported commands (optional)

### Files Modified:
- `src/services/ai/tools.js` - Refine tool descriptions for better LLM understanding
- `src/services/ai/planner.js` - Improve multi-step logic based on testing
- `README.md` - Add section on AI commands

### Testing:

**Integration Tests - NO FAIL:**
- [x] Each of the 6+ command types executes successfully
- [x] Commands produce expected results on canvas
- [x] All commands sync to multiple users
- [x] Login form creates at least 3 objects in reasonable layout

**Integration Tests - FLAG FOR LATER:**
- [x] 90%+ accuracy on simple commands
- [x] Complex commands create visually acceptable layouts
- [x] AI handles variations of commands (different phrasing)
- [x] Performance meets <2s target for simple, <5s for complex

### Files Created for Testing:
- `src/__tests__/integration/ai-commands.test.js`

### Validation:
- [x] 6+ distinct command types working
- [x] At least 1 complex multi-step command works
- [x] Commands are reliable and consistent
- [x] Documentation exists for supported commands

---

## PR #18: TODO Item - Cursor Mirror Offset Fix
**Goal:** Make cursor positions pixel-perfect across pan/zoom

### Tasks:
- [x] Debug cursor offset calculation
- [x] Account for zoom level in cursor transform
- [x] Account for pan offset in cursor position
- [x] Test cursor accuracy at various zoom levels
- [x] Test cursor accuracy after panning
- [x] Verify fix doesn't break cursor performance

### Files Modified:
- `src/components/Multiplayer/Cursor.jsx` - Fix transform calculation
- `src/hooks/useCursor.js` - Adjust position calculation if needed

### Testing:

**Unit Tests - NO FAIL:**
- [x] Cursor transform accounts for zoom level
- [x] Cursor transform accounts for pan offset
- [x] Position calculation is accurate at zoom = 0.5, 1.0, 2.0

**Integration Tests - NO FAIL:**
- [x] Cursor positions match exactly on two clients (no zoom/pan)
- [x] Cursor positions stay accurate after zooming
- [x] Cursor positions stay accurate after panning
- [x] Cursor positions accurate with both zoom AND pan

### Files Created for Testing:
- `src/components/Multiplayer/__tests__/Cursor.test.js`

### Validation:
- [x] Open 2 browsers, hover same spot → cursors overlap exactly
- [x] Zoom in/out → cursors still overlap exactly
- [x] Pan canvas → cursors still overlap exactly
- [x] No performance degradation

---

## PR #19: TODO Item - Mid-Drag Jitter Smoothing
**Goal:** Improve real-time drag smoothness with better throttling/tweening

### Tasks:
- [x] Profile current drag performance
- [x] Tune throttle timing for position updates
- [x] Implement tween/interpolation for smoother motion
- [x] Add update queue to prevent dropped frames
- [x] Test with rapid mouse movement
- [x] Test with network throttling (simulate slow connection)
- [x] Ensure fix doesn't increase latency

### Files Modified:
- `src/hooks/useCanvas.js` - Adjust drag update throttling
- `src/components/Canvas/Rectangle.jsx` - Add tween logic if needed
- `src/components/Canvas/Circle.jsx` - Add tween logic if needed
- `src/components/Canvas/TextBox.jsx` - Add tween logic if needed
- `src/utils/helpers.js` - Add tween/interpolation utility functions

### Testing:

**Unit Tests - NO FAIL:**
- [x] Throttle limits updates to reasonable rate (16ms intervals)
- [x] Update queue doesn't drop position updates
- [x] Tween interpolation smooths between positions

**Integration Tests - FLAG FOR LATER:**
- [x] Visual smoothness improved during drag
- [x] No visible jitter on remote client during drag
- [x] Latency stays <100ms despite smoothing
- [x] Works well on throttled network (3G simulation)

### Files Created for Testing:
- `src/hooks/__tests__/useCanvas.drag.test.js`

### Validation:
- [x] Drag object rapidly → smooth motion on both clients
- [x] No visible jitter or stuttering
- [x] Latency acceptable (<100ms)
- [x] Works on slow network connections

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
- [x] Test with various text lengths
- [x] Handle edge cases (empty text, special characters)

### Files Created:
- `src/components/Canvas/TextEditor.jsx` - Inline text editing component (optional)

### Files Modified:
- `src/components/Canvas/TextBox.jsx` - Add double-click handler and editing mode
- `src/hooks/useCanvas.js` - Add updateTextContent function
- `src/services/canvas.js` - Add text update to Firestore

### Testing:

**Unit Tests - NO FAIL:**
- [x] Double-click activates edit mode
- [x] Text updates sync to Firestore
- [x] Canvas hotkeys suppressed during editing
- [x] Edit mode exits on blur or Enter key

**Integration Tests - NO FAIL:**
- [x] User A edits text → User B sees update
- [x] Editing doesn't interfere with other canvas operations
- [x] Can edit multiple text objects sequentially

**Integration Tests - FLAG FOR LATER:**
- [x] Handles very long text gracefully
- [x] Handles special characters (emojis, unicode)
- [x] Edit mode styling matches text appearance

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
- [x] Add rotation handle to selection transformer
- [x] Implement rotation calculation from mouse drag
- [x] Update object rotation property
- [x] Sync rotation to Firestore
- [x] Test rotation for rectangles, circles, text
- [x] Ensure rotation works with other transforms (move, resize)

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
- [x] Rotation handle appears on selected objects
- [x] Objects rotate smoothly
- [x] Rotation syncs to all users
- [x] Works with all shape types

---

## PR #22: Stretch TODO - Recolor Selected Shape (If Time)
**Goal:** Apply color to selected objects easily

### Tasks:
- [x] Apply color to selected object(s)
- [x] Sync color changes to Firestore
- [x] Add active color state to canvas
- [x] Add color picker/palette UI
- [x] Cache last 8 used colors (optional)
- [x] Test with single and multiple selections

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
- [x] Works with multiple selected objects

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