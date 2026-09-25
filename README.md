# Relay

A client coordinator for consultancies and agencies too small to hire an SDR.

Relay reads every inbound inquiry, drafts the reply in the owner's voice, offers times
that are actually free, and waits for approval before anything moves. This repository is
the working prototype plus its product overview page.

**The wedge:** the average B2B inquiry waits ~42 hours for a reply, 78% of buyers hire
whoever answers first, and up to 73% of inbound leads are never contacted at all. The
firms with the worst response times — 84% of the 50,025 US marketing-consulting
establishments have fewer than five staff — are the ones no vendor is building for.

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
  your minimum project size, and shows what it extracted with a confidence score.
- **Drafts a reply** in one of three tones that names their goal, handles the budget
  question honestly, skips questions the message already answered, and offers two open
  slots from the real calendar state.
- **Books meetings** with weekday and business-hour validation, conflict detection and
  one-meeting-per-client enforcement.
- **Tracks a pipeline** across six stages with weighted value, win rate and a stage funnel.
- **Queues follow-ups** with snooze, and keeps an activity log.
- **Models the revenue impact** of your own response time against published benchmarks.
- **Hands off for real**: `mailto:` into your mail client, `.ics` download for a booking,
  and JSON export/import of the whole workspace.

Changes persist to `localStorage` for the current day, so a demo survives a refresh.
Reset demo clears it.

## Boundaries

Stated plainly, because the prototype is shown to people making decisions:

- Drafting is a **deterministic rules engine running in the browser**, not a live model.
  `analyze()` and `draftFor()` in `dist/app.js` are the seam — production swaps `draftFor`
  for a model call behind the same approval gate, with the same inputs and outputs.
- No email is sent, no calendar is connected, no account system exists.
- All client data is fictional. Nothing leaves the browser.
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

## Benchmark sources

Directional secondary aggregations, to be replaced with primary citations:

- Lead response time and first-responder share — <https://greetnow.com/blog/lead-response-time-statistics>, <https://leadresponse.co/blog/speed-to-lead-statistics>
- US marketing-consulting establishment counts — <https://www.anythingresearch.com/industry/Marketing-Consulting-Services.htm>
- Competitor positioning and funding — <https://www.11x.ai/guides/artisan-vs-regie-ai-vs-11x>
- Incumbent pricing — HoneyBook, Dubsado and Moxie public pricing pages, 2026

The impact model is deliberately conservative: it assumes faster replies recover only the
share of inbound that research attributes to waiting, and applies your own close rate to
that share. It does not assume the close rate itself improves.
