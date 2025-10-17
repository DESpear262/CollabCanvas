# CollabCanvas Phase 3 - Parallel Task Blocks

## Overview
Tasks organized into **dependency chains** that can be worked in parallel. Each block is independent unless explicitly marked with prerequisites.

**Total Implementation Time:** ~26 hours over 3 days  
**Parallelization:** Up to 3-4 blocks can run simultaneously

---

## 🔴 BLOCK A: Selection Foundation Chain
**Dependencies:** None - Start immediately  
**Total Time:** 4 hours  
**Critical Path:** Required for many other features

---

### PR #24: Multi-Select Infrastructure (Blender-style)
**Prerequisites:** None  
**Time:** 3–4 hours  
**Impact:** +1-2 points (Section 2), unlocks BLOCK B and BLOCK E

#### Tasks:
- [x] Selection state foundation exists via `SelectionContext`
- [ ] Wire `SelectionContext` into `src/components/Canvas/Canvas.tsx`; comment out legacy `selectedId/selectedKind` usages for rollback
- [ ] Add west-pinned selection toolbar
  - [ ] Primary mode: point | rectangle | lasso (Shift cycles)
  - [ ] Boolean mode: new | union | intersect | difference (Tab cycles)
  - [ ] Show selected-count chip when >1 selected
- [ ] Point-select: top-most by z; blank click clears
- [ ] Rectangle-select (marquee): intersect rule, live update, 5px threshold, cancel on RMB/outside
- [ ] Lasso-select: polygon live update; intersect rule
- [ ] Boolean modes applied across point/area: new, union, intersect, difference
- [ ] Selection persists across pan/zoom; MMB pans without affecting selection
- [ ] Selection tool is selection-only (no move/resize/rotate)
- [ ] Pan tool attaches Transformer to current selection; allow multi-rotate about selection centroid; disable group resize
- [ ] Text edit resumes prior multi-selection after blur/click-away

#### Files Created:
- `src/components/Canvas/SelectionToolbar.tsx`
- `src/components/Canvas/Marquee.tsx`
- `src/components/Canvas/Lasso.tsx`

#### Files Modified:
- `src/components/Canvas/Canvas.tsx` - integrate selection context, toolbars, modes, overlays
- `src/context/SelectionContext.tsx` - may extend API (replace selection)
- `src/components/Canvas/Rectangle.tsx` / `Circle.tsx` / `TextBox.tsx` - optional lightweight selection visuals

#### Testing (Manual):
- [ ] Point/rect/lasso work with new/union/intersect/difference
- [ ] Click blank canvas clears selection
- [ ] Live marquee/lasso updates and cancels correctly
- [ ] Selection persists across pan/zoom and MMB pan
- [ ] Returning from text edit restores multi-selection

#### Validation:
- [ ] Blender-style selection UX implemented
- [ ] Boolean modes behave as specified
- [ ] Transformer appears only in pan tool; multi-rotate works; no group resize

---

### PR #25: Batch Operations on Selection
**Prerequisites:** PR #24 (Multi-Select) MUST be complete  
**Time:** 2 hours  
**Impact:** Foundation for keyboard shortcuts and grouping

#### Tasks:
- [ ] Implement batch move for selected objects
- [ ] Implement batch delete for selected objects
- [ ] Implement batch color change for selected objects
- [ ] Add `getBoundingBox()` for selection (used by alignment later)
- [ ] Test moving 5 objects simultaneously
- [ ] Ensure batch operations sync to all users

#### Files Created:
- None (modifying existing)

#### Files Modified:
- `src/hooks/useCanvas.ts` - Add `moveSelected()`, `deleteSelected()`, `recolorSelected()`, `getSelectionBounds()`
- `src/services/canvas.ts` - Batch update functions for Firestore

#### Testing:
**Unit Tests - NO FAIL:**
- [ ] `moveSelected()` updates positions of all selected objects
- [ ] `deleteSelected()` removes all selected objects
- [ ] `getSelectionBounds()` calculates correct bounding box

