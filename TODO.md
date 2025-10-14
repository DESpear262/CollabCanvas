# TODO

## Presence UI (future enhancements)
- Add idle/away detection and show status (active/idle/away/offline)
- Show last active time tooltip (e.g., "3m ago") using server lastSeen
- User avatar colors seeded by uid; optional custom display names
- Add collapsible/expandable presence panel; keyboard toggle
- Add search/filter when many users are online
- Smooth join/leave transitions (fade/slide)
- Mute/hide specific users (client-side only)
- Group users (e.g., teams) with headers and counts
- Show typing indicators and selection highlights (later with canvas tools)
- Error states and reconnection indicators for RTDB presence

## Canvas (upcoming PRs)
- Pan & Zoom: 5000x5000 stage, wheel zoom with limits, smooth drag
- Rectangle tools: create, select, move, resize (MVP: move)
- Persistence: Firestore save/load/subscribe
- Real-time object sync: conflict handling, performance tuning
- Improve mid-drag streaming jitter smoothing (throttle/tween/queue tuning)

## Cursor sync polish
- Dial in cursor mirror offsets to be pixel-perfect across pan/zoom

## Editing enhancements
- Add rotation handles in Select mode (rect/circle/text)
- Add in-place text editing in Select mode (suppress hotkeys while editing)
- Add recoloring for selected shape (apply active color, last-8 cache)
