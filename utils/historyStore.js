// utils/historyStore.js
//
// Persists periodic snapshots of overall threat activity (composite score,
// per-category breakdown, critical/high counts) so the dashboard can show
// real trends/deltas instead of static placeholder numbers. Snapshots are
// point-in-time samples (taken every MONITOR_INTERVAL_MINUTES, see
// server.js), not a full event log — insights derived from them (peak day,
// busiest time) are best-effort estimates from that sampling, not exact
// counts. Same persistence pattern as the other stores in this project.

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { getSeverityBand } from './severity.js';
import { THREAT_CATEGORIES } from './threatScorer.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const historyFilePath = path.join(__dirname, '../data/history.json');

// At the default 15-minute interval this is ~100 days of history — plenty
// for a 90-day view, and keeps the file well under a megabyte.
const MAX_SNAPSHOTS = 9600;

function readHistory() {
  try {
    return JSON.parse(fs.readFileSync(historyFilePath, 'utf-8'));
  } catch (err) {
    if (err.code === 'ENOENT') return [];
    console.error('Failed to read history file:', err);
    return [];
  }
}

function writeHistory(snapshots) {
  fs.writeFileSync(historyFilePath, JSON.stringify(snapshots, null, 2));
}

// Simple, documented, adjustable formula rather than anything claiming to
// be a rigorous risk model: average severity (1-10) scaled to 0-100, with
// a boost for how many Critical-band items are in the mix. Two periods
// with the same average severity but different critical density will
// score differently, which is the behavior we want.
function computeScore(items) {
  if (!items.length) return 0;
  const avg = items.reduce((sum, i) => sum + i.score, 0) / items.length;
  const criticalCount = items.filter((i) => i.score >= 9).length;
  const criticalBoost = Math.min(20, criticalCount * 2);
  return Math.round(Math.min(100, avg * 10 + criticalBoost));
}

/**
 * Builds and persists a snapshot from already-scored threat/news items.
 * @param {{score: number, category?: string, pubDate?: string}[]} items
 * @returns {object} the recorded snapshot
 */
export function recordSnapshot(items) {
  const scored = items.filter((i) => typeof i.score === 'number');

  const categories = {};
  for (const cat of THREAT_CATEGORIES) {
    const inCategory = scored.filter((i) => (i.category || 'Other') === cat);
    categories[cat] = computeScore(inCategory);
  }

  const overallScore = computeScore(scored);
  const criticalCount = scored.filter((i) => i.score >= 9).length;
  const highCount = scored.filter((i) => i.score >= 7 && i.score < 9).length;

  const dayAgo = Date.now() - 24 * 60 * 60 * 1000;
  const breakingCount24h = items.filter((i) => i.pubDate && new Date(i.pubDate).getTime() >= dayAgo).length;

  const snapshot = {
    timestamp: new Date().toISOString(),
    overallScore,
    band: getSeverityBand(overallScore / 10).name,
    categories,
    criticalCount,
    highCount,
    breakingCount24h,
    totalScored: scored.length
  };

  const history = readHistory();
  history.push(snapshot);
  writeHistory(history.slice(-MAX_SNAPSHOTS));

  return snapshot;
}

export function getLatestSnapshot() {
  const history = readHistory();
  return history[history.length - 1] || null;
}

// Nearest snapshot at or before `targetTime`, falling back to the oldest
// available snapshot if history doesn't go back that far yet.
function findSnapshotNear(history, targetTime) {
  if (!history.length) return null;
  let candidate = history[0];
  for (const snap of history) {
    if (new Date(snap.timestamp).getTime() > targetTime) break;
    candidate = snap;
  }
  return candidate;
}

function percentDelta(current, previous) {
  if (!previous) return null;
  return Math.round(((current - previous) / previous) * 1000) / 10;
}

/**
 * Current score plus 24h/7d deltas, computed against the nearest
 * historical snapshot to those points.
 */
