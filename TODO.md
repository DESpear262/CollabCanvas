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

## Layer control (z-index)
- [ ] Add `z` to `RectData`, `CircleData`, `TextData`; persist in Firestore map schema
- [ ] Renderer: render a single combined list sorted by `z`, then type+id for stable ties
- [ ] APIs: `bringToFront(id)`, `sendToBack(id)`, `moveForward(id)`, `moveBackward(id)`, `setLayer(ids[], zBase, step=1)`
- [ ] Creation: assign topmost `z` to new objects; backfill existing with `z=0`
- [ ] Selection/transform: do not change `z` unless explicitly requested
  - Note: Multi-select not yet implemented. When added, layer actions must apply to multiple selected items while preserving relative order.
- [ ] Migration: backfill existing documents; ensure subscribe/apply uses the combined sorted order