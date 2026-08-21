// utils/threatsAggregator.js
//
// Shared by the /api/threats route and the monitor tick's global pass
// (see server.js/dataCollector.js) — aggregates feed items and optionally
// AI-scores them. Split out (same reasoning as locationsAggregator.js) so
// the monitor tick can call this directly instead of self-fetching its own
// now-authenticated HTTP route.

import { getFeeds } from './feedStore.js';
import { fetchFeedItems } from './feedFetcher.js';
import { scoreAndLocateTexts } from './threatScorer.js';
import { resolveCoordinates } from './geoLookup.js';
import { threatsCacheKey, getOrComputeThreats } from './threatsCache.js';

/**
 * @param {{keywords?: string[], sources?: string[], useAI?: boolean}} [options]
 */
export async function getThreats({ keywords = [], sources = [], useAI = true } = {}) {
  return getOrComputeThreats(threatsCacheKey({ keywords, sources, useAI }), async () => {
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

    return threats;
  });
}
