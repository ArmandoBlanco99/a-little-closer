# A Little Closer — playable local prototype

A real two-player cooperative browser game. No npm packages, API keys, or external database are required. Requires **Python 3.10 or newer**. All game assets are bundled and work offline once downloaded.

## Start on Windows

1. Extract this entire ZIP into a folder.
2. Double-click `start-windows.bat`. Keep its terminal window open.
3. The browser opens automatically. Normally the address is **http://localhost:8080**. If Windows blocks that port, the launcher picks an available one and prints/opens its actual URL. Use that same URL in both tabs.

If Python is not installed, install Python 3 from https://www.python.org/downloads/ and run the launcher again.

## Start on macOS / Linux

Open a terminal in the extracted folder and run:

```sh
python3 server.py --auto-port --open-browser
```

Then open the URL printed in the terminal (normally **http://localhost:8080**). Stop the server with Ctrl+C.

If port 8080 is already occupied, run `python3 server.py --port 8081` and use http://localhost:8081 instead (on Windows use `py -3`).

## Test both players on one computer

1. Open the URL printed by the launcher and create a room with a name, city, and avatar.
2. Copy the six-character room code.
3. Open a **new blank tab** or another browser, enter that same URL, and choose **Join a room**.
4. Enter a second name and city and paste the code.
5. Tap Ready in both tabs. Switch between them to read each private clue.

Do not use Duplicate Tab: browsers can copy the first tab's player session. If that happens, open a fresh tab manually. The original tab retains its own player seat after refresh. Clicking Exit forgets that tab's seat; it does not delete the room.

For the real-time Paper Plane chapter, use two players on separate devices, or choose **Try Paper Plane solo** on the setup screen. Practice provides an automatic copilot and lets you try steering, firing, and shields; it does not earn the four-chapter postcard. Lantern Trails, Bridge Maze, and Our Constellation can be tested by switching between two tabs.

After updating, restart the server and refresh your tabs. **Create a new room to play the revised chapters.** Existing saved rooms retain the original minigames and progress. Their Lantern Duet still supports **Keep my lantern lit** for sequential tab testing.

## Test on two devices on the same Wi-Fi

Keep the server running on the computer. The launchers listen on all network interfaces by default; if you started with `--host 127.0.0.1`, restart with `--host 0.0.0.0`. Find the computer's local IPv4 address (Windows: `ipconfig`; macOS: System Settings → Network → Wi-Fi → Details → TCP/IP). On the other device open **http://COMPUTER-IP:ACTUAL-PORT**, using the port printed by the launcher. Allow Python on your private network if your firewall asks. Create/join the same room using the room code.

`localhost` always refers to the device opening the URL. A phone must use the computer's LAN address, not its own localhost.

## Playing from different cities

This package is the local-testing milestone. A room code does not connect separate local servers over the internet. Both people must reach the **same running server**. Internet hosting or an HTTPS tunnel is needed for long-distance testing; that deployment is not included in this local-only version.

## Rules

- **Paper Plane Delivery:** one player steers with ↑/↓ or W/S; the other fires with Space and shields with E. Touch controls are also available. Collect at least three of five stamps and deliver the letter. Pellets clear rocks; clouds require dodging or a shield. Bumps cause a small setback, not a lost life. If you reach the end without enough stamps, collected stamps carry into another pass. Complete two flights, swapping roles. Relaxed flight speed is available in the lobby.
- **Lantern Trails:** navigate three misty gardens. You can see your partner's safe route, while your own is hidden. Describe directions and move with arrow keys, WASD, or the on-screen pad. Later gardens introduce switch lanterns that open the partner's gate and fireflies to collect. Thorns return you to your last lit checkpoint.
- **Bridge Maze:** move separate companions through three island crossings. One stands on a pressure plate while the other crosses to a lever, which permanently opens the matching gate. Later crossings add a second gate and a rotating bridge. Both companions must reach the flag.
- **Our Constellation:** trade private positional clues and choose separate endpoints to draw a kite, a sailboat, and a heart. Each drawing contains several ordered threads. Wrong guesses preserve finished threads. Each completed drawing glows and reveals its name; both players choose **Continue together** before the next drawing (or **Celebrate our journey** after the heart). All three drawings also appear in the final celebration.
- Each chapter closes 25% of the original city-center distance. No lives or hard deadlines. Restarting a puzzle keeps earlier completed puzzles.
- Both players must confirm moving to the next chapter. Pause whenever needed. A missing connection pauses play after about six seconds; both confirm resuming.
- Finish all four chapters to download a 1600 × 1100 PNG postcard with your city map and connecting route behind the celebration. Completion dates use **UTC** in this prototype, explicitly labeled on screen and on the postcard.

## What's implemented

- Real server-authoritative multiplayer with server-sent events (SSE) and HTTP actions.
- Atomic two-seat admission, unguessable player-session tokens, same-origin action checks, rate-limited join attempts.
- Private role-specific clues; full solutions are never broadcast to both clients.
- Serialized actions, puzzle epochs, idempotency IDs, versioned snapshots, and recovery after refresh.
- SQLite room persistence, 24-hour inactivity expiration, periodic cleanup, and pause on server restart.
- Interactive city map: drag to pan, use +/− to zoom, or choose **Our route** to fit both cities. Keyboard arrows pan, +/− zoom, and 0 resets; Ctrl+wheel also zooms. Animated routes, city lights, drifting clouds, chapter landmarks, and traveling avatars respect reduced-motion preferences.
- Great-circle distance, wrap-aware map route, four earned stamps, same-city handling.
- More than 100 built-in city locations, plus a manual city-center coordinate fallback.
- In-game text chat, quick messages, optional chimes, keyboard/touch controls, reduced motion.
- On phones, chat opens in a dialog with an unread badge; the journey map can collapse during play. Lantern Trails has separate My trail and Partner's map views.
- Downloadable postcard, with native mobile sharing when the browser supports it.

## Scope and next iteration

This local prototype uses a dependency-free Python server, SQLite, and plain browser JavaScript. New rooms use the second edition of the journey; older saves keep the first edition. Flight runs on the server at roughly ten updates per second and renders in a browser canvas. Visual assets are bundled emoji, code-drawn scenes, and a Natural Earth map. More varied levels, richer artwork/audio, broader city search, and internet deployment remain future work.

This is a small local development server, not a production hosting configuration. Player credentials live in the browser tab's session storage; authoritative room progress lives in `rooms.sqlite3`. Clearing the tab session loses its seat. The database includes names, cities, and chat messages. Delete `rooms.sqlite3` while the server is stopped to reset all rooms.

## Verification

Run the server/state and HTTP integration tests:

```sh
python3 -m unittest -v test_game.py test_adventures.py
```

On Windows use `py -3` in place of `python3`. Tests use isolated temporary SQLite databases. They cover both editions' full journeys, level solvability, private clues, flight physics and roles, gates and levers, practice, retries, duplicate actions, admission, persistence, and HTTP/SSE.

Optional browser smoke checks use an installed Chrome/Edge with an isolated temporary profile and an in-memory game database:

```sh
py -3 test_browser.py
```

These check two player sessions, keyboard/touch controls, mobile layout, map interaction, reconnect, practice, and postcard rendering. The smoke test selects chapters directly and intercepts the download; use the full journey check for uninterrupted gameplay and actual file saving:

```sh
py -3 test_journey.py
```

The full check drives two browser seats through all four chapters against a separate server with a disposable SQLite database. It checks chapter distance reductions, chat, admission, a real disconnection and server restart, and matching PNG downloads from both seats. Allow several minutes. Synthetic screenshots and postcards are written to `artifacts/`.

See [VERIFICATION.md](VERIFICATION.md) for recorded results and limits. Physical iPhone/Safari audio, keyboard, saving/sharing, and a timed two-person playtest remain manual checks; use [PLAYTEST.md](PLAYTEST.md). The souvenir uses kilometres and UTC consistently for both players, even if a player changes the on-screen distance to miles.

## Files

- `server.py`: HTTP/SSE server and authoritative game logic.
- `adventures.py`: second-edition flight simulation, garden, bridge, and star rules.
- `public/app.js`: client UI, controls, geographic map, and postcard renderer.
- `public/adventures.js`: new chapter rendering and input controls.
- `public/journey-map.js`: interactive map and postcard map rendering.
- `public/cities.js`: bundled city-center lookup.
- `public/style.css`: responsive interface.
- `public/adventures.css`: chapter boards and interactive map styling.
- `public/mobile-ui.js` and `public/mobile.css`: mobile chat, compact map/boards, touch targets, and focus styling.
- `public/world.geojson`: Natural Earth land geometry.
- `test_game.py`: functional and integration tests.
- `test_adventures.py`: revised chapter solvability and regression tests.
- `test_browser.py`: optional real-browser smoke checks, no package installation needed.
- `test_journey.py`: complete browser journey, real server recovery, and actual postcard downloads.

## Map attribution

Made with Natural Earth. Free vector and raster map data at naturalearthdata.com. Public domain land geometry, 1:110m resolution, sourced from https://github.com/nvkelso/natural-earth-vector/blob/master/geojson/ne_110m_land.geojson.

## Continuing in VS Code
Open this folder with File → Open Folder. Read `DEVELOPMENT.md` for project context and the Windows startup fix. The source has a local Git checkpoint on `main`; `.gitignore` excludes local game data and credentials. No remote is configured or published yet.
