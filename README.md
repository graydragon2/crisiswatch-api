# CrisisWatch API

Express (ESM) backend for CrisisWatch — aggregates RSS feeds tracking local and global crises, scores/geolocates them with Claude, checks emails against known credential leaks, maintains a keyword watchlist, watches specific zip codes for local weather alerts and news, and emails an alert when something high-severity shows up. Paired with [crisiswatch-frontend](https://github.com/graydragon2/crisiswatch-frontend).

## Setup

```bash
npm install
cp .env.example .env   # fill in the keys below as needed
npm start
```

Runs on `PORT` (defaults to `3001`).

## Environment variables

| Variable | Required | Purpose |
| --- | --- | --- |
| `PORT` | No | Server port (default `3001`) |
| `ANTHROPIC_API_KEY` | Only for `/api/score` and `/api/threats?useAI=true` | Powers Claude-based severity scoring + geolocation. Everything else works without it — `/api/threats` falls back to unscored results if this isn't set or the call fails. |
| `LEAKCHECK_API_KEY` | Only for `/api/darkweb` | Get a free key at [leakcheck.io](https://leakcheck.io) |
| `THREAT_SCORER_MODEL` | No | Overrides the default Claude model used for scoring |
| `SMTP_USER` / `SMTP_PASS` | Only for email alerts | Gmail address + [App Password](https://myaccount.google.com/apppasswords) (requires 2-Step Verification on the account) |
| `ALERT_SCORE_THRESHOLD` | No | Minimum severity (1-10) to trigger an alert email (default `8`) |
| `ALERT_CHECK_INTERVAL_MINUTES` | No | How often to check for new alertable items (default `15`) |

## API

- `GET /api/feeds` / `POST /api/feeds` / `DELETE /api/feeds` — manage the tracked RSS feed list (persisted to `data/feeds.json`).
- `GET /api/keywords` / `POST /api/keywords` / `DELETE /api/keywords` — manage the keyword watchlist (persisted to `data/keywords.json`), used to drive the frontend's "Keywords Alert" widget.
- `GET /api/locations` / `POST /api/locations` / `DELETE /api/locations` — manage the watched zip codes (persisted to `data/locations.json`). `GET` geocodes each zip, pulls active NWS weather/emergency alerts for that point, and pulls a location-scoped local news feed, optionally scored via Claude (`useAI`, `true` by default). No API key needed for the geocoding or NWS lookups — only the optional news scoring uses `ANTHROPIC_API_KEY`.
- `GET /api/threats` — aggregated feed items. Query params: `keywords` (comma-separated), `sources` (comma-separated, matches feed name), `useAI` (`true` by default — attaches `score`/`location`/`coordinates` per item via Claude; set `false` to skip and avoid API usage).
- `GET /api/darkweb?email=...` — checks an email against known breaches via LeakCheck, normalized to `{found, entries}`.
- `POST /api/score` — score a single arbitrary piece of text (`{ text }` body) 1–10 via Claude.
- `GET /api/alerts/settings` / `POST /api/alerts/settings` — read/update email alert settings (`{ enabled, recipient }`, persisted to `data/alerts.json`).
- `POST /api/alerts/test` — sends a test email to the configured recipient immediately.

## Notes

- The Anthropic client is constructed lazily on first use, not at module load — constructing it eagerly throws if `ANTHROPIC_API_KEY` isn't set, which would crash the whole process at startup on any deploy that doesn't have it configured yet.
- `/api/threats`'s AI scoring/geolocation step is wrapped so a failure (missing key, rate limit, etc.) doesn't take down the whole response — it just returns threats without `score`/`location`.
- `nixpacks.toml` pins the Node provider explicitly for Railway deploys — without it, Nixpacks can misdetect this as a Deno project because of a transitive dependency (`@streamparser/json`, pulled in by `@anthropic-ai/sdk`) that declares Deno support.
- Email alerts run on an in-process interval (`setInterval`, not a separate cron job), so they only fire while the server is running continuously — fine on Railway, which doesn't spin this service down, but wouldn't work on a host that sleeps on inactivity. The checker self-fetches its own `/api/threats` and `/api/locations` endpoints over `localhost` rather than duplicating their aggregation/scoring logic.
