// utils/feedFetcher.js
//
// Shared RSS fetching, used by both /api/feeds (raw feed browsing) and
// utils/threatsAggregator.js (aggregated + scored threats). Split out so
// neither has to duplicate parser setup.

import Parser from 'rss-parser';
import https from 'https';

// Some source feeds present bad/self-signed certs; bypass for parsing only.
// A real User-Agent matters too — some providers block/reset connections
// from requests with no or generic User-Agent headers. Two parser instances
// since an https.Agent can't be used against a plain http:// feed URL (some
// legacy RSS subdomains, e.g. CNN's, don't support TLS at all).
export const FEED_TIMEOUT_MS = 10000;
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

export async function fetchFeedItems(feed, limit = 5) {
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
