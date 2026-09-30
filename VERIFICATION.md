# Local verification

Readiness work for the approved revised journey. Test data is synthetic; the real `rooms.sqlite3` is not used by these checks.

Recorded September 30, 2026 on Windows, Python 3.12.10 and installed Chrome 153.0.8010.54. Browser automation uses isolated profiles and the Python standard library, with no installed test packages.

| Check | Evidence and limits |
| --- | --- |
| Server/state/HTTP regression suite | `py -3 -m unittest -v test_game.py test_adventures.py`: 23 passing tests. Both editions' complete state journeys, private clues, movement/physics, gate cooperation, incorrect guesses, duplicate/stale actions, old lantern holds, admission, expiry, persistence and HTTP/SSE. |
| Windows startup | Regression covers permission-error fallback to an OS-assigned port, actual ephemeral binding, and matching printed/browser-open URLs. Browser tests start actual local HTTP servers. This does not diagnose the original Windows port restriction or alter network settings. |
| Browser smoke suite | `py -3 test_browser.py`: passing. Two seats, keyboard and simulated touch, mobile widths, bridge SVGs, constellation reveal/confirmation, map controls, refresh, real page departure/resume, practice, no captured JavaScript errors. Selects chapters directly; intercepts postcard download to inspect rendering. |
| Complete UI journey | `py -3 test_journey.py`: passing. Two real-time flights with swapped roles, all three lantern trails, all three bridge crossings, and all three constellation reveals through UI controls, without chapter injection or clock changes. Checks invalid city input, third-seat rejection, chat/unread/focus, repeated submissions, wrong star guesses, chapter distance reductions, actual page disconnect, server-process restart with saved progress/chat, and matching 1600 x 1100 PNG files downloaded from both seats. No captured JavaScript errors or server tracebacks. |
| Visual review | Synthetic screenshots of the mobile flight/bridge, desktop boards, and Unicode postcard reviewed. Portrait controls, map collapse, SVG levers, chat access, focus outlines, and full souvenir city names are visible. |
| Source control exclusions | `git check-ignore` confirms database/sidecars, environment files, Python caches, virtual environments, and artifacts are ignored. No remote configured. |

## Changes from this pass

- Mobile conversation dialog with unread badge, input focus, Escape/close return, and release of held controls when opening it.
- Collapsible phone map, one lantern chart at a time, larger touch targets, clearer focus and supporting text.
- Reduced decorative canvas motion; essential flight movement remains visible. Celebration companions react to hearts with a static glow when reduced motion is enabled.
- Separate full city-name lines and bounded map labels on the postcard. Both players export the original distance in kilometres and the completion date in UTC, regardless of their on-screen unit preference.
- Continuous land polygons across the map seam, checked with a Pacific route. Wrapping individual polygon vertices previously produced a large triangular land artifact on the postcard.
- Explicit `pagehide` cleanup of SSE and held controls, plus reconnection on a cached `pageshow`. The browser navigation check initially exposed a departed page remaining online; the focused regression now passes.

## Still needs people/devices

- Two physical iPhones running Safari: touch comfort, software keyboard, audio activation, dynamic viewport/text sizing, background/lock recovery, actual Files/Photos saving, and the native share sheet over HTTPS.
- A timed two-person playtest: the proposed 12–18 minutes and difficulty/enjoyment are not established by scripted completion. Follow [PLAYTEST.md](PLAYTEST.md).
- Public hosting and separate-network testing. The user chose a public link for anyone, with two iPhones as the primary test devices. No service has been provisioned or published.
- A chosen GitHub repository before publication. The local checkpoint does not publish game data or source online.

Automated Chromium screenshots and pointer events are not evidence of physical Safari compatibility. Exports can render fonts/emoji differently between operating systems; the shared souvenir details should remain consistent.
