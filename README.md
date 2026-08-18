# CrisisWatch API

Express (ESM) backend for CrisisWatch — aggregates RSS feeds tracking local and global crises, scores/geolocates/categorizes them with Claude, checks emails against known credential leaks (on demand or persistently monitored), analyzes emails/messages/URLs/screenshots for phishing risk, maintains a keyword watchlist, watches specific zip codes for local weather alerts and news, emails an alert and raises an in-app notification when something high-severity shows up, and tracks a composite Threat Score over time. Paired with [crisiswatch-frontend](https://github.com/graydragon2/crisiswatch-frontend).

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
| `MONITOR_INTERVAL_MINUTES` | No | How often to check for new alertable items AND record a Threat Score history snapshot (default `15`) |
| `DARKWEB_RECHECK_HOURS` | No | How often to re-check monitored emails for new exposure (default `24`) — independent of `MONITOR_INTERVAL_MINUTES`, since breach data doesn't change minute to minute |

## API

- `GET /api/feeds` / `POST /api/feeds` / `DELETE /api/feeds` — manage the tracked RSS feed list (persisted to `data/feeds.json`).
- `GET /api/keywords` / `POST /api/keywords` / `DELETE /api/keywords` — manage the keyword watchlist (persisted to `data/keywords.json`), used to drive the frontend's "Keywords Alert" widget.
- `GET /api/locations` / `POST /api/locations` / `DELETE /api/locations` — manage the watched zip codes (persisted to `data/locations.json`). `GET` geocodes each zip, pulls active NWS weather/emergency alerts for that point, and pulls a location-scoped local news feed, optionally scored via Claude (`useAI`, `true` by default). No API key needed for the geocoding or NWS lookups — only the optional news scoring uses `ANTHROPIC_API_KEY`.
- `GET /api/threats` — aggregated feed items. Query params: `keywords` (comma-separated), `sources` (comma-separated, matches feed name), `useAI` (`true` by default — attaches `score`/`location`/`coordinates`/`category` per item via Claude; set `false` to skip and avoid API usage).
- `GET /api/darkweb?email=...` — checks an email against known breaches via LeakCheck, normalized to `{found, entries}`.
- `GET /api/darkweb/monitored` / `POST /api/darkweb/monitored` / `DELETE /api/darkweb/monitored` — manage a persistent watchlist of emails (persisted to `data/monitoredEmails.json`). Adding one runs an immediate check; after that, re-checked automatically every `DARKWEB_RECHECK_HOURS`. Each entry carries `status`, `lastChecked`, `found`, `exposureCount`, `riskLevel` (None/Low/Medium/High, a simple documented heuristic on exposure count — not a claim of precise risk scoring), and the breach source names. Never stores passwords or other credentials — LeakCheck's public API doesn't return them either.
- `POST /api/score` — score a single arbitrary piece of text (`{ text }` body) 1–10 via Claude.
- `POST /api/phishing/analyze` — analyzes an email, message, URL, or screenshot for phishing risk via Claude. Body: `{ type: 'email'|'message'|'url'|'screenshot', content, mediaType? }` — `content` is raw text for email/message/url, or base64 image data for `screenshot` (`mediaType` then required, one of `image/png`/`image/jpeg`/`image/webp`/`image/gif`, capped at 5MB decoded). Returns `{ riskScore (0-100), riskLevel (Low/Medium/High/Critical), indicators, summary }`. For `url`, only the URL string's structure is analyzed — the backend never fetches the target page (SSRF risk). Wording is deliberately non-absolute ("shows signs commonly associated with...") — this is a risk signal, not a verdict.
- `GET /api/alerts/settings` / `POST /api/alerts/settings` — read/update email alert settings (`{ enabled, recipient }`, persisted to `data/alerts.json`).
- `POST /api/alerts/test` — sends a test email to the configured recipient immediately.
- `GET /api/notifications` — the in-app notification center's list (persisted to `data/notifications.json`) plus `unreadCount`. Each notification has a `category` of `Critical`/`High`/`Medium`/`Informational`.
- `POST /api/notifications/:id/read` / `POST /api/notifications/read-all` — mark one or all notifications read.
- `DELETE /api/notifications/:id` — clear one notification.
- `GET /api/threat-score` — current composite Threat Score (0-100, band name, 24h/7d deltas) plus a per-category breakdown (Cybersecurity, Geopolitical, Conflict, Public Safety, Infrastructure, Natural Disaster, Other). 503s until the first monitoring cycle has recorded a snapshot.
- `GET /api/threat-score/history?range=24h|7d|30d|90d` — time-series score points for that range, plus best-effort insights (peak day, busiest time-of-day window, % change, trend direction) once enough history exists.
- `GET /api/stats` — dashboard summary counts: active critical alerts (+ new today), breaking news in the last 24h.

## Notes

- The Anthropic client is constructed lazily on first use, not at module load — constructing it eagerly throws if `ANTHROPIC_API_KEY` isn't set, which would crash the whole process at startup on any deploy that doesn't have it configured yet.
- `/api/threats`'s AI scoring/geolocation step is wrapped so a failure (missing key, rate limit, etc.) doesn't take down the whole response — it just returns threats without `score`/`location`.
- `nixpacks.toml` pins the Node provider explicitly for Railway deploys — without it, Nixpacks can misdetect this as a Deno project because of a transitive dependency (`@streamparser/json`, pulled in by `@anthropic-ai/sdk`) that declares Deno support.
- Email alerts and Threat Score history both run off a single shared in-process interval (`setInterval`, not a separate cron job — `utils/dataCollector.js` self-fetches `/api/threats` + `/api/locations` over `localhost` once per tick, and both the alert checker and the history snapshotter consume that same result, so a tick costs one AI-scoring pass, not two). This only fires while the server is running continuously — fine on Railway, which doesn't spin this service down, but wouldn't work on a host that sleeps on inactivity.
- The Threat Score formula (`utils/historyStore.js`) is intentionally simple and documented in code, not a claim of rigorous risk modeling: average severity (1-10) scaled to 0-100, boosted by how many Critical-band (9-10) items are present. Category scores use the same formula scoped to items the AI classified into that category. `utils/severity.js` is the single source of truth for score-to-band-name/color mapping — reuse it rather than re-deriving thresholds elsewhere.
- History insights (peak day, busiest time-of-day) are best-effort estimates from periodic point-in-time snapshots, not a full event log — they'll be `null` until at least 2 snapshots exist for the requested range, and "new critical today" is a diff against the day-start snapshot's count, not a deduplicated count of distinct new items.
- `utils/darkWebCheck.js` holds the one shared LeakCheck request/response handling, used by both the on-demand `/api/darkweb` route and the persistent monitor (`utils/darkWebMonitor.js`) — don't duplicate the LeakCheck call elsewhere.
- `POST /api/phishing/analyze` is the one route with a route-scoped `express.json({ limit: '8mb' })` override (base64 screenshots don't fit the global 100kb default) — every other route intentionally keeps the smaller default rather than raising it globally.
- `utils/alertDetector.js` is the single detection pass each monitor tick runs to find newly-alertable items (high-severity threats, severe weather alerts, high-severity local news, new dark-web exposure hits) — it dedupes against `utils/alertStore.js`'s seen-list and marks items seen immediately, so it must only run once per tick. Both the in-app notification center (`utils/notificationStore.js`) and email alerts (`utils/alertChecker.js`) consume that same detection result rather than re-detecting; email alerts stay opt-in (no-op unless configured), but notifications are populated unconditionally so the notification center works even without email set up.
