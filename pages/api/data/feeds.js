import fs from 'fs';
import path from 'path';

const feedsFile = path.resolve('./pages/api/data/feeds.json');
const presetsFile = path.resolve('./pages/api/data/presets.json');

// Load feeds and merge with presets if feeds are empty
export function loadExistingFeeds() {
  // Ensure feeds.json exists
  if (!fs.existsSync(feedsFile)) {
    fs.writeFileSync(feedsFile, '[]');
  }

  const feeds = JSON.parse(fs.readFileSync(feedsFile));

  // If feeds.json is empty, populate with presets
  if (feeds.length === 0 && fs.existsSync(presetsFile)) {
    const presets = JSON.parse(fs.readFileSync(presetsFile));
    fs.writeFileSync(feedsFile, JSON.stringify(presets, null, 2));
    return presets;
  }

  return feeds;
}
