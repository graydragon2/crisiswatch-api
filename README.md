# CrisisWatch API

Express (ESM) backend for CrisisWatch — aggregates RSS feeds tracking local and global crises, scores/geolocates them with Claude, checks emails against known credential leaks, and maintains a keyword watchlist. Paired with [crisiswatch-frontend](https://github.com/graydragon2/crisiswatch-frontend).

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

## API

- `GET /api/feeds` / `POST /api/feeds` / `DELETE /api/feeds` — manage the tracked RSS feed list (persisted to `data/feeds.json`).
- `GET /api/keywords` / `POST /api/keywords` / `DELETE /api/keywords` — manage the keyword watchlist (persisted to `data/keywords.json`), used to drive the frontend's "Keywords Alert" widget.
- `GET /api/threats` — aggregated feed items. Query params: `keywords` (comma-separated), `sources` (comma-separated, matches feed name), `useAI` (`true` by default — attaches `score`/`location`/`coordinates` per item via Claude; set `false` to skip and avoid API usage).
- `GET /api/darkweb?email=...` — checks an email against known breaches via LeakCheck, normalized to `{found, entries}`.
- `POST /api/score` — score a single arbitrary piece of text (`{ text }` body) 1–10 via Claude.

## Notes

- The Anthropic client is constructed lazily on first use, not at module load — constructing it eagerly throws if `ANTHROPIC_API_KEY` isn't set, which would crash the whole process at startup on any deploy that doesn't have it configured yet.
- `/api/threats`'s AI scoring/geolocation step is wrapped so a failure (missing key, rate limit, etc.) doesn't take down the whole response — it just returns threats without `score`/`location`.
- `nixpacks.toml` pins the Node provider explicitly for Railway deploys — without it, Nixpacks can misdetect this as a Deno project because of a transitive dependency (`@streamparser/json`, pulled in by `@anthropic-ai/sdk`) that declares Deno support.
