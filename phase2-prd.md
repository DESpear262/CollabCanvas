# CollabCanvas Phase 2 - AI Integration PRD

## Project Overview
Building on the MVP's collaborative canvas foundation, Phase 2 introduces an AI agent that manipulates the canvas through natural language commands. Users can instruct the AI to create, modify, and arrange objects using function calling, with all changes syncing in real-time to all collaborators.

**Deadline:** Friday (Early Submission - 4 days from MVP completion)  
**Success Criteria:** AI agent executes 6+ distinct command types with reliable accuracy and real-time sync  
**Architecture Principle:** Modular design to support easy feature additions in Phase 3

---

## Current State (Post-MVP)

### What We Have:
- ✅ Real-time collaborative canvas with 60 FPS performance
- ✅ Firebase authentication (email/password)
- ✅ Multiplayer cursors with <50ms sync
- ✅ Presence awareness (online users list)
- ✅ Three shape types: rectangles, circles, text boxes
- ✅ Object manipulation: create, move, resize, delete
- ✅ Object sync <100ms across all users
- ✅ State persistence in Firestore
- ✅ Deployed and accessible

### What We're Adding:
- 🎯 AI agent with natural language interface
- 🎯 Function calling for canvas manipulation
- 🎯 6+ command types (creation, manipulation, layout, complex)
- 🎯 Shared AI state (all users see AI-generated content)
- 🎯 Multi-step operation planning

---

## User Stories

### Primary User: Designer with AI Assistant
- As a designer, I want to type "create a blue circle at 200, 300" and see it appear on the canvas
- As a designer, I want to say "arrange these shapes in a row" and have the AI organize selected objects
- As a designer, I want to ask "make a login form" and get a complete multi-object layout
- As a designer, I want AI-generated objects to sync to my collaborators immediately

### Collaborator User: Working Alongside AI
- As a collaborator, I want to see objects created by another user's AI commands in real-time
- As a collaborator, I want to use the AI simultaneously without conflicts
- As a collaborator, I want to modify AI-generated objects just like manual ones

### System Requirements
- As the system, I need to parse natural language into structured function calls
- As the system, I need to execute multi-step operations sequentially
- As the system, I need to broadcast AI changes through existing sync infrastructure

---

## Phase 2 Feature Requirements

### 1. AI Chat Interface (Priority: CRITICAL)
- **Chat UI Component**
  - Text input field for natural language commands
  - Submit button or Enter key
  - Chat history display (user prompts + AI responses)
  - Visual feedback while AI is "thinking"
  - Error messages for failed commands

