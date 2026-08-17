// server.js
import express from 'express';
import fetch from 'node-fetch';
import cors from 'cors';
import dotenv from 'dotenv';
import Parser from 'rss-parser';
import https from 'https';
import { getFeeds, addFeed, removeFeed } from './utils/feedStore.js';
import { getKeywords, addKeyword, removeKeyword } from './utils/keywordStore.js';
import { getLocations, addLocation, removeLocation } from './utils/locationStore.js';
import { watchLocation } from './utils/locationWatch.js';
import { scoreText, scoreTexts, scoreAndLocateTexts } from './utils/threatScorer.js';
import { resolveCoordinates } from './utils/geoLookup.js';
import { getAlertSettings, updateAlertSettings } from './utils/alertStore.js';
import { isMailerConfigured, sendMail } from './utils/mailer.js';
import { runAlertCheck } from './utils/alertChecker.js';
import { collectSnapshotData } from './utils/dataCollector.js';
import { recordSnapshot, getThreatScoreSummary, getHistoryRange } from './utils/historyStore.js';

dotenv.config();

const app = express();
const port = process.env.PORT || 3001;

app.use(express.json());
app.use(cors());

// Some source feeds present bad/self-signed certs; bypass for parsing only.
// A real User-Agent matters too — some providers block/reset connections
// from requests with no or generic User-Agent headers. Two parser instances
// since an https.Agent can't be used against a plain http:// feed URL (some
// legacy RSS subdomains, e.g. CNN's, don't support TLS at all).
const FEED_TIMEOUT_MS = 10000;
const parserHeaders = { 'User-Agent': 'CrisisWatchBot/1.0' };
const httpsParser = new Parser({
  headers: parserHeaders,
  timeout: FEED_TIMEOUT_MS,
  requestOptions: { agent: new https.Agent({ rejectUnauthorized: false }) }
});
const httpParser = new Parser({ headers: parserHeaders, timeout: FEED_TIMEOUT_MS });

function parserFor(url) {
  return url.startsWith('http://') ? httpParser : httpsParser;
}

// Belt-and-braces on top of rss-parser's own `timeout` option — a feed that
// hangs the connection rather than erroring outright would otherwise stall
// the whole Promise.all() in /api/feeds and /api/threats indefinitely, since
// neither has any other timeout.
function withTimeout(promise, ms) {
  return Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error(`Timed out after ${ms}ms`)), ms))
  ]);
}

app.get('/', (req, res) => {
  res.send('CrisisWatch API is live');
});

// Config presence only — never the actual key values — so the Admin Panel
// can show an at-a-glance health view without exposing secrets.
app.get('/api/status', (req, res) => {
  res.json({
    anthropicConfigured: Boolean(process.env.ANTHROPIC_API_KEY),
    leakcheckConfigured: Boolean(process.env.LEAKCHECK_API_KEY),
    mailerConfigured: isMailerConfigured(),
    feedCount: getFeeds().length,
    keywordCount: getKeywords().length
  });
});

// ---- Email alerts ----

app.get('/api/alerts/settings', (req, res) => {
  res.json({ ...getAlertSettings(), mailerConfigured: isMailerConfigured() });
});

app.post('/api/alerts/settings', (req, res) => {
  const { enabled, recipient } = req.body || {};
  res.json(updateAlertSettings({ enabled, recipient }));
});

app.post('/api/alerts/test', async (req, res) => {
  const { recipient } = getAlertSettings();
  if (!recipient) return res.status(400).json({ error: 'No recipient configured' });
  try {
    await sendMail(recipient, 'CrisisWatch: test alert', '<p>This is a test alert from CrisisWatch. Email alerts are working.</p>');
    res.json({ sent: true });
  } catch (err) {
    console.error('Test email failed:', err.message);
    res.status(502).json({ error: 'Failed to send test email', debug: err.message });
  }
});

async function fetchFeedItems(feed, limit = 5) {
  try {
    const parsed = await withTimeout(parserFor(feed.url).parseURL(feed.url), FEED_TIMEOUT_MS);
    return {
      url: feed.url,
      title: feed.title || parsed.title || feed.url,
      ok: true,
      items: parsed.items.slice(0, limit).map((item) => ({
        title: item.title,
        link: item.link,
        pubDate: item.pubDate || item.isoDate,
        summary: item.contentSnippet || item.content || ''
      }))
    };
  } catch (err) {
    console.error(`RSS parse error for ${feed.url}:`, err.message);
    return { url: feed.url, title: feed.title || feed.url, ok: false, error: err.message, items: [] };
  }
}

