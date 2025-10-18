# TODO

## Presence UI (future enhancements)
- Add idle/away detection and show status (active/idle/away/offline)
- Show last active time tooltip (e.g., "3m ago") using server lastSeen
- User avatar colors seeded by uid; optional custom display names
- Add collapsible/expandable presence panel; keyboard toggle
- Show typing indicators and selection highlights (later with canvas tools)
- Error states and reconnection indicators for RTDB presence

## AI Chat UI
- [ ] Add badge to minimized chat window to show when thinking concludes

## AI planning & quality
- [ ] Improve LLM logic for numeric counts ("create 7 circles") and exact placement
- [ ] Improve parsing of grids ("create a 3 by 4 grid", spacing and alignment)

## Layer control (z-index)
  - Note: Multi-select not yet implemented. When added, layer actions must apply to multiple selected items while preserving relative order.

## Canvas selection & layers
- [ ] Integrate `SelectionContext` into `Canvas.tsx` (Blender-style selection: point/rect/lasso, boolean modes new/union/intersect/difference, live marquee, 5px threshold, cancel on RMB/outside)
- [ ] Implement lasso selection polygon with intersect rule
- [x] Expose z-index controls in UI (context menu for selection)
- [x] Persist z-index changes to Firestore via upsert for affected items

## Input
- [x] MMB click+drag pans camera in all tools without altering selection

## Selection
- [ ] Add "X-ray mode" to allow selecting through occluders (future)

## Export & color tools
- [ ] Add Export PNG action to toolbar (Konva `stage.toDataURL()`); download flow
- [ ] Add Color Picker with recent colors (cap 8, MRU ordering); apply to selection
 - [ ] Color picker: support gradient/continuous selection; avoid snapping to white/black/full saturation

## Alignment & grouping
- [ ] Alignment tools (left/right/top/bottom/center using selection bounds)
- [ ] Grouping and ungrouping for selected objects (moves/deletes groups)
 - [ ] Align actions should be clumped into a single undo/redo step

## Performance & metrics
- [ ] Create performance test script (generate 500 objects, 60 FPS target) and `docs/PERFORMANCE.md`
- [ ] Record measured cursor/object latencies and AI response times in `memory-bank/progress.md`
- [ ] Improve LLM latency (smaller prompts, tool_choice policies, caching)

## Connection status
- [ ] Add online/offline/reconnecting indicator to header; test with throttled network

## Project chores
- [ ] Refactor codebase
- [ ] Build classification model