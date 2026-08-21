// utils/locationsAggregator.js
//
// Shared by the /api/locations route and the per-user monitor tick pass
// (see server.js) — fetches weather/news for a set of watched zips and
// optionally AI-scores the news. Split out so the monitor tick can call it
// directly instead of self-fetching its own now-authenticated HTTP route.

import { watchLocation } from './locationWatch.js';
import { scoreTexts } from './threatScorer.js';
import { locationsCacheKey, getOrComputeLocations } from './locationsCache.js';

/**
 * @param {string[]} zips
 * @param {{useAI?: boolean}} [options]
 */
export async function getWatchedLocationsWithNews(zips, { useAI = true } = {}) {
  if (!zips.length) return [];

  return getOrComputeLocations(locationsCacheKey(zips, useAI), async () => {
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

    return results;
  });
}
