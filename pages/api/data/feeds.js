import fs from 'fs';
import path from 'path';

const feedsFile = path.resolve('./pages/api/data/feeds.json');
const presetsFile = path.resolve('./pages/api/data/presets.json');

export function loadExistingFeeds() {
  // If feeds.json doesn't exist or is empty, write from presets
  if (!fs.existsSync(feedsFile) || fs.readFileSync(feedsFile, 'utf-8').trim() === '[]') {
    const presets = fs.existsSync(presetsFile)
      ? JSON.parse(fs.readFileSync(presetsFile, 'utf-8'))
      : [];

    fs.writeFileSync(feedsFile, JSON.stringify(presets, null, 2));
    return presets;
  }

  // Otherwise load the current feeds
  const feeds = JSON.parse(fs.readFileSync(feedsFile, 'utf-8'));
  return feeds;
}