**Integration Tests - NO FAIL:**
- [ ] Move 3 selected objects → all move together on all clients
- [ ] Delete 2 selected objects → both removed from all clients
- [ ] Batch operations maintain sync <100ms

#### Validation:
- [ ] Selected objects move together
- [ ] Batch operations work correctly
- [ ] Changes sync to all users

---

## 🟢 BLOCK B: Keyboard Shortcuts Chain
**Dependencies:** PR #25 (Batch Operations) MUST be complete  
**Total Time:** 3 hours  
**Can run in parallel with:** BLOCK C, BLOCK D after PR #24 done

---

### PR #26: Basic Keyboard Shortcuts
**Prerequisites:** PR #25 (Batch Operations) MUST be complete  
**Time:** 2 hours  
**Impact:** +2 points (Tier 1 Feature)

#### Tasks:
- [ ] Set up global keyboard event listener
- [ ] Implement Delete key → delete selected objects
- [ ] Implement Arrow keys → move selected objects 10px
- [ ] Implement Cmd/Ctrl+D → duplicate selected objects
- [ ] Implement Escape → clear selection
- [ ] Suppress shortcuts during text editing
- [ ] Test all shortcuts work correctly

#### Files Created:
- `src/hooks/useKeyboard.ts` - Keyboard shortcut manager

#### Files Modified:
- `src/App.tsx` - Add useKeyboard hook
- `src/hooks/useCanvas.ts` - Add `duplicateSelected()` function
- `src/components/Canvas/TextBox.tsx` - Set editing flag to suppress shortcuts

#### Testing:
**Unit Tests - NO FAIL:**
- [ ] Delete key calls `deleteSelected()`
- [ ] Arrow keys call `moveSelected()` with 10px offset
- [ ] Cmd+D calls `duplicateSelected()`
- [ ] Shortcuts suppressed when text editing

**Integration Tests - NO FAIL:**
- [ ] Delete key removes selected objects on all clients
- [ ] Arrow keys move objects on all clients
- [ ] Duplicate creates copies on all clients

#### Validation:
- [ ] All keyboard shortcuts work
- [ ] Shortcuts don't interfere with text editing
- [ ] Changes sync to all users

---

### PR #27: Copy/Paste Shortcuts
**Prerequisites:** PR #26 (Basic Shortcuts) MUST be complete  
**Time:** 1 hour  
**Impact:** +2 points (Tier 1 Feature)

#### Tasks:
- [ ] Implement Cmd/Ctrl+C → copy selected objects to clipboard state
- [ ] Implement Cmd/Ctrl+V → paste from clipboard with offset
- [ ] Store clipboard in React state (not browser clipboard)
- [ ] Paste creates objects at +20px x/y offset
- [ ] Test copy/paste workflow

#### Files Created:
- None (modifying existing)

#### Files Modified:
- `src/hooks/useCanvas.ts` - Add `clipboard` state, `copySelected()`, `paste()`
- `src/hooks/useKeyboard.ts` - Add Cmd+C and Cmd+V handlers

#### Testing:
**Unit Tests - NO FAIL:**
- [ ] Cmd+C copies selected objects to clipboard state
- [ ] Cmd+V creates new objects from clipboard
- [ ] Pasted objects have offset position

**Integration Tests - NO FAIL:**
- [ ] Copy and paste creates duplicates on all clients
- [ ] Multiple pastes create multiple copies

#### Validation:
- [ ] Copy/paste works correctly
- [ ] Pasted objects appear with offset
- [ ] Syncs to all users

---

## 🔵 BLOCK C: Undo/Redo System (Independent)
**Dependencies:** None - Can start immediately  
**Total Time:** 3 hours  
**Can run in parallel with:** All other blocks  
**Impact:** +2 points (Tier 1 Feature)

---

