// utils/geoLookup.js
//
// Approximate [longitude, latitude] centroids for country names, used to
// plot threat items on the Propagation Overlay map. This is intentionally
// coarse (country-level, not city-level) — good enough for "where in the
// world is this happening," not for precise geolocation.

const COUNTRY_COORDINATES = {
  'united states': [-98.5, 39.8],
  usa: [-98.5, 39.8],
  'united kingdom': [-2.0, 54.0],
  uk: [-2.0, 54.0],
  ukraine: [31.0, 49.0],
  russia: [37.6, 55.8],
  china: [104.2, 35.9],
  india: [78.9, 20.6],
  pakistan: [69.3, 30.4],
  afghanistan: [67.7, 33.9],
  iran: [53.7, 32.4],
  iraq: [43.7, 33.2],
  israel: [34.8, 31.0],
  palestine: [35.2, 31.9],
  gaza: [34.4, 31.5],
  syria: [38.9, 34.8],
  lebanon: [35.9, 33.9],
  yemen: [48.5, 15.6],
  'saudi arabia': [45.1, 23.9],
  turkey: [35.2, 39.0],
  egypt: [30.8, 26.8],
  libya: [17.2, 26.3],
  sudan: [30.2, 12.9],
  ethiopia: [40.5, 9.1],
  somalia: [46.2, 5.2],
  nigeria: [8.7, 9.1],
  'south africa': [22.9, -30.6],
  kenya: [37.9, -0.0],
  congo: [21.8, -4.0],
  mali: [-4.0, 17.6],
  niger: [8.1, 17.6],
  germany: [10.4, 51.2],
  france: [2.2, 46.2],
  spain: [-3.7, 40.5],
  italy: [12.6, 41.9],
  poland: [19.1, 51.9],
  romania: [24.9, 45.9],
  greece: [21.8, 39.1],
  sweden: [18.6, 60.1],
  norway: [8.5, 60.5],
  finland: [25.7, 61.9],
  netherlands: [5.3, 52.1],
  belgium: [4.5, 50.5],
  switzerland: [8.2, 46.8],
  austria: [14.6, 47.5],
  ireland: [-8.2, 53.4],
  portugal: [-8.2, 39.4],
  denmark: [9.5, 56.3],
  belarus: [27.9, 53.7],
  moldova: [28.4, 47.4],
  georgia: [43.4, 42.3],
  armenia: [45.0, 40.1],
  azerbaijan: [47.6, 40.1],
  japan: [138.3, 36.2],
  'south korea': [127.8, 35.9],
  'north korea': [127.5, 40.3],
  taiwan: [121.0, 23.7],
  philippines: [121.8, 12.9],
  vietnam: [108.3, 14.1],
  thailand: [101.0, 15.9],
  myanmar: [95.9, 21.9],
  indonesia: [113.9, -0.8],
  malaysia: [101.9, 4.2],
  bangladesh: [90.4, 23.7],
  'sri lanka': [80.8, 7.9],
  australia: [133.8, -25.3],
  'new zealand': [174.9, -40.9],
  canada: [-106.3, 56.1],
  mexico: [-102.6, 23.6],
  brazil: [-51.9, -14.2],
  argentina: [-63.6, -38.4],
  chile: [-71.5, -35.7],
  colombia: [-74.3, 4.6],
  venezuela: [-66.6, 6.4],
  peru: [-75.0, -9.2],
  ecuador: [-78.2, -1.8],
  haiti: [-72.3, 18.9],
  cuba: [-77.8, 21.5],
  jamaica: [-77.3, 18.1],
};

/**
 * Resolves a free-text country name (as returned by the AI locator) to
 * approximate [longitude, latitude] coordinates. Returns null if unknown.
 * @param {string|null} countryName
 * @returns {[number, number]|null}
 */
export function resolveCoordinates(countryName) {
  if (!countryName) return null;
  const key = countryName.trim().toLowerCase();
  return COUNTRY_COORDINATES[key] || null;
}
