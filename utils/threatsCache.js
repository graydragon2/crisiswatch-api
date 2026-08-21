// utils/threatsCache.js
//
// /api/threats does a full live AI-scoring pass (Claude call per feed
// item, via scoreAndLocateTexts) — with no caching, every caller pays for
// its own scoring pass on the same underlying feed set. In practice this
// fanned out badly: the dashboard alone calls it twice independently
// (RssHighlights and PropagationMap each fetch it on mount), the
// /threats page calls it again, and the 15-minute background monitor
// tick calls it on top of that — all uncached, all re-scoring the same
// ~100-200 items from scratch. That was the actual driver of a real
// Anthropic API cost spike, not call frequency alone.
//
// Single-flight + short TTL, keyed by the query that actually changes the
// output (keywords/sources/useAI): concurrent callers for the same key
// (e.g. RssHighlights and PropagationMap firing their fetches within the
// same page load) share one in-flight computation rather than each
// starting their own — a plain "cache the finished result" TTL cache
// doesn't help there, since both requests miss the cache before either
// one finishes. A fresh RSS/scoring pass every few minutes is still
// "real-time enough" for a crisis feed.

const TTL_MS = (Number(process.env.THREATS_CACHE_TTL_MINUTES) || 5) * 60 * 1000;

const cache = new Map();

export function threatsCacheKey({ keywords, sources, useAI }) {
  return JSON.stringify({ keywords, sources, useAI });
}

/**
 * @param {string} key
 * @param {() => Promise<any>} computeFn
 */
export function getOrComputeThreats(key, computeFn) {
  const entry = cache.get(key);
  if (entry && entry.expiresAt > Date.now()) {
    return entry.promise;
  }

  const promise = computeFn();
  cache.set(key, { promise, expiresAt: Date.now() + TTL_MS });
  // Don't leave a poisoned cache entry for the full TTL if this attempt
  // failed — the next caller should get a fresh try, not a rejected promise.
  promise.catch(() => cache.delete(key));
  return promise;
}