### PR #28: Undo/Redo Implementation
**Prerequisites:** None (independent feature)  
**Time:** 3 hours  
**Impact:** +2 points (Tier 1 Feature)

#### Tasks:
- [ ] Create history stack (array of canvas snapshots)
- [ ] Track operations: create, move, resize, delete, recolor
- [ ] Implement undo → restore previous state
- [ ] Implement redo → restore next state
- [ ] Implement Cmd/Ctrl+Z → undo
- [ ] Implement Cmd/Ctrl+Shift+Z → redo
- [ ] Limit history to last 50 operations
- [ ] Handle undo/redo with real-time sync (only affect local user's view initially, then sync)

#### Files Created:
- `src/hooks/useHistory.ts` - History stack management

#### Files Modified:
- `src/hooks/useCanvas.ts` - Integrate history tracking for all operations
- `src/hooks/useKeyboard.ts` - Add undo/redo shortcuts
- `src/App.tsx` - Add useHistory hook

#### Testing:
**Unit Tests - NO FAIL:**
- [ ] History tracks create/delete operations
- [ ] Undo restores previous state
- [ ] Redo restores next state
- [ ] History limited to 50 operations

**Integration Tests - NO FAIL:**
- [ ] Create object → undo → object disappears (locally)
- [ ] Delete object → undo → object reappears
- [ ] Multiple undo/redo cycles work correctly
- [ ] Undo syncs to other users via normal sync

**Integration Tests - FLAG FOR LATER:**
- [ ] Undo doesn't conflict with other users' simultaneous edits
- [ ] History survives page refresh (optional)

#### Validation:
- [ ] Undo/redo works for all operations
- [ ] Keyboard shortcuts work
- [ ] Changes sync appropriately

---

## 🟡 BLOCK D: Layer Management Chain
**Dependencies:** None - Can start immediately  
**Total Time:** 4 hours  
**Can run in parallel with:** All other blocks

---

### PR #29: Z-Index Layer Management
**Prerequisites:** None (independent feature)  
**Time:** 2 hours  
**Impact:** +3 points (Tier 2 Feature)

#### Tasks:
- [x] Add `z` property to all objects (existing schema)
- [x] Implement "Bring to Front" → set highest `z` (logic present)
- [x] Implement "Send to Back" → set lowest `z` (logic present)
- [x] Implement "Bring Forward" → increment `z` by 1 (logic present)
- [x] Implement "Send Backward" → decrement `z` by 1 (logic present)
- [x] Add right-click context menu for layer operations
- [x] Render objects in `z` order
- [x] Sync `z` changes to Firestore
- [x] Persist `z` changes when reordering (call upsert APIs for affected items)

#### Files Created:
- `src/components/Canvas/ContextMenu.tsx` - Right-click menu (optional)

#### Files Modified:
- `src/hooks/useCanvas.ts` - Add `bringToFront()`, `sendToBack()`, etc.
- `src/components/Canvas/Canvas.tsx` - Sort objects by zIndex before rendering
- `src/services/canvas.ts` - Update zIndex in Firestore

#### Testing:
**Unit Tests - NO FAIL:**
- [ ] `bringToFront()` sets zIndex to maximum + 1
- [ ] `sendToBack()` sets zIndex to 0
- [ ] Objects render in zIndex order

**Integration Tests - NO FAIL:**
- [ ] Layer order changes sync to all clients
- [ ] Overlapping objects respect zIndex

#### Validation:
- [ ] Layer ordering works correctly
- [ ] Changes sync to all users
- [ ] Context menu or shortcuts functional

---

### PR #30: Object Grouping
**Prerequisites:** PR #29 (Z-Index) MUST be complete  
**Time:** 2 hours  
**Impact:** +2 points (Tier 1 Feature)

#### Tasks:
- [x] Create "Group" object type containing array of child IDs
- [x] Implement group creation from selected objects
- [x] Implement ungroup → break group into individual objects
- [x] Regroup selection across existing groups into a new group
- [x] Deleting group deletes all children (erase on group)
- [x] Group inherits highest z of children; overlay shows orange bounds
- [x] Sync groups to Firestore

#### Files Created:
- `src/components/Canvas/GroupToolbar.tsx` - East-pinned group list and actions
- `src/components/Canvas/GroupOverlay.tsx` - Orange overlay for active group

#### Files Modified:
- `src/services/canvas.ts` - Add group schema and upsert/delete
- `src/components/Canvas/Canvas.tsx` - Wire toolbar, overlay, actions

#### Testing:
**Unit Tests - NO FAIL:**
- [ ] `createGroup()` creates group with child IDs
- [ ] `ungroup()` breaks group into individuals
- [ ] Moving group moves all children
- [ ] Deleting group deletes all children

**Integration Tests - NO FAIL:**
- [ ] Groups sync to all clients
- [ ] Group operations work correctly across users

**Integration Tests - FLAG FOR LATER:**
- [ ] Nested groups work (group of groups)
- [ ] Groups survive undo/redo

#### Validation:
- [ ] Can group and ungroup objects
- [ ] Group operations work correctly
- [ ] Syncs to all users

---

## 🟠 BLOCK E: Alignment & Color Tools
**Dependencies:** PR #25 (Batch Operations) for alignment, None for color picker  
**Total Time:** 4 hours  
**Can run in parallel after:** PR #25 complete

---

### PR #31: Alignment Tools
**Prerequisites:** PR #25 (Batch Operations) MUST be complete  
**Time:** 2 hours  
**Impact:** +3 points (Tier 2 Feature)

#### Tasks:
- [ ] Implement align left → move all selected to leftmost x
- [ ] Implement align right → move all selected to rightmost x
- [ ] Implement align top → move all selected to topmost y
- [ ] Implement align bottom → move all selected to bottommost y
- [ ] Implement align center horizontal
- [ ] Implement align center vertical
- [ ] Add toolbar buttons or keyboard shortcuts
- [ ] Use `getSelectionBounds()` from PR #25

#### Files Created:
- `src/components/Canvas/AlignmentToolbar.tsx` - Toolbar with alignment buttons

#### Files Modified:
- `src/hooks/useCanvas.ts` - Add alignment functions
- `src/components/Canvas/Canvas.tsx` - Add alignment toolbar

#### Testing:
**Unit Tests - NO FAIL:**
- [ ] Align left moves objects to leftmost x
- [ ] Align center positions objects at midpoint
- [ ] All alignment functions use correct calculations

**Integration Tests - NO FAIL:**
- [ ] Alignment changes sync to all clients
- [ ] Alignment works with 2+ selected objects

#### Validation:
- [ ] All alignment options work
- [ ] Toolbar is functional
- [ ] Syncs to all users

---

### PR #32: Color Picker with Recent Colors
**Prerequisites:** None (independent feature)  
**Time:** 2 hours  
**Impact:** +2 points (Tier 1 Feature)

#### Tasks:
- [ ] Create color picker component (HTML5 color input or custom)
- [ ] Store last 8 colors used in React state
- [ ] Apply color to selected objects
- [ ] Add color picker to toolbar/sidebar
- [ ] Persist recent colors in localStorage (optional)
- [ ] Test color changes sync to all users

#### Files Created:
- `src/components/Canvas/ColorPicker.tsx` - Color picker UI with recent colors

#### Files Modified:
- `src/hooks/useCanvas.ts` - Add `recentColors` state, `addRecentColor()`
- `src/components/Canvas/Canvas.tsx` - Add color picker to UI

#### Testing:
**Unit Tests - NO FAIL:**
- [ ] Color picker updates recent colors list
- [ ] Recent colors limited to 8
- [ ] Applying color updates selected objects

**Integration Tests - NO FAIL:**
- [ ] Color changes sync to all clients

#### Validation:
- [ ] Color picker works
- [ ] Recent colors display correctly
- [ ] Changes sync to all users

---

## 🟣 BLOCK F: Performance & Export (Independent)
**Dependencies:** None - Can start anytime  
**Total Time:** 3 hours  
**Can run in parallel with:** All other blocks

---

### PR #33: Performance Testing & Optimization
**Prerequisites:** None (testing existing system)  
**Time:** 2 hours  
**Impact:** +1-2 points (Section 2 Performance)

#### Tasks:
- [ ] Create test script to generate 500 objects
- [ ] Profile canvas rendering with Chrome DevTools
- [ ] Measure FPS with 500 objects during pan/zoom
- [ ] Optimize if needed (memoization, object pooling)
- [ ] Document performance results
- [ ] Test with 5+ concurrent users + 500 objects

#### Files Created:
- `src/utils/performanceTest.ts` - Script to create test objects
- `docs/PERFORMANCE.md` - Performance test results

#### Files Modified:
- `src/components/Canvas/Canvas.tsx` - Add memoization if needed
- `src/components/Canvas/Rectangle.tsx` - Optimize rendering if needed

#### Testing:
**Integration Tests - NO FAIL:**
- [ ] 500 objects render without crashes
- [ ] Pan/zoom maintains 60 FPS with 500 objects
- [ ] 5 users + 500 objects maintains performance

**Integration Tests - FLAG FOR LATER:**
- [ ] 1000+ objects render at 60 FPS (bonus point)
- [ ] 10+ users maintain performance (bonus point)

#### Validation:
- [ ] Performance meets 500 objects at 60 FPS
- [ ] Documented in README/docs
- [ ] Ready to demo in video

---

### PR #34: Export Canvas as PNG
**Prerequisites:** None (independent feature)  
**Time:** 1 hour  
**Impact:** +2 points (Tier 1 Feature)

#### Tasks:
- [ ] Add export button to toolbar
- [ ] Use Konva `stage.toDataURL()` to generate image
- [ ] Trigger browser download of PNG
- [ ] Optional: Export selected objects only
- [ ] Test export works correctly

#### Files Created:
- None (modifying existing)

#### Files Modified:
- `src/components/Canvas/Canvas.tsx` - Add export button and handler
- `src/hooks/useCanvas.ts` - Add `exportToPNG()` function

#### Testing:
**No Tests Required** - Simple feature, visual validation sufficient

#### Validation:
- [ ] Export button downloads PNG
- [ ] PNG contains full canvas
- [ ] Image quality acceptable

---

## 🟤 BLOCK G: Polish & Connection Status (Independent)
**Dependencies:** None - Can start anytime  
**Total Time:** 3 hours  
**Can run in parallel with:** All other blocks

---

### PR #35: Connection Status Indicator
**Prerequisites:** None (independent feature)  
**Time:** 1 hour  
**Impact:** +1 point (Section 1 Persistence)

#### Tasks:
- [ ] Add Firebase connection state listener
- [ ] Display online/offline indicator in header
- [ ] Show reconnecting state
- [ ] Optional: Toast notification on reconnect
- [ ] Test with network throttling

#### Files Created:
- `src/components/Layout/ConnectionStatus.tsx` - Status indicator component

#### Files Modified:
- `src/components/Layout/Header.tsx` - Add connection status
- `src/hooks/usePresence.ts` - Add connection state tracking

#### Testing:
**Integration Tests - NO FAIL:**
- [ ] Indicator shows online when connected
- [ ] Indicator shows offline when disconnected
- [ ] Reconnection updates status

#### Validation:
- [ ] Status indicator displays correctly
- [ ] Updates in real-time
- [ ] Provides clear feedback

---

### PR #36: UI Polish & Animations
**Prerequisites:** None (independent feature)  
**Time:** 2 hours  
**Impact:** +2 points (Bonus Polish)

#### Tasks:
- [ ] Add smooth fade-in for created objects
- [ ] Add fade-out for deleted objects
- [ ] Add selection animation (border pulse or glow)
- [ ] Add cursor animation improvements
- [ ] Polish toolbar/panel styling
- [ ] Add icons to buttons (Lucide React)
- [ ] Consistent color scheme and spacing
- [ ] Add loading states where appropriate

#### Files Created:
- None (styling existing components)

#### Files Modified:
- `src/index.css` - Add animations and transitions
- `src/components/Canvas/Rectangle.tsx` - Add fade animations
- `src/components/Canvas/Circle.tsx` - Add fade animations
- `src/components/Canvas/TextBox.tsx` - Add fade animations
- `src/components/Canvas/Canvas.tsx` - Polish toolbar styling
- All UI components - Add icons and consistent styling

#### Testing:
**No Tests Required** - Visual polish, manual validation sufficient

#### Validation:
- [ ] Animations are smooth and subtle
- [ ] UI looks professional
- [ ] Icons are consistent
- [ ] Color scheme is cohesive

---

## 📊 Dependency Graph

```
INDEPENDENT BLOCKS (Start Immediately):
├─ BLOCK C: Undo/Redo (3h)
├─ BLOCK D: Layer Management → Grouping (4h)
├─ BLOCK F: Performance & Export (3h)
└─ BLOCK G: Polish & Connection (3h)

SELECTION CHAIN (Critical Path):
BLOCK A: Multi-Select (2h) → Batch Operations (2h)
    ├─ BLOCK B: Keyboard Shortcuts (2h) → Copy/Paste (1h)
    └─ BLOCK E: Alignment (2h) + Color Picker (2h, independent)

Total Independent Time: 13h (can all run in parallel)
Total Selection Chain Time: 9h (must be sequential)
```

---

## Recommended Execution Strategy

### Day 1 (8 hours):
**Parallel Work:**
- Start BLOCK A (4h) - Critical path
- Start BLOCK C (3h) - While waiting on BLOCK A
- Start BLOCK F (3h) - While waiting on BLOCK A

**End of Day:** PRs #24, #25, #28, #33 complete

---

### Day 2 (10 hours):
**Parallel Work:**
- Start BLOCK B (3h) - Depends on BLOCK A done
- Start BLOCK D (4h) - Independent
- Start BLOCK E (4h) - Depends on PR #25 done
- Start BLOCK G (3h) - Independent

**End of Day:** PRs #26-32, #35, #36 complete

---

### Day 3 (4 hours):
- PR #34: Export (1h)
- Final testing (1h)
- Demo video (2h)

---

### Day 4 (2 hours):
- AI Development Log (1h)
- Final submission (1h)

---

## Point Projection by Day

**End of Day 1:** 
- Multi-select + Undo/Redo + Performance = +6-8 points
- **Score: 94-100 points**

**End of Day 2:**
- Keyboard shortcuts + Copy/Paste + Layer Management + Grouping + Alignment + Color Picker + Connection Status + Polish = +17-19 points
- **Score: 105+ points (capped at 105)**

**End of Day 3:**
- Export + Demo Video = +2 points + professional presentation
- **Final Score: 105 points (maximum possible)**

---

## Critical Success Factors

1. **Start BLOCK A immediately** - It's the critical path
2. **BLOCK C, D, F, G can all run in parallel** - Maximum efficiency
3. **Test each PR before moving to next** - Graceful failures only work if you catch them
4. **Don't optimize order** - Work on highest impact first
5. **Time box each PR** - If it takes >3h, move on

---

## Notes

- **Graceful Failures:** If a feature breaks, it shouldn't affect others. Each PR is isolated.
- **Dependencies Clearly Marked:** Check prerequisites before starting each PR
- **Parallel Optimization:** Up to 4 blocks can run simultaneously
- **Time Estimates:** Conservative - you finished Phase 2 in one day, you can do this

You've got the momentum. Let's lock in that 95-100 point score! 🚀