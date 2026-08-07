// server.js
import express from 'express';
import fetch from 'node-fetch';
import cors from 'cors';
import dotenv from 'dotenv';
import Parser from 'rss-parser';
import https from 'https';
import { getFeeds, addFeed, removeFeed } from './utils/feedStore.js';
import { getKeywords, addKeyword, removeKeyword } from './utils/keywordStore.js';
import { scoreText, scoreAndLocateTexts } from './utils/threatScorer.js';
import { resolveCoordinates } from './utils/geoLookup.js';

dotenv.config();

const app = express();
const port = process.env.PORT || 3001;

app.use(express.json());
app.use(cors());

// Some source feeds present bad/self-signed certs; bypass for parsing only.
const parser = new Parser({
  requestOptions: { agent: new https.Agent({ rejectUnauthorized: false }) }
});

app.get('/', (req, res) => {
  res.send('CrisisWatch API is live');
});

async function fetchFeedItems(feed, limit = 5) {
  try {
    const parsed = await parser.parseURL(feed.url);
    return {
      url: feed.url,
      title: feed.title || parsed.title || feed.url,
      items: parsed.items.slice(0, limit).map((item) => ({
        title: item.title,
        link: item.link,
        pubDate: item.pubDate || item.isoDate,
        summary: item.contentSnippet || item.content || ''
      }))
    };
  } catch (err) {
    console.error(`RSS parse error for ${feed.url}:`, err.message);
    return { url: feed.url, title: feed.title || feed.url, items: [] };
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
          coordinates: resolveCoordinates(analyses[i].country)
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

app.listen(port, () => console.log(`CrisisWatch API live on ${port}`));
