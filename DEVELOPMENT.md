# Handoff for local development with Codex

## Goal
A Little Closer is a real-time, two-player cooperative web game for long-distance couples. Each enters a name, city, and avatar and joins using a six-character room code. Four cooperative minigames progressively close the displayed city-to-city distance. Victory includes an interactive celebration and downloadable postcard.

## Current implementation
The core loop exists in Python 3.10+ standard library and plain browser JavaScript. No packages, API keys, or external services are required. SQLite is authoritative; HTTP actions mutate state and SSE delivers role-specific snapshots. This was chosen to make local testing easy. React/TypeScript and Supabase were discussed for a future hosted version, but are not implemented dependencies.

Application paths below are relative to `a-little-closer/`; all test files live in `tests/`. Run commands from the repository root. Root launchers and Makefile remain the entry points. The ignored default database remains at repository-root `rooms.sqlite3`, including when launched from another working directory; do not move an active database.

- server.py: authentication, two-seat rooms, first-edition rules, persistence, pause, HTTP/SSE.
- adventures.py: second-edition rules, role-specific snapshots, flight physics, level layouts.
- public/app.js: setup, room UI, legacy games, chat, celebration, postcard.
- public/adventures.js: second-edition boards, canvas flight, keyboard and touch input.
- public/flight-motion.js: per-frame smoothing and bounded prediction between authoritative flight snapshots.
- public/journey-map.js: draggable/zoomable map, route fitting, postcard map layer.
- public/mobile-ui.js and public/mobile.css: chat dialog/unread count, compact map and lantern boards, touch/focus styling.
- public/cities.js: built-in locations with manual-coordinate fallback.
- public/style.css: responsive prototype styling.
- test_game.py and test_adventures.py: both complete journeys, privacy, physics, solvability, persistence, concurrency, HTTP/SSE, startup fallback.
- test_browser.py: isolated Chrome/Edge smoke checks using Python stdlib and DevTools, saving synthetic screenshots under artifacts/.
- test_journey.py: separate server and disposable SQLite database; browser UI drives every chapter without injecting progress, including actual disconnect/restart and native PNG downloads.

## Current issue and fix
The user runs Windows 11/10, Python 3.12, and VS Code. Startup on port 8080 produced PermissionError [WinError 10013] at socket.bind. The exact Windows cause has not been confirmed. The launchers now pass --auto-port: if the requested port is blocked or occupied, the OS assigns an available port and the actual URL is printed/opened. Explicit --port 0 also works. Other errors receive a readable message. Do not change firewall or system port reservations automatically.

## Start and test
Windows: `py -3 a-little-closer/server.py --host 127.0.0.1 --auto-port --open-browser`
macOS/Linux: `python3 a-little-closer/server.py --auto-port --open-browser`
Tests: `py -3 -m unittest discover -s tests -t . -v`
Browser smoke checks: `py -3 -m tests.test_browser` (installed Chrome or Edge required).
Complete browser journey: `py -3 -m tests.test_journey` (several minutes).

Shortcuts: `make run`, `make lan`, `make test`, `make test-browser`, `make test-journey`, and `make check`. Make chooses the platform Python launcher; override `PYTHON` or `PORT` when needed. GitHub Actions defines Windows/Linux regression checks and Ubuntu browser checks; remote CI results must be checked after publishing the workflow.

For LAN play, use --host 0.0.0.0 and open http://HOST-LAN-IP:ACTUAL-PORT on the phone. Both players must reach the same server. For same-PC tests use a new blank tab, not Duplicate Tab (which can copy sessionStorage). Refresh retains a seat.

New rooms have `edition: 2` and use Paper Plane Delivery, Lantern Trails, Bridge Maze, and expanded constellations. Existing saves without that marker keep their original rules and UI; do not delete or silently migrate user progress. Restart the server and create a new room to try the new journey.

