# Hosting decision

Recommendation for this version: one Python web service on Render, with persistent storage for SQLite. This keeps the frontend, actions, and live event streams on one origin, and preserves the existing game rules. It still needs production preparation before opening to public traffic.

Between the two course suggestions, Netlify is the better fit for a GitHub-first frontend workflow **with a separate game backend**. Neither is an unchanged deployment of this Python process.

| Option | Fit for the current game | Work required |
| --- | --- | --- |
| ChatGPT Sites | Managed hosting with supported app runtime, D1 structured storage, and R2 files. Official guidance describes static sites through full-stack JavaScript/TypeScript apps. | Port/adapt the Python room rules, simulation loop, persistence and live-session coordination. Validate that hosting pattern before promising multiplayer reliability. |
| Netlify | Can host the HTML/CSS/JS frontend. Its request functions use ephemeral execution; streaming functions have a 60-second limit. | Keep an independent long-running backend, or redesign the authoritative game loop and state storage. A frontend-only deploy will display setup but cannot create multiplayer rooms. |
| Render web service + disk | Python runtime and a persistent filesystem fit the existing room server. | Prepare production HTTP serving, host/port configuration, graceful shutdown, bounded connections/requests, backups, and public load checks. Keep a single authoritative process for this edition. |

Sources checked September 30, 2026: [Sites](https://learn.chatgpt.com/docs/sites), [Sites application scope](https://learn.chatgpt.com/use-cases/build-and-deploy-internal-apps), [Netlify Functions](https://docs.netlify.com/build/functions/overview/), [streaming limits](https://docs.netlify.com/build/functions/api/), [Render web services](https://render.com/docs/web-services), [persistent disks](https://render.com/docs/disks).

## Budget and tradeoffs

Render lists its small 512 MB paid web-service compute at $7/month and persistent disks at $0.25/GB/month. On the $0 Hobby workspace plan, a small service with a 1 GB disk would therefore start around **$7.25/month**, before taxes, bandwidth/build overages, and optional domains. Confirm current pricing before purchase. Free web services cannot attach persistent disks, so they are not the recommended home for these saved rooms. [Pricing](https://render.com/pricing), [cost guide](https://render.com/articles/how-much-does-cloud-application-hosting-cost-for-small-businesses).

A disk supports one service instance and prevents zero-downtime deployments. The current in-memory room coordinator also assumes one process; adding workers or replicas without redesign would split live state. For an initially small public audience, this is simpler than a backend migration. Larger traffic would require measured capacity planning and a shared authoritative room service. [Disk limitations](https://render.com/docs/disks).

Sites is in beta with plan-specific usage limits. A separate Netlify frontend would add a second hosting configuration and require careful routing/authentication for the live backend. These are viable choices if the course requires one of them, but not reasons by themselves to rewrite a working game.

## After the hosting choice

1. Prepare the selected production server while keeping game logic and private clues covered by tests.
2. Bind `0.0.0.0` to the host-provided port, place the database on persistent storage, keep credentials/data out of Git, and define retention/backups.
3. Check HTTPS, live-stream buffering/timeouts, request/connection limits, room admission and restart recovery. Measure capacity before promising public scale.
4. Connect the GitHub repository and provision only the selected services and budget.
5. Test a complete room with one iPhone on Wi-Fi and the other on cellular, including flight responsiveness, reconnect, and postcard sharing over HTTPS.

No hosting service has been provisioned as part of this repository reorganization.
