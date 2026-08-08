// utils/locationStore.js
//
// Tracks a watchlist of zip codes for the "Watched Locations" dashboard
// feature. Same persistence pattern as feedStore.js/keywordStore.js.

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const locationsFilePath = path.join(__dirname, '../data/locations.json');

function readLocations() {
  try {
    return JSON.parse(fs.readFileSync(locationsFilePath, 'utf-8'));
  } catch (err) {
    if (err.code === 'ENOENT') return [];
    console.error('Failed to read locations file:', err);
    return [];
  }
}

function writeLocations(locations) {
  fs.writeFileSync(locationsFilePath, JSON.stringify(locations, null, 2));
}

export function getLocations() {
  return readLocations();
}

export function addLocation(zip) {
  const locations = readLocations();
  const normalized = zip.trim();
  if (!normalized || locations.includes(normalized)) return locations;
  locations.push(normalized);
  writeLocations(locations);
  return locations;
}

export function removeLocation(zip) {
  const normalized = zip.trim();
  const locations = readLocations().filter((z) => z !== normalized);
  writeLocations(locations);
  return locations;
}
