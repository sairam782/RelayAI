# Relay

A client coordinator for consultancies and agencies too small to hire an SDR.

Relay reads every inbound inquiry, drafts the reply in the owner's voice, offers times
that are actually free, and waits for approval before anything moves. This repository is
the working prototype plus its product overview page.

**The starting hypothesis:** a focused inquiry-to-follow-up workflow can help small U.S. consultancies and agencies spend less time coordinating new business. Competitors already serve parts of this market. Validate time saved, qualified meetings, and willingness to pay through interviews and pilots.

## Run locally

Serve `dist/` with any static server and open the root, or open `dist/index.html`
directly in a browser. No install and no build step.

```bash
node scripts/serve.js
```

## Deploy

Vercel, zero config. `vercel.json` sets `dist` as the output directory, turns on clean
URLs, and sends security headers including a CSP.

```bash
npx vercel --prod
```

The product overview is served at `/`, the prototype at `/app`. After the first deploy,
change the two `og:image` / `twitter:image` tags in `dist/index.html` from the relative
`og.png` to the full `https://<your-domain>/og.png`, so link previews resolve everywhere.

## Product walkthrough

The landing page opens with a silent, 40-second animated walkthrough of an inquiry, qualification, reply approval, meeting, and follow-up. It includes play/pause, replay, a seek bar, chapter controls, captions, and a text transcript. Playback starts only when requested and pauses when the browser tab is hidden.

## What the prototype does

- **Reads an inbound message** for budget, timeline, service line, intent and fit against
  your minimum project size, and shows the extracted details as a rule-based reading.
- **Drafts a reply** in one of three tones that names their goal, handles the budget
  question honestly, skips questions the message already answered, and offers two open
  future slots from the sample calendar state, using Eastern time.
- **Books meetings** with weekday and business-hour validation, conflict detection and
  one-meeting-per-client enforcement.
- **Tracks a pipeline** across six stages with weighted value, win rate and a stage funnel.
- **Queues follow-ups** with snooze, and keeps an activity log.
- **Explores a business-case scenario** using explicitly stated, unvalidated recovery assumptions. The outputs are additional gross project fees, not profit or measured product results.
- **Hands off for real**: `mailto:` into your mail client, `.ics` download for a booking,
  and JSON export/import of the whole workspace.

Changes persist to `localStorage` for the current day, so a demo survives a refresh.
Reset demo clears it.

## Boundaries

Stated plainly, because the prototype is shown to people making decisions:

- Drafting is a **deterministic rules engine running in the browser**, not a live model.
  `analyze()` and `draftFor()` in `dist/app.js` isolate the drafting logic. Production also requires secure backend integrations, background processing, and evaluated model behavior behind the approval gate.
- No email is sent, no calendar is connected, no account system exists.
- Seed client data is fictional. Workspace data stays in the browser unless you explicitly export it or open a draft in your mail app. Google Fonts is fetched externally.
- Client messages are treated as data, never as instructions — an inbound email cannot
  cause Relay to act. That property has to survive the move to a real model.

## Files

- `dist/index.html`, `dist/landing.css` — product overview at `/`
- `dist/landing-demo.js` — interactive product walkthrough (no video service required)
- `dist/app.html` — prototype shell
- `dist/app.js` — state, inference, views, actions (single file, no build)
- `dist/styles.css` — app styles
- `dist/og.png` — link preview image
- `vercel.json` — static output, clean URLs, security headers
- `scripts/serve.js` — dependency-free local server
- `.openai/hosting.json` — existing Sites project identity

## Validation

```sh
node scripts/checks.js
```

The dependency-free checks cover workspace validation, draft recovery and persistence, concurrent simulated inquiries, booking conflicts, timezones and daylight saving time, calendar exports, and business-case bounds. The local server applies the headers from `vercel.json` so browser checks use the deployment CSP.

## Business-case assumptions

The Impact view is illustrative. Its delay-loss tiers (0%, 3%, 8%, 14%, 18%) are product assumptions, not research-derived coefficients. It assumes all delayed inquiries are recovered and applies the same close rate to reachable inquiries in both scenarios. Validate the assumptions before using the outputs to make a business decision.
