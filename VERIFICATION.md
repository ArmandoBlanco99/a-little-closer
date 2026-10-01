# Local verification

## Netlify migration — September 30, 2026

The deployment target now preserves four cooperative chapters and the shared ending, as requested. No competitive scoring or individual winner was added.

| Check | Result |
| --- | --- |
| Serverless rules and storage contract | `npm test`: 7 passing tests. Complete two-player journey, both solo practice flights, shared completion data, private clues/tokens, concurrent admission/actions, deduplication, conflict retries, missing-ETag rejection, validation, expiry, authoritative flight timing, disconnect and cold-instance recovery. |
| Production build | `npm run build`: browser assets in `dist` and one standard `game` function packaged by Netlify's official bundler, targeting Node 22. No custom route or redirect. |
| Actual function archive | `npm run test:package`: extracted compiled function invoked with the real Blobs SDK and disposable official local storage. Concurrent ready/chat actions and saved data after a runtime restart pass. Production browser code calls `/.netlify/functions/game` directly. |
| Upload ZIP | Fresh extraction, `npm ci`, production build, and packaged-function checks all pass. The archive contains 45 source files with root configuration and lockfile; no dependencies, saves, caches, logs, or generated output. Its files match the workspace source. |
| Full production browser journey | `py -3 -m tests.test_journey --netlify`: passing. Two browser seats drive both flights, all three lantern trails, all three bridge mazes and all three constellation reveals through UI controls. Checks third-seat rejection, Unicode profiles, chat, chapter progress, genuine page departure and server restart, and identical 1600 x 1100 postcards downloaded by both players. No captured browser errors. |
| Local Python compatibility | 24 regression tests and the Chrome browser smoke suite pass after the shared frontend transport extraction. Existing local SQLite data is untouched. |

Build environment: Windows, Node 22.23.3, Python 3.12.10, Chrome 153. Dependencies are locked in `package-lock.json`. Test data is synthetic. Netlify screenshots and downloaded postcards are under ignored `artifacts/netlify/`.

The Blobs SDK filesystem emulator does not make its check/write sequence atomic and omits GET ETags. The test-only adapter serializes individual storage requests and supplies the emulator's listed ETag. Function requests remain concurrent. The application also fails closed when a version is missing; atomic-store tests independently exercise conflicts. These checks do not substitute for hosted Netlify concurrency/latency testing.

The first complete browser attempts hit a DevTools timeout during repeated flight clicks. The final run explicitly returns a primitive from that automation expression and completes all chapters. No game progress is injected and the real-time clock is not accelerated in the browser test.

Netlify has not been provisioned or deployed. The first public upload still needs a two-network iPhone playtest, especially flight latency, background recovery, rapid taps, audio, and native HTTPS sharing. Free-plan capacity and a monthly play count have not been measured.

## Earlier local readiness checks

Readiness work for the approved revised journey. Test data is synthetic; the real `rooms.sqlite3` is not used by these checks.

Recorded September 30, 2026 on Windows, Python 3.12.10 and installed Chrome 153.0.8010.54. Browser automation uses isolated profiles and the Python standard library, with no installed test packages.

| Check | Evidence and limits |
| --- | --- |
| Server/state/HTTP regression suite | `make test`: 24 passing tests. Both editions' complete state journeys, private clues, movement/physics, gate cooperation, incorrect guesses, duplicate/stale actions, old lantern holds, admission, expiry, persistence, HTTP/SSE, and the reorganized default database/asset paths. |
| Windows startup | Regression covers permission-error fallback to an OS-assigned port, actual ephemeral binding, and matching printed/browser-open URLs. Browser tests start actual local HTTP servers. This does not diagnose the original Windows port restriction or alter network settings. |
| Browser smoke suite | `py -3 -m tests.test_browser`: passing. Two seats, keyboard and simulated touch, mobile widths, bridge SVGs, constellation reveal/confirmation, map controls, refresh, real page departure/resume, practice, no captured JavaScript errors. Selects chapters directly; intercepts postcard download to inspect rendering. |
| Complete UI journey | `py -3 -m tests.test_journey`: passing. Two real-time flights with swapped roles, all three lantern trails, all three bridge crossings, and all three constellation reveals through UI controls, without chapter injection or clock changes. Checks invalid city input, third-seat rejection, chat/unread/focus, repeated submissions, wrong star guesses, chapter distance reductions, actual page disconnect, server-process restart with saved progress/chat, and matching 1600 x 1100 PNG files downloaded from both seats. No captured JavaScript errors or server tracebacks. |
| Visual review | Synthetic screenshots of the mobile flight/bridge, desktop boards, and Unicode postcard reviewed. Portrait controls, map collapse, SVG levers, chat access, focus outlines, and full souvenir city names are visible. |
| Source control exclusions | `git check-ignore` confirms database/sidecars, environment files, Python caches, virtual environments, and artifacts are ignored. Origin is the user's `ArmandoBlanco99/a-little-closer` repository. |

## Phone feedback and follow-up

The user tested on phones over the same Wi-Fi and reported chat and postcard working, the other levels running well, flight looking laggy, and repeated taps zooming the page. This is user-reported device evidence, not an automated Safari run.

The follow-up adds frame-by-frame flight smoothing with at most 120 ms prediction, duplicate-snapshot handling, stall bounds, collision correction and reset coverage. Deterministic browser checks observed 55 changing vertical frames in a 60-frame run (maximum step about 4.34 pixels), rather than only moving at server tick boundaries. This measures the rendering algorithm, not physical iPhone frame rate. Browser checks also verify the touch-action policy and that pinch zoom remains enabled. Both fixes still need an iPhone retest.

The Makefile help, local/LAN commands and test targets were exercised. GitHub Actions is configured for Windows/Linux and two Python versions plus Chromium browser journeys; its first hosted run remains pending publication. Local tests ran on Windows/Python 3.12.

## Changes from this pass

- Mobile conversation dialog with unread badge, input focus, Escape/close return, and release of held controls when opening it.
- Collapsible phone map, one lantern chart at a time, larger touch targets, clearer focus and supporting text.
- Reduced decorative canvas motion; essential flight movement remains visible. Celebration companions react to hearts with a static glow when reduced motion is enabled.
- Separate full city-name lines and bounded map labels on the postcard. Both players export the original distance in kilometres and the completion date in UTC, regardless of their on-screen unit preference.
- Continuous land polygons across the map seam, checked with a Pacific route. Wrapping individual polygon vertices previously produced a large triangular land artifact on the postcard.
- Explicit `pagehide` cleanup of SSE and held controls, plus reconnection on a cached `pageshow`. The browser navigation check initially exposed a departed page remaining online; the focused regression now passes.

## Still needs people/devices

- Physical iPhone retest of flight and rapid taps; explicit checks of software keyboard, audio activation, dynamic viewport/text sizing, background/lock recovery, and native sharing over HTTPS. The user already reported chat and postcard okay during LAN play.
- A timed two-person playtest: the proposed 12–18 minutes and difficulty/enjoyment are not established by scripted completion. Follow [PLAYTEST.md](PLAYTEST.md).
- Public hosting and separate-network testing. The user chose a public link for anyone, with two iPhones as the primary test devices. No service has been provisioned or published.
- Review the first hosted CI run after pushing the reorganized source to the configured repository. Game data stays ignored.

Automated Chromium screenshots and pointer events are not evidence of physical Safari compatibility. Exports can render fonts/emoji differently between operating systems; the shared souvenir details should remain consistent.
