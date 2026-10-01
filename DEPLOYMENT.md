# Netlify deployment

The selected deployment is **Netlify Functions + Netlify Blobs**, using Netlify Free for initial light use. Follow [UPLOAD-TO-NETLIFY.md](UPLOAD-TO-NETLIFY.md) to upload the complete `netlify-ready-game.zip` while signed in. No Git connection, local commands, entered secrets, or manual database setup is required to publish. Netlify's current [Drop quickstart](https://docs.netlify.com/start/quickstarts/netlify-drop-quickstart/) supports source ZIPs and performs builds for signed-in uploads.

## What is deployed

- `netlify.toml` selects `npm run build`, `dist`, and `netlify/functions`.
- `netlify/functions/game.ts` is the only function. It uses the standard Request/Response API and automatically supplied Netlify Blobs credentials.
- `a-little-closer/netlify/` holds the authoritative rules and storage service. Helpers are outside the function directory.
- The production build copies bundled browser assets into `dist` and selects the Netlify transport. The frontend calls `/.netlify/functions/game` directly. There is no custom function path or API redirect.
- A site-wide store preserves rooms across function cold starts and new deployments. Strong reads obtain ETags; conditional writes use `onlyIfNew` for creation and `onlyIfMatch` for updates. Conflicts re-read and re-evaluate actions, with bounded retries and deduplicated action IDs. Missing storage versions fail closed.

See the official [Functions API](https://docs.netlify.com/build/functions/api/) and [Blobs API](https://docs.netlify.com/build/data-and-storage/netlify-blobs/).

## Gameplay and operating limits

All four cooperative chapters remain: two paper-plane flights, three lantern trails, three bridge mazes, and three constellation reveals followed by the shared ending. There is no competitive score or individual winner. This follows the user's choice instead of the course template's three-round competitive example.

There is no continuously running production server or timer. Requests advance flight physics using elapsed server time in bounded steps; client positions, timestamps, and completion claims are ignored. Browsers poll faster during flight and more slowly elsewhere, with only one state poll in flight per player. The existing visual smoothing remains. A flight gap over two seconds or missing player heartbeat pauses play; both players choose Ready to resume. This avoids runaway movement during interruptions but cannot guarantee the same latency as a nearby Python server.

Rooms allow two seats, random bearer tokens, private role-specific snapshots, bounded messages/action history, and limited create/join attempts per IP. Rooms expire after 24 hours without activity. The next access replaces an expired room with a tombstone that removes personal fields. This is access expiry, not scheduled deletion: untouched old rooms and hashed admission counters remain in storage. The site owner can remove stored data in Netlify. Names, locations, chat, and tokens never enter the upload ZIP.

Netlify Free currently includes 300 credits per month and pauses projects when the allowance is exhausted. Builds, requests, compute, and storage-related use must stay within applicable plan limits. Flight polling consumes more requests than a static website. No production load capacity or free monthly play count has been established. [Free plan explanation](https://www.netlify.com/pricing/personal-vs-free/).

## Developer checks (optional; not needed to publish)

With Node 22.12+ in the 22.x line:

```text
npm ci
npm test
npm run build
npm run test:package
python -m tests.test_journey --netlify
npm run package
```

The build invokes Netlify's official function bundler as well as preparing the static frontend. Package checks unpack that actual archive and invoke its compiled game entrypoint with Netlify's SDK and disposable local Blobs storage. The official filesystem emulator needs a test-only adapter for atomic storage operations and missing GET ETags; this adapter is not deployed. Production uses Netlify directly. Concurrency is also covered independently by the atomic store tests.

The Python backend and root launchers remain available for offline/LAN development and existing SQLite saves. They are included as source in the project ZIP but are not deployed or run by Netlify. The production publish directory contains only browser assets. Online rooms are separate from local saves.

## First hosted check

No site has been provisioned or deployed from this workspace. After upload, verify that the build succeeds, the `game` function is listed, and the link is public. Play the complete journey with one iPhone on Wi-Fi and the other on cellular; check flight responsiveness, repeated taps, chat, background/resume, and postcard download/sharing over HTTPS. Local Chromium tests do not establish Safari behavior or hosted Blobs latency.