- **UX Considerations**
  - Chat panel toggleable (don't block canvas)
  - Clear indication when AI is processing
  - Success/failure feedback for each command

### 2. AI Function Calling System (Priority: CRITICAL)
- **Tool Schema Definition**
  - `createShape(type, x, y, width, height, color)` - Create rectangle or circle
  - `createText(text, x, y, color)` - Create text layer (fontSize hardcoded)
  - `moveShape(shapeId, x, y)` - Reposition object
  - `resizeShape(shapeId, width, height)` - Change dimensions
  - `deleteShape(shapeId)` - Remove object
  - `getCanvasState()` - Return current objects for AI context
  - `selectShapes(criteria)` - Get shapes matching description (e.g., "all blue circles")

- **LLM Integration**
  - OpenAI GPT-4o-mini (primary) or GPT-4o (if quality upgrade needed)
  - System prompt defining canvas capabilities and constraints
  - Function schema passed to LLM for parsing

### 3. Command Categories (Priority: CRITICAL)

#### Creation Commands (Must Support 2+)
- "Create a red circle at position 100, 200"
- "Add a text layer that says 'Hello World'"
- "Make a 200x300 rectangle"
- "Add a blue square in the center"

#### Manipulation Commands (Must Support 2+)
- "Move the blue rectangle to the center"
- "Resize the circle to be twice as big"
- "Delete all red shapes"
- "Move this shape 50 pixels to the right"

#### Layout Commands (Must Support 2+)
- "Arrange these shapes in a horizontal row"
- "Create a grid of 3x3 squares"
- "Space these elements evenly"
- "Align these objects to the left"

#### Complex Commands (Must Support 1+)
- "Create a login form with username and password fields"
- "Build a navigation bar with 4 menu items"
- "Make a card layout with title and description"

**Minimum Total: 6+ distinct command types across all categories**

**Modularity Requirement:** 
The command system must be designed for easy extension. New commands should be addable by:
1. Defining new tool schema in `tools.js`
2. Implementing corresponding canvas function (if not already existing)
3. NO changes required to executor, planner, or chat interface
4. Tool registry pattern enables dynamic command discovery

### 4. Multi-Step Planning (Priority: HIGH)
- **Planning Phase**
  - AI identifies complex operations requiring multiple steps
  - Generates execution plan before taking action
  - Example: "login form" → create 3 text boxes, 2 input fields, 1 button, align vertically

- **Sequential Execution**
  - Execute planned steps in order
  - Each step uses existing canvas functions
  - Validate each step before proceeding to next

### 5. Shared AI State (Priority: CRITICAL)
- **Real-Time Sync**
  - AI uses existing canvas API functions (same as manual operations)
  - AI-generated objects flow through established Firestore sync
  - All users see AI changes immediately via existing infrastructure
  - No separate "AI state" needed - leverages shared canvas state

- **Concurrent AI Usage**
  - Multiple users can issue AI commands simultaneously
  - Standard conflict resolution applies (last write wins)
  - No AI command queue needed - handled by existing sync layer

### 6. Context Awareness (Priority: HIGH)
- **Canvas State Access**
  - AI can query current objects via `getCanvasState()`
  - Understands spatial relationships ("move it next to the blue circle")
  - Can reference existing objects by description

- **Selection Context**
  - AI can work with currently selected objects
  - Commands like "arrange these" operate on selection
  - Selection state accessible to AI

---

## Phase 2 MVP TODO Items

### From Phase 1 TODO List:
1. **Multi-select functionality** (shift-click or drag-to-select)
   - Enables batch operations for AI layout commands
   - Required for "arrange these shapes" commands
   
2. **Layer management** (z-index ordering)
   - Bring to front / send to back
   - Needed for complex layouts created by AI

3. **Color picker UI**
   - Replace hardcoded colors
   - Allow users to specify colors in AI commands

4. **Undo/Redo functionality**
   - Essential for reverting AI mistakes
   - Standard canvas feature

---

## Stretch Goals (If Time Permits)

### Tier 1: High-Value Figma Features
- **Grouping objects** - Treat multiple shapes as single unit
- **Copy/paste** - Duplicate objects or groups
- **Keyboard shortcuts** - Delete (Del), Select All (Ctrl+A), etc.
- **Snap to grid** - Align objects to grid lines
- **Alignment tools** - Align left/right/center/top/bottom

### Tier 2: Enhanced AI Capabilities
- **Conversational refinement** - "Make it bigger", "Move it left a bit"
- **AI suggestions** - Proactive layout recommendations
- **Batch operations** - "Create 10 circles in random positions"
- **Style memory** - "Use the same style as the last shape"

### Tier 3: Advanced Canvas Features
- **Shape rotation** - Rotate objects by degrees
- **Borders/strokes** - Add outlines to shapes
- **Opacity control** - Semi-transparent objects
- **Export canvas** - Save as image (PNG/SVG)
- **Canvas templates** - Pre-built layouts to start from

---

## Technical Architecture

### AI Integration Layer

```
src/
├── services/
│   ├── ai/
│   │   ├── openai.js                      # OpenAI client setup
│   │   ├── tools.js                       # Function schema definitions
│   │   ├── executor.js                    # Execute AI function calls
│   │   └── planner.js                     # Multi-step operation planning
├── components/
│   ├── AI/
│   │   ├── ChatPanel.jsx                  # Main AI chat interface
│   │   ├── ChatMessage.jsx                # Individual message component
│   │   ├── ChatInput.jsx                  # Input field + submit
│   │   └── ThinkingIndicator.jsx          # Loading state
├── hooks/
│   ├── useAI.js                           # AI command execution hook
│   └── useChat.js                         # Chat state management
```

### Function Schema Example

```javascript
const tools = [
  {
    name: "createShape",
    description: "Create a rectangle or circle on the canvas",
    parameters: {
      type: "object",
      properties: {
        type: { type: "string", enum: ["rectangle", "circle"] },
        x: { type: "number", description: "X position" },
        y: { type: "number", description: "Y position" },
        width: { type: "number" },
        height: { type: "number" },
        color: { type: "string", description: "Hex color code" }
      },
      required: ["type", "x", "y", "width", "height", "color"]
    }
  },
  // ... more tools
];
```

### AI Command Flow

```
User types command
  ↓
Send to LLM with tool schema
  ↓
LLM returns function call(s)
  ↓
Executor validates parameters
  ↓
Call canvas API functions
  ↓
Firestore syncs to all users
  ↓
Display success message in chat
```

---

## Modularity Requirements

To support Phase 3 additions, the architecture must be:

### 1. Extensible Tool System
- New canvas functions easily added to tool schema
- Tool registry pattern for dynamic loading
- Minimal changes to executor when adding tools

### Pluggable LLM Providers
- OpenAI GPT-4o-mini as primary provider
- Abstract interface allows upgrade to GPT-4o if needed
- Provider swappable via environment variable
- Function calling normalized for OpenAI format

### 3. Composable UI Components
- Chat panel independent of canvas
- Canvas operations exposed via clean API
- New UI features don't break AI integration

### 4. Testable AI Logic
- AI executor separated from LLM calls
- Mock LLM responses for testing
- Function validation independent of execution

---

## Performance Targets

### AI Response Times
- **Single-step commands** (create, move): <2 seconds end-to-end
- **Multi-step commands** (login form): <5 seconds
- **Canvas state query**: <500ms

### Reliability
- **Command accuracy**: >90% for simple commands
- **Graceful failures**: Clear error messages when AI fails
- **No sync issues**: AI-generated objects sync same as manual ones

### User Experience
- **Feedback immediacy**: Typing indicator appears instantly
- **Progress transparency**: Show which step AI is executing
- **Error recovery**: Allow retry on failure

---

## Testing Strategy

### AI Function Tests (NO FAIL)
- [ ] Each tool function executes correctly with valid params
- [ ] Tool validation rejects invalid parameters
- [ ] `getCanvasState()` returns accurate canvas snapshot
- [ ] Multi-step planner generates valid execution sequence

### AI Integration Tests (NO FAIL)
- [ ] Simple creation command creates object on canvas
- [ ] Object appears on all connected clients
- [ ] Multiple AI commands execute sequentially without errors
- [ ] AI can reference existing objects by description

### AI Integration Tests (FLAG FOR LATER)
- [ ] AI handles ambiguous commands reasonably
- [ ] Error messages are helpful for debugging
- [ ] Performance meets <2s target for simple commands
- [ ] Concurrent AI usage from 2 users doesn't conflict

### TODO Feature Tests (NO FAIL)
- [ ] Cursor offsets are pixel-perfect after pan/zoom operations
- [ ] Mid-drag streaming has no visible jitter
- [ ] In-place text editing activates on double-click
- [ ] Text editing suppresses canvas hotkeys while active

### TODO Feature Tests (FLAG FOR LATER)
- [ ] Rotation handles work smoothly for all shape types
- [ ] Recoloring applies to selected shapes correctly
- [ ] Presence join/leave animations are smooth

---

## Definition of Done (Phase 2)

### Core AI Requirements:
- [ ] AI chat interface integrated into canvas
- [ ] 6+ distinct command types working
- [ ] At least 1 complex multi-step command (e.g., login form)
- [ ] AI-generated objects sync to all users in real-time via existing canvas state
- [ ] Function calling reliable for all tool types
- [ ] Error handling for invalid/ambiguous commands

### TODO Items Completed:
- [ ] Cursor mirror offsets pixel-perfect
- [ ] Mid-drag jitter smoothing improved
- [ ] In-place text editing functional

### Stretch TODO Items (If Time):
- [ ] Rotation handles in Select mode
- [ ] Recoloring for selected shapes
- [ ] Smooth presence join/leave transitions

---

## Risks & Mitigation

### High-Risk Areas:
1. **LLM hallucinations** - AI invents functions that don't exist
   - Mitigation: Strict tool schema, validation layer
   
2. **Ambiguous commands** - "Make it bigger" without context
   - Mitigation: Require selection context, clarifying prompts
   
3. **Multi-step complexity** - Login form creates wrong layout
   - Mitigation: Start with simple layouts, iterate based on testing
   
4. **API costs** - OpenAI/Claude costs escalate with testing
   - Mitigation: Use cheaper models for development, cache responses

### Medium-Risk Areas:
1. **Response latency** - AI takes >5 seconds
   - Mitigation: Stream responses, show progress indicators
   
2. **Concurrent AI conflicts** - Two users create same object
   - Mitigation: Standard conflict resolution (already implemented)

---

## Implementation Timeline (4 Days)

### Day 1: AI Foundation
- Set up OpenAI/Claude integration
- Define tool schema for all canvas functions
- Build basic chat UI
- Test single-step commands

### Day 2: Command Coverage
- Implement all 6+ command types
- Add multi-step planning
- Test complex commands (login form)
- Add canvas state querying

### Day 3: TODO Items + Polish
- Cursor mirror offset fixes
- Mid-drag jitter smoothing
- In-place text editing
- Rotation handles (if time)
- Recoloring for selected shapes (if time)

### Day 4: Testing + Stretch Goals
- Integration testing (AI + multiplayer)
- Fix bugs from testing
- Remaining TODO items if time permits
- Stretch goals from Tier 1 if time permits
- Record demo video
- Write AI Development Log

---

## Success Metrics

**Must Achieve:**
- AI executes 6+ command types accurately
- Complex command (login form) creates reasonable layout
- AI changes sync to all users <100ms via existing canvas infrastructure
- No regressions in Phase 1 functionality
- Top 3 TODO items completed (cursor offsets, jitter smoothing, text editing)

**Stretch Success:**
- 8+ command types supported
- 2+ complex commands working
- All 6 TODO items completed
- 2+ Tier 1 stretch goals completed
- AI response time <1.5s average

---

## Key Principles

1. **Leverage Existing Infrastructure** - AI calls existing canvas functions that already handle shared state sync
2. **Modular Command System** - New commands added without breaking existing functionality
3. **Fail Gracefully** - Bad AI commands don't break the canvas
4. **Maintain Performance** - AI doesn't degrade sync speed
5. **User Transparency** - Always show what the AI is doing

---

## Next Steps

1. **Review & Approve** this PRD
2. **Choose LLM Provider** (OpenAI GPT-4 or Anthropic Claude)
3. **Set up API keys** and billing
4. **Create Phase 2 task list** with PR breakdown
5. **Begin implementation** starting with AI foundation