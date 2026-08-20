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
import { scoreText, scoreAndLocateTexts } from './utils/threatScorer.js';
import { resolveCoordinates } from './utils/geoLookup.js';
import { getAlertSettings, updateAlertSettings } from './utils/alertStore.js';
import { isMailerConfigured, sendMail } from './utils/mailer.js';
import { sendAlertEmail } from './utils/alertChecker.js';
import { detectNewAlertableItems, buildNotificationItems } from './utils/alertDetector.js';
import { getNotifications, getUnreadCount, addNotifications, markRead, markAllRead, clearNotification } from './utils/notificationStore.js';
import { collectSnapshotData } from './utils/dataCollector.js';
import { recordSnapshot, getThreatScoreSummary, getHistoryRange } from './utils/historyStore.js';
import { checkEmailExposure } from './utils/darkWebCheck.js';
import { getMonitoredEmails, addMonitoredEmail, removeMonitoredEmail, updateCheckResult } from './utils/monitoredEmailStore.js';
import { refreshStaleMonitoredEmails } from './utils/darkWebMonitor.js';
import { analyzePhishingRisk, ANALYSIS_TYPES, ALLOWED_IMAGE_TYPES, MAX_IMAGE_BYTES } from './utils/phishingAnalyzer.js';
import { createMagicLinkToken, redeemMagicLinkToken, signSession, requireAuth } from './utils/auth.js';
import { getWatchedLocationsWithNews } from './utils/locationsAggregator.js';
import { getDb } from './utils/db.js';

dotenv.config();

const app = express();
const port = process.env.PORT || 3001;

app.use(express.json());
app.use(cors());

// Every route here is either live-scored (threats, locations, stats) or
// per-user auth-scoped data — nothing should ever be cached by an
// intermediate proxy or the browser. Without this, a plain reload (as
// opposed to a cache-bypassing hard reload) can serve a stale response —
// this is what was masking the threatScorer.js batch-fallback fix: the
// browser kept re-serving a cached pre-fix /api/threats response with no
// scores, even after the backend itself was already fixed.
app.use((req, res, next) => {
  res.set('Cache-Control', 'no-store');
  next();
});

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
// can show an at-a-glance health view without exposing secrets. keywordCount
// dropped in Phase 2 — keywords are per-user now, so there's no longer a
// single global count to report here.
app.get('/api/status', (req, res) => {
  res.json({
    anthropicConfigured: Boolean(process.env.ANTHROPIC_API_KEY),
    leakcheckConfigured: Boolean(process.env.LEAKCHECK_API_KEY),
    mailerConfigured: isMailerConfigured(),
    feedCount: getFeeds().length
  });
});

// ---- Auth (magic link) ----
//
// Phase 1 of the subscription build — issues sessions, but nothing is
// gated behind them yet (that starts once per-user data tables exist).

app.post('/api/auth/magic-link', async (req, res) => {
  const { email } = req.body || {};
  if (!email || !email.includes('@')) return res.status(400).json({ error: 'Missing or invalid email' });

  try {
    const { rawToken } = await createMagicLinkToken(email);
    const verifyUrl = `${process.env.FRONTEND_URL || 'http://localhost:3000'}/auth/verify?token=${rawToken}`;
    await sendMail(
      email,
      'Your Contingency Brief sign-in link',
      `<p>Click below to sign in. This link expires in 15 minutes and can only be used once.</p><p><a href="${verifyUrl}">${verifyUrl}</a></p>`
    );
    res.json({ sent: true });
  } catch (err) {
    console.error('Magic link request failed:', err.message);
    res.status(500).json({ error: 'Failed to send sign-in link', debug: err.message });
  }
});

