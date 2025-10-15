# TODO

## Presence UI (future enhancements)
- Add idle/away detection and show status (active/idle/away/offline)
- Show last active time tooltip (e.g., "3m ago") using server lastSeen
- User avatar colors seeded by uid; optional custom display names
- Add collapsible/expandable presence panel; keyboard toggle
- Show typing indicators and selection highlights (later with canvas tools)
- Error states and reconnection indicators for RTDB presence

## Canvas (upcoming PRs)
- Improve mid-drag streaming jitter smoothing (throttle/tween/queue tuning)

## Cursor sync polish
- Dial in cursor mirror offsets to be pixel-perfect across pan/zoom

## Editing enhancements
- Add rotation handles in Select mode (rect/circle/text)
- Add in-place text editing in Select mode (suppress hotkeys while editing)
- Add recoloring for selected shape (apply active color, last-8 cache)
