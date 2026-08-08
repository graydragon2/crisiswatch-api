// utils/locationWatch.js
//
// For a given US zip code: geocode it, pull active NWS weather/emergency
// alerts for that point (hurricanes, fires, floods, etc. — these come as
// official structured alerts, no AI needed), and pull a location-scoped
// local news feed (for things NWS doesn't cover, e.g. civil unrest).

import fetch from 'node-fetch';
import Parser from 'rss-parser';

const TIMEOUT_MS = 10000;

// NWS asks that requests identify the calling application; unrelated to
// the RSS feeds' User-Agent below.
const NWS_USER_AGENT = 'CrisisWatch (github.com/graydragon2/crisiswatch-api)';

const newsParser = new Parser({
  headers: { 'User-Agent': 'CrisisWatchBot/1.0' },
  timeout: TIMEOUT_MS
});

function withTimeout(promise, ms) {
  return Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error(`Timed out after ${ms}ms`)), ms))
  ]);
}

async function geocodeZip(zip) {
  const res = await withTimeout(fetch(`https://api.zippopotam.us/us/${encodeURIComponent(zip)}`), TIMEOUT_MS);
  if (!res.ok) throw new Error(`Unknown zip code "${zip}"`);
  const data = await res.json();
  const place = data.places?.[0];
  if (!place) throw new Error(`Unknown zip code "${zip}"`);
  return {
    city: place['place name'],
    state: place['state abbreviation'],
    lat: place.latitude,
    lon: place.longitude
  };
}

async function fetchWeatherAlerts(lat, lon) {
  const res = await withTimeout(
    fetch(`https://api.weather.gov/alerts/active?point=${lat},${lon}`, {
      headers: { 'User-Agent': NWS_USER_AGENT, Accept: 'application/geo+json' }
    }),
    TIMEOUT_MS
  );
  if (!res.ok) return [];
  const data = await res.json();
  return (data.features || []).map((f) => ({
    title: f.properties?.event || 'Weather Alert',
    description: f.properties?.headline || f.properties?.description || '',
    severity: f.properties?.severity || 'Unknown',
    effective: f.properties?.effective || null,
    expires: f.properties?.expires || null,
    link: f.properties?.['@id'] || null
  }));
}

async function fetchLocalNews(city, state) {
  try {
    const feed = await withTimeout(
      newsParser.parseURL(
        `https://news.google.com/rss/headlines/section/geo/${encodeURIComponent(`${city}, ${state}`)}?hl=en-US&gl=US&ceid=US:en`
      ),
      TIMEOUT_MS
    );
    return (feed.items || []).slice(0, 10).map((item) => ({
      title: item.title,
      link: item.link,
      pubDate: item.pubDate || item.isoDate,
      source: item.creator || 'Google News'
    }));
  } catch (err) {
    console.error(`Local news fetch failed for ${city}, ${state}:`, err.message);
    return [];
  }
}

/**
 * @param {string} zip US zip code
 * @returns {Promise<{zip: string, city: string, state: string, alerts: object[], news: object[]}>}
 */
export async function watchLocation(zip) {
  const { city, state, lat, lon } = await geocodeZip(zip);
  const [alerts, news] = await Promise.all([
    fetchWeatherAlerts(lat, lon).catch((err) => {
      console.error(`Weather alerts fetch failed for ${zip}:`, err.message);
      return [];
    }),
    fetchLocalNews(city, state)
  ]);
  return { zip, city, state, alerts, news };
}