export function getThreatScoreSummary() {
  const history = readHistory();
  const latest = history[history.length - 1] || null;
  if (!latest) return null;

  const now = new Date(latest.timestamp).getTime();
  const dayAgoSnap = findSnapshotNear(history, now - 24 * 60 * 60 * 1000);
  const weekAgoSnap = findSnapshotNear(history, now - 7 * 24 * 60 * 60 * 1000);

  // "New today" (UTC day boundary) is an approximation — a diff against the
  // count at day-start, not a deduplicated count of distinct new items —
  // since snapshots record aggregate counts, not per-item identity over
  // time. Still meaningfully more honest than just repeating the total.
  const todayStart = new Date(latest.timestamp);
  todayStart.setUTCHours(0, 0, 0, 0);
  const startOfDaySnap = findSnapshotNear(history, todayStart.getTime());
  const newCriticalToday = startOfDaySnap ? Math.max(0, latest.criticalCount - startOfDaySnap.criticalCount) : latest.criticalCount;

  return {
    overall: {
      score: latest.overallScore,
      band: latest.band,
      delta24h: dayAgoSnap ? latest.overallScore - dayAgoSnap.overallScore : null,
      delta7d: weekAgoSnap ? latest.overallScore - weekAgoSnap.overallScore : null
    },
    categories: Object.fromEntries(
      THREAT_CATEGORIES.map((cat) => [
        cat,
        {
          score: latest.categories[cat] ?? 0,
          delta24h: dayAgoSnap ? percentDelta(latest.categories[cat] ?? 0, dayAgoSnap.categories[cat] ?? 0) : null
        }
      ])
    ),
    criticalCount: latest.criticalCount,
    newCriticalToday,
    highCount: latest.highCount,
    breakingCount24h: latest.breakingCount24h,
    lastUpdated: latest.timestamp
  };
}

const RANGE_MS = {
  '24h': 24 * 60 * 60 * 1000,
  '7d': 7 * 24 * 60 * 60 * 1000,
  '30d': 30 * 24 * 60 * 60 * 1000,
  '90d': 90 * 24 * 60 * 60 * 1000
};

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

/**
 * Time-series points plus best-effort insights for the given range.
 * @param {'24h'|'7d'|'30d'|'90d'} range
 */
export function getHistoryRange(range) {
  const windowMs = RANGE_MS[range] || RANGE_MS['7d'];
  const cutoff = Date.now() - windowMs;
  const history = readHistory().filter((s) => new Date(s.timestamp).getTime() >= cutoff);

  const points = history.map((s) => ({ timestamp: s.timestamp, score: s.overallScore }));

  if (history.length < 2) {
    return { points, insights: null };
  }

  const first = history[0];
  const last = history[history.length - 1];
  const percentChange = percentDelta(last.overallScore, first.overallScore);

  // Peak day: highest average score per calendar day represented in range.
  const byDay = new Map();
  for (const snap of history) {
    const day = DAY_NAMES[new Date(snap.timestamp).getDay()];
    if (!byDay.has(day)) byDay.set(day, []);
    byDay.get(day).push(snap);
  }
  let peakDay = null;
  let peakDayAvg = -1;
  let peakDayAlerts = 0;
  for (const [day, snaps] of byDay) {
    const avg = snaps.reduce((sum, s) => sum + s.overallScore, 0) / snaps.length;
    if (avg > peakDayAvg) {
      peakDayAvg = avg;
      peakDay = day;
      // Best-effort "alert count" for that day — the highest single
      // critical-count reading seen, not a deduplicated cumulative total
      // (snapshots are point-in-time samples, not a full event log).
      peakDayAlerts = Math.max(...snaps.map((s) => s.criticalCount));
    }
  }

  // Busiest time: highest-average-activity 4-hour window of day.
  const windows = ['00:00-04:00', '04:00-08:00', '08:00-12:00', '12:00-16:00', '16:00-20:00', '20:00-24:00'];
  const byWindow = new Map();
  for (const snap of history) {
    const hour = new Date(snap.timestamp).getHours();
    const w = windows[Math.floor(hour / 4)];
    if (!byWindow.has(w)) byWindow.set(w, []);
    byWindow.get(w).push(snap);
  }
  let busiestTime = null;
  let busiestAvg = -1;
  for (const [w, snaps] of byWindow) {
    const avg = snaps.reduce((sum, s) => sum + s.criticalCount + s.highCount, 0) / snaps.length;
    if (avg > busiestAvg) {
      busiestAvg = avg;
      busiestTime = w;
    }
  }

  return {
    points,
    insights: {
      peakDay,
      peakDayAlerts,
      busiestTime,
      percentChange,
      trend: percentChange > 5 ? 'Increasing' : percentChange < -5 ? 'Decreasing' : 'Stable',
      snapshotCount: history.length
    }
  };
}
