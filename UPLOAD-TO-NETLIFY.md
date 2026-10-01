# Publish A Little Closer

The ZIP is already saved in the project folder as `netlify-ready-game.zip`, beside this file and the Makefile. You can drag it from Windows File Explorer directly; downloading it from the chat is unnecessary. If it is hard to find in VS Code, use File Explorer: generated ZIPs are excluded from Git.

1. Sign in to a **Netlify Free** account. Stay signed in: the project needs Netlify's build step.
2. Open [Netlify Drop](https://app.netlify.com/drop) and drag **netlify-ready-game.zip** onto it. Upload the complete ZIP, not just the frontend folder.
3. Wait for the build and deployment to finish, then open the generated HTTPS link. If your team defaults to private projects, change this project's visibility to public in Netlify so your partner can open it.
4. Create a room and share its six-character code. Your partner opens the same website and joins. For the first hosted test, use one iPhone on Wi-Fi and the other on cellular.

No GitHub connection, terminal commands, API keys, environment-variable entry, or database setup is needed. Netlify installs the locked dependencies, builds the frontend, bundles the `game` function, and supplies Blobs storage access automatically. The ZIP is the complete source project; Netlify builds the function during upload. It is not a static-only website ZIP.

The Free plan has usage limits. Netlify pauses projects when the allowance is used up; this is suitable for trying the game with a small audience, not a promise of unlimited play. Keep the Free plan if you do not want paid hosting. [Current plan details](https://www.netlify.com/pricing/personal-vs-free/).

If setup opens but creating a room fails, confirm you uploaded while signed in, that the deploy build succeeded, and that the project's Functions page lists `game`. Do not add redirects or keys. The browser calls `/.netlify/functions/game` directly.

All four cooperative chapters and the shared postcard are preserved. The serverless version creates new online rooms; your computer's existing SQLite saves stay local. A room stops accepting requests after 24 hours without activity. Personal fields are erased if an expired room is accessed; untouched inactive records remain in Blobs until removed by the site owner.

Local packaged-function and browser checks are described in [VERIFICATION.md](VERIFICATION.md). Public Netlify latency, quotas, physical iPhone behavior, and sharing still need the first hosted playtest.

Netlify documents signed-in source-project builds and ZIP uploads in its [Drop quickstart](https://docs.netlify.com/start/quickstarts/netlify-drop-quickstart/).