app.post('/api/auth/verify', async (req, res) => {
  const { token } = req.body || {};
  if (!token) return res.status(400).json({ error: 'Missing token' });

  try {
    const user = await redeemMagicLinkToken(token);
    res.json({ token: signSession(user), user });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.get('/api/auth/me', requireAuth, (req, res) => {
  res.json({ user: req.user });
});

// ---- Email alerts ----

app.get('/api/alerts/settings', requireAuth, async (req, res) => {
  res.json({ ...(await getAlertSettings(req.user.id)), mailerConfigured: isMailerConfigured() });
});

app.post('/api/alerts/settings', requireAuth, async (req, res) => {
  const { enabled, recipient } = req.body || {};
  res.json(await updateAlertSettings(req.user.id, { enabled, recipient }));
});

app.post('/api/alerts/test', requireAuth, async (req, res) => {
  const { recipient } = await getAlertSettings(req.user.id);
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

app.get('/api/keywords', requireAuth, async (req, res) => {
  res.json({ keywords: await getKeywords(req.user.id) });
});

app.post('/api/keywords', requireAuth, async (req, res) => {
  const { keyword } = req.body || {};
  if (!keyword) return res.status(400).json({ error: 'Missing keyword' });
  res.json({ keywords: await addKeyword(req.user.id, keyword) });
});

app.delete('/api/keywords', requireAuth, async (req, res) => {
  const { keyword } = req.body || {};
  if (!keyword) return res.status(400).json({ error: 'Missing keyword' });
  res.json({ keywords: await removeKeyword(req.user.id, keyword) });
});

// ---- Watched locations ("Watched Locations": weather alerts + local news per zip) ----

app.post('/api/locations', requireAuth, async (req, res) => {
  const { zip } = req.body || {};
  if (!zip) return res.status(400).json({ error: 'Missing zip' });
  res.json({ locations: await addLocation(req.user.id, zip) });
});

app.delete('/api/locations', requireAuth, async (req, res) => {
  const { zip } = req.body || {};
  if (!zip) return res.status(400).json({ error: 'Missing zip' });
  res.json({ locations: await removeLocation(req.user.id, zip) });
});

app.get('/api/locations', requireAuth, async (req, res) => {
  const useAI = req.query.useAI !== 'false'; // default true
  try {
    const zips = await getLocations(req.user.id);
    const results = await getWatchedLocationsWithNews(zips, { useAI });
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
  if (!email) return res.status(400).json({ error: 'Missing email' });
  try {
    res.json(await checkEmailExposure(email));
  } catch (err) {
    console.error('Dark web check failed:', err.message);
    res.status(502).json({ error: err.message });
  }
});

// ---- Persistent dark web monitoring ("Monitored Addresses") ----

app.get('/api/darkweb/monitored', requireAuth, async (req, res) => {
  res.json({ emails: await getMonitoredEmails(req.user.id) });
});

app.post('/api/darkweb/monitored', requireAuth, async (req, res) => {
  const { email } = req.body || {};
  if (!email || !email.includes('@')) return res.status(400).json({ error: 'Missing or invalid email' });

  await addMonitoredEmail(req.user.id, email);
  // Run an immediate check rather than waiting for the next monitor tick,
  // so adding an email shows a real result right away.
  const normalized = email.trim().toLowerCase();
  try {
    const result = await checkEmailExposure(normalized);
    res.json({ emails: await updateCheckResult(req.user.id, normalized, result) });
  } catch (err) {
    console.error('Initial dark web check failed:', err.message);
    res.json({ emails: await updateCheckResult(req.user.id, normalized, { error: err.message }) });
  }
});

app.delete('/api/darkweb/monitored', requireAuth, async (req, res) => {
  const { email } = req.body || {};
  if (!email) return res.status(400).json({ error: 'Missing email' });
  res.json({ emails: await removeMonitoredEmail(req.user.id, email) });
});

// ---- In-app notifications (populated by runMonitorTick's detection pass) ----

app.get('/api/notifications', requireAuth, async (req, res) => {
  res.json({ notifications: await getNotifications(req.user.id), unreadCount: await getUnreadCount(req.user.id) });
});

app.post('/api/notifications/:id/read', requireAuth, async (req, res) => {
  res.json({ notifications: await markRead(req.user.id, req.params.id) });
});

app.post('/api/notifications/read-all', requireAuth, async (req, res) => {
  res.json({ notifications: await markAllRead(req.user.id) });
});

app.delete('/api/notifications/:id', requireAuth, async (req, res) => {
  res.json({ notifications: await clearNotification(req.user.id, req.params.id) });
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

app.get('/api/stats', requireAuth, async (req, res) => {
  const summary = getThreatScoreSummary();
  const monitoredEmails = await getMonitoredEmails(req.user.id);
  const darkWebHits = {
    count: monitoredEmails.reduce((sum, e) => sum + (e.exposureCount || 0), 0),
    monitored: monitoredEmails.length
  };

  if (!summary) {
    return res.json({ criticalAlerts: { count: 0, newToday: 0 }, breakingNews: { count24h: 0 }, darkWebHits });
  }
  res.json({
    criticalAlerts: { count: summary.criticalCount, newToday: summary.newCriticalToday },
    breakingNews: { count24h: summary.breakingCount24h },
    darkWebHits,
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

// ---- Phishing Detection ----
//
// A larger JSON body limit is scoped to just this route (base64-encoded
// screenshots need more than the 100kb default) rather than raised
// globally, so every other endpoint keeps the smaller default.
app.post('/api/phishing/analyze', express.json({ limit: '8mb' }), async (req, res) => {
  const { type, content, mediaType } = req.body || {};
  if (!ANALYSIS_TYPES.includes(type)) {
    return res.status(400).json({ error: `type must be one of: ${ANALYSIS_TYPES.join(', ')}` });
  }
  if (!content || typeof content !== 'string') {
    return res.status(400).json({ error: 'Missing content' });
  }
  if (type === 'screenshot') {
    if (!ALLOWED_IMAGE_TYPES.includes(mediaType)) {
      return res.status(400).json({ error: `mediaType must be one of: ${ALLOWED_IMAGE_TYPES.join(', ')}` });
    }
    // content is base64 — decoded size is ~3/4 of the encoded string length.
    if (content.length * 0.75 > MAX_IMAGE_BYTES) {
      return res.status(413).json({ error: `Screenshot too large — max ${Math.floor(MAX_IMAGE_BYTES / 1024 / 1024)}MB` });
    }
  }

  try {
    const result = await analyzePhishingRisk({ type, content, mediaType });
    res.json(result);
  } catch (err) {
    console.error('Phishing analysis error:', err.message);
    res.status(500).json({ error: 'Failed to analyze', debug: err.message });
  }
});

const MONITOR_INTERVAL_MS = (Number(process.env.MONITOR_INTERVAL_MINUTES) || 15) * 60 * 1000;

// One shared data collection per tick, feeding the history snapshot, the
// in-app notification center, and email alerts — previously each self-
// fetched independently, which meant multiple full AI-scoring passes per
// tick for the same underlying data.
//
// Order matters: dark web addresses are refreshed *before* detection runs,
// so a freshly-rechecked exposure count is included in that tick's
// detection pass rather than lagging a full cycle behind. Detection itself
// runs unconditionally (regardless of whether email alerting is enabled)
// so the notification center stays populated even for users who haven't
// set up email — sendAlertEmail() below is a no-op when alerts aren't
// configured.
// Runs the per-user half of a monitor tick: this user's watched-location
// news (their own AI-scoring pass, since each user has their own zip
// list), a stale dark-web recheck, detection against the shared feed
// threats + this user's locations/monitored emails, in-app notifications,
// and (if configured) an alert email. Isolated in its own try/catch inside
// the caller's loop so one user's failure (a bad zip, a mail send error)
// doesn't stop the tick for everyone else.
async function runUserMonitorPass(userId, threats) {
  const zips = await getLocations(userId);
  const locations = zips.length ? await getWatchedLocationsWithNews(zips, { useAI: true }) : [];

  // Internally a no-op for any email checked more recently than
  // DARKWEB_RECHECK_HOURS, so this is cheap on most ticks.
  await refreshStaleMonitoredEmails(userId);
  const monitoredEmails = await getMonitoredEmails(userId);

  const detected = await detectNewAlertableItems(userId, { threats, locations, monitoredEmails });
  const notificationItems = buildNotificationItems(detected);
  if (notificationItems.length) await addNotifications(userId, notificationItems);
  await sendAlertEmail(userId, detected);
}

async function runMonitorTick() {
  let threats = [];
  try {
    const data = await collectSnapshotData(port);
    threats = data.threats;
    recordSnapshot(threats);
  } catch (err) {
    console.error('Monitor tick failed:', err.message);
  }

  // The per-user pass needs Postgres (keywords/locations/monitored emails/
  // alerts all live there as of Phase 2) — skip gracefully if it isn't
  // configured yet, same reasoning as the migration guard in package.json.
  if (!process.env.DATABASE_URL) return;

  let users;
  try {
    users = await getDb().user.findMany({ select: { id: true } });
  } catch (err) {
    console.error('Monitor tick: failed to list users:', err.message);
    return;
  }

  for (const { id: userId } of users) {
    try {
      await runUserMonitorPass(userId, threats);
    } catch (err) {
      console.error(`Monitor tick: per-user pass failed for user ${userId}:`, err.message);
    }
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