// ---- Feeds ----

app.get('/api/feeds', async (req, res) => {
  try {
    const feeds = await Promise.all(getFeeds().map((f) => fetchFeedItems(f)));
    res.json({ feeds });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch feeds', debug: err.message });
  }
});

app.post('/api/feeds', (req, res) => {
  const { url } = req.body || {};
  if (!url) return res.status(400).json({ error: 'Missing url' });
  const feeds = addFeed(url);
  res.json({ feeds });
});

app.delete('/api/feeds', (req, res) => {
  const { url } = req.body || {};
  if (!url) return res.status(400).json({ error: 'Missing url' });
  const feeds = removeFeed(url);
  res.json({ feeds });
});

// ---- Keyword watchlist ("Keywords Alert") ----

app.get('/api/keywords', (req, res) => {
  res.json({ keywords: getKeywords() });
});

app.post('/api/keywords', (req, res) => {
  const { keyword } = req.body || {};
  if (!keyword) return res.status(400).json({ error: 'Missing keyword' });
  res.json({ keywords: addKeyword(keyword) });
});

app.delete('/api/keywords', (req, res) => {
  const { keyword } = req.body || {};
  if (!keyword) return res.status(400).json({ error: 'Missing keyword' });
  res.json({ keywords: removeKeyword(keyword) });
});

// ---- Watched locations ("Watched Locations": weather alerts + local news per zip) ----

app.post('/api/locations', (req, res) => {
  const { zip } = req.body || {};
  if (!zip) return res.status(400).json({ error: 'Missing zip' });
  res.json({ locations: addLocation(zip) });
});

app.delete('/api/locations', (req, res) => {
  const { zip } = req.body || {};
  if (!zip) return res.status(400).json({ error: 'Missing zip' });
  res.json({ locations: removeLocation(zip) });
});

app.get('/api/locations', async (req, res) => {
  const useAI = req.query.useAI !== 'false'; // default true
  try {
    const zips = getLocations();
    const results = await Promise.all(
      zips.map((zip) =>
        watchLocation(zip).catch((err) => {
          console.error(`Location watch failed for ${zip}:`, err.message);
          return { zip, city: null, state: null, alerts: [], news: [], error: err.message };
        })
      )
    );

    if (useAI) {
      const newsTexts = results.flatMap((r) => (r.news || []).map((n) => n.title));
      if (newsTexts.length) {
        try {
          const scores = await scoreTexts(newsTexts);
          let i = 0;
          for (const r of results) {
            for (const n of r.news || []) n.score = scores[i++];
          }
        } catch (err) {
          // Same graceful-degradation pattern as /api/threats — a scoring
          // failure shouldn't take down the whole locations response.
          console.error('Location news scoring unavailable:', err.message);
        }
      }
    }

    res.json({ locations: results });
  } catch (err) {
    console.error('Locations aggregation error:', err);
    res.status(500).json({ error: 'Failed to fetch watched locations', debug: err.message });
  }
});

// ---- Threats (aggregated feed items, optional keyword/source filter, optional AI scoring) ----

app.get('/api/threats', async (req, res) => {
  try {
    const keywords = (req.query.keywords || '')
      .split(',')
      .map((k) => k.trim().toLowerCase())
      .filter(Boolean);
    const sources = (req.query.sources || '')
      .split(',')
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean);
    const useAI = req.query.useAI !== 'false'; // default true

    let feeds = getFeeds();
    if (sources.length) {
      feeds = feeds.filter((f) => sources.some((s) => (f.title || f.url).toLowerCase().includes(s)));
    }

    const parsedFeeds = await Promise.all(feeds.map((f) => fetchFeedItems(f, 20)));

    let threats = parsedFeeds.flatMap((feed) =>
      feed.items.map((item) => ({ ...item, source: feed.title }))
    );

    if (keywords.length) {
      threats = threats.filter((item) =>
        keywords.some((kw) =>
          (item.title || '').toLowerCase().includes(kw) || (item.summary || '').toLowerCase().includes(kw)
        )
      );
    }

    if (useAI && threats.length) {
      try {
        const analyses = await scoreAndLocateTexts(threats.map((t) => `${t.title}. ${t.summary}`));
        threats = threats.map((t, i) => ({
          ...t,
          score: analyses[i].score,
          location: analyses[i].country,
          coordinates: resolveCoordinates(analyses[i].country),
          category: analyses[i].category
        }));
      } catch (err) {
        // AI scoring is best-effort (e.g. ANTHROPIC_API_KEY not configured yet) —
        // don't fail the whole feed just because scoring/geolocation is unavailable.
        console.error('AI scoring/geolocation unavailable, returning unscored threats:', err.message);
      }
    }

    res.json({ threats });
  } catch (err) {
    console.error('Threats aggregation error:', err);
    res.status(500).json({ error: 'Failed to fetch threats', debug: err.message });
  }
});

