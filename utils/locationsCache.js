// utils/locationsCache.js
//
// Same bleed as utils/threatsCache.js, on watched-location news instead of
// feed threats: getWatchedLocationsWithNews() does a live Claude scoring
// pass (scoreTexts) on every call, and LocationWatch.jsx fetches
// /api/locations on every dashboard mount — uncached, so every page load
// paid for its own scoring pass on top of the per-user monitor tick's own
// pass every MONITOR_INTERVAL_MINUTES.
//
// Single-flight + short TTL, keyed by the zip list + useAI (same reasoning
// as threatsCache.js — a plain "cache the finished result" TTL cache
// wouldn't help a user's dashboard load racing the monitor tick's own call
// for the same user, since both could miss the cache before either
// finishes).

const TTL_MS = (Number(process.env.LOCATIONS_CACHE_TTL_MINUTES) || 5) * 60 * 1000;

const cache = new Map();

export function locationsCacheKey(zips, useAI) {
  return JSON.stringify({ zips: [...zips].sort(), useAI });
}

/**
 * @param {string} key
 * @param {() => Promise<any>} computeFn
 */
export function getOrComputeLocations(key, computeFn) {
  const entry = cache.get(key);
  if (entry && entry.expiresAt > Date.now()) {
    return entry.promise;
  }

  const promise = computeFn();
  cache.set(key, { promise, expiresAt: Date.now() + TTL_MS });
  promise.catch(() => cache.delete(key));
  return promise;
}
