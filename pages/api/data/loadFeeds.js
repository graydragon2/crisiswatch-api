// pages/api/data/loadFeeds.js
import fs from 'fs';
import path from 'path';

const feedsFile = path.resolve('./pages/api/data/feeds.json');
const presetsFile = path.resolve('./pages/api/data/presets.json');

export function loadExistingFeeds() {
  let feeds = [];

  // If feeds.json doesn't exist or is empty, fall back to presets
  if (!fs.existsSync(feedsFile) || fs.readFileSync(feedsFile, 'utf8').trim() === '') {
    const presets = JSON.parse(fs.readFileSync(presetsFile, 'utf8') || '[]');
    fs.writeFileSync(feedsFile, JSON.stringify(presets, null, 2));
    return presets;
  }

  // If feeds.json exists and has data
  try {
    feeds = JSON.parse(fs.readFileSync(feedsFile, 'utf8'));
  } catch (e) {
    console.error('Failed to parse feeds.json:', e);
  }

  return feeds;
}