// ---- Dark web check (LeakCheck) ----

app.get('/api/darkweb', async (req, res) => {
  const email = req.query.email;
  const key = process.env.LEAKCHECK_API_KEY;
  if (!email || !key) return res.status(400).json({ error: 'Missing email or API key' });
  try {
    const url = `https://leakcheck.io/api/public?key=${key}&check=${encodeURIComponent(email)}&type=email`;
    const r = await fetch(url);
    const j = await r.json();
    // LeakCheck's public API can return HTTP 200 with `success: false` and an
    // explanatory `error` (e.g. a plan/type restriction) instead of a non-2xx
    // status — treat that the same as a hard failure so it isn't silently
    // reported back as "no results found".
    if (!r.ok || j.success === false) {
      return res.status(502).json({ error: j.error || 'LeakCheck error', details: j });
    }
    // LeakCheck's public API returns breach names under `sources`, not
    // `result` (that's the v2/paid-lookup shape) — read either defensively
    // since this was found live to return found:true with an empty list.
    const rawEntries = Array.isArray(j.sources) ? j.sources : Array.isArray(j.result) ? j.result : [];
    res.json({
      found: Boolean(j.found),
      entries: rawEntries.map((entry) => (typeof entry === 'string' ? entry : entry?.name || entry?.source?.name || JSON.stringify(entry)))
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal error', debug: err.message });
  }
});

// ---- Threat Score (composite score + category breakdown, from history) ----

app.get('/api/threat-score', (req, res) => {
  const summary = getThreatScoreSummary();
  if (!summary) {
    return res.status(503).json({ error: 'No history recorded yet — check back after the first monitoring cycle completes' });
  }
  res.json(summary);
});

app.get('/api/threat-score/history', (req, res) => {
  const range = ['24h', '7d', '30d', '90d'].includes(req.query.range) ? req.query.range : '7d';
  res.json(getHistoryRange(range));
});

// ---- Dashboard stats ----

app.get('/api/stats', (req, res) => {
  const summary = getThreatScoreSummary();
  if (!summary) {
    return res.json({ criticalAlerts: { count: 0, newToday: 0 }, breakingNews: { count24h: 0 } });
  }
  res.json({
    criticalAlerts: { count: summary.criticalCount, newToday: summary.newCriticalToday },
    breakingNews: { count24h: summary.breakingCount24h },
    lastUpdated: summary.lastUpdated
  });
});

// ---- AI scoring ----

app.post('/api/score', async (req, res) => {
  const { text } = req.body || {};
  if (!text) return res.status(400).json({ error: 'Missing text' });
  try {
    const score = await scoreText(text);
    res.json({ score });
  } catch (err) {
    console.error('AI scoring error:', err);
    res.status(500).json({ error: 'Failed to score threat', debug: err.message });
  }
});

const MONITOR_INTERVAL_MS = (Number(process.env.MONITOR_INTERVAL_MINUTES) || 15) * 60 * 1000;

// One shared data collection per tick, feeding both the history snapshot
// and the alert check — previously each self-fetched independently, which
// meant two full AI-scoring passes per tick for the same underlying data.
async function runMonitorTick() {
  try {
    const data = await collectSnapshotData(port);
    recordSnapshot([...data.threats, ...data.locations.flatMap((l) => l.news || [])]);
    await runAlertCheck(data);
  } catch (err) {
    console.error('Monitor tick failed:', err.message);
  }
}

app.listen(port, () => {
  console.log(`CrisisWatch API live on ${port}`);
  // Give the server a moment to fully warm up before the first tick.
  setTimeout(() => {
    runMonitorTick();
    setInterval(runMonitorTick, MONITOR_INTERVAL_MS);
  }, 30000);
});