Paper Plane has two flights with swapped pilot/copilot roles, server-owned movement/collisions, expiring steering input, pellet and shield cooldowns, and at least three stamp seals per delivery. The watchdog runs at 10 Hz; active flight SSE updates at 10 Hz, other chapters at roughly 3 Hz. Physics clamps elapsed time after stalls. Pausing, disconnecting, and restarting clear steering. SQLite persists snapshots; this favors local simplicity over large-scale throughput.

The client now smooths horizontal and vertical flight positions on animation frames, predicts at most 120 ms, ignores duplicate snapshot clocks, and resets visual motion on scene changes, launch/stop and bumps. Visual prediction never awards stamps or determines collisions. Discrete controls use `touch-action: manipulation` to suppress accidental double-tap zoom while keeping page pinch zoom. Held flight controls and map dragging keep their existing pointer handling.

Practice rooms have an automatic copilot, remain limited to two flights, and cannot earn the full-journey postcard. Garden/bridge/star controls are discrete and work when switching tabs. Garden snapshots contain only the other player's full route. Star snapshots contain only the other endpoint's clue, plus the player's own selection and a boolean for the partner. Preserve those boundaries.

Legacy Lantern Duet still supports **Keep my lantern lit**. Pause, disconnect, restart, and a new puzzle clear holds; changing a symbol clears that player's hold.

Second-edition constellations retain their completed board in `adventure.complete` until both players send `continue_stars`. The reveal and per-player confirmations persist across refresh/restart; the third reveal precedes victory. Completed boards reject further guesses/retries to avoid duplicate keepsakes. Bridge levers use inline SVG rather than a font-dependent symbol.

The browser closes SSE and releases held controls on `pagehide`, then reconnects on a persisted `pageshow`. Without that cleanup, browser history caching can leave a departed player's stream alive and prevent the partner's disconnect pause. Keep the browser navigation regression check.

## Next work
The user tested on phones over Wi-Fi: chat and postcard were okay, other levels ran well, but flight looked laggy and repeated taps zoomed the page. The smoothing and touch-action changes need a physical iPhone retest. Continue PLAYTEST.md for measured session duration, audio, keyboard edge cases, and native HTTPS sharing. VERIFICATION.md separates automated evidence from user reports. No 12–18 minute duration has been established.

The intended aesthetic is an illustrated twilight travel scrapbook, animal avatars, warm route lines and low-stress feedback. Current avatars are emoji; they travel along the map and react to hearts in the celebration. Richer artwork remains future work. Phone chat moves the existing conversation into a native dialog; opening it releases held game controls. Postcards use canonical kilometres and UTC, separate full city-name lines, and abbreviated labels within the map.

## GitHub and deployment
.gitignore excludes rooms.sqlite3 (names, city choices, chat, session tokens), Python caches, environments and secrets. Keep real game data out of source control. The configured origin is `https://github.com/ArmandoBlanco99/a-little-closer.git`, with `main` tracking `origin/main`. Do not force-push or overwrite the remote.

A GitHub repository stores the source. GitHub Pages alone cannot run the current Python/SQLite/SSE server. Multiplayer internet deployment needs a server-capable host with persistence, or a deliberate move to the originally proposed hosted backend. Current code is a local development server, not a production deployment.

The user wants anyone to be able to open a public link, and both primary testers use iPhones. Deployment discussion follows local readiness: compare keeping the Python backend with a managed backend, including HTTPS, persistent rooms, live connections, reconnects, public traffic limits, data retention, and current costs. Do not provision services until the hosting approach is selected. Then test using two separate networks.

DEPLOYMENT.md compares ChatGPT Sites, Netlify and Render. The recommendation is a single Python web service with persistent SQLite storage for the initial audience; neither suggested course platform runs this Python server unchanged. Hosting has not been selected or provisioned.

Room snapshots never include another player's token or private clue. Preserve that boundary. No accounts, individual scoring, lives, hard deadlines, or built-in voice/video are planned for this prototype. Date on souvenirs is UTC for now.
