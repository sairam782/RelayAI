# Relay AI prototype

An interactive client coordinator prototype for small consulting firms and agencies.

## Run locally

Open `dist/index.html` in a browser, or serve the site:

```sh
python3 -m http.server 4317 --directory dist
```

Then open http://localhost:4317.

No package installation or build step is required.

## Explore

- Today: opportunities, approvals, and upcoming meetings.
- Inbox: edit and approve sample replies or create a new inquiry.
- Client pipeline: inspect clients and update their stages.
- Calendar: book, reschedule, or cancel demo meetings.
- Follow-ups: review drafts or snooze a follow-up.
- Business setup: customize the context used for new inquiry drafts.

## Prototype boundaries

All client data is fictional. Replies use sample templates rather than a live AI model. No emails are sent and no external calendar is connected. Changes live in memory and reset on refresh. Google Fonts requires an internet connection; system fonts provide a fallback.

## Files

- `dist/index.html`: app shell and metadata.
- `dist/styles.css`: responsive layouts and theme.
- `dist/app.js`: sample data and interactive flows.
- `.openai/hosting.json`: existing Sites project identity and static output configuration.

The hosting manifest contains no credentials. This local repository has no remote configured.
