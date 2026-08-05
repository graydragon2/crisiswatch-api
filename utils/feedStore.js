// utils/feedStore.js
//
// Tracks the list of RSS feeds the API aggregates. Seeded from
// data/feeds.json and persisted back to the same file when feeds are
// added/removed via the API, so the list survives process restarts.

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const feedsFilePath = path.join(__dirname, '../data/feeds.json');

function readFeeds() {
  try {
    return JSON.parse(fs.readFileSync(feedsFilePath, 'utf-8'));
  } catch (err) {
    if (err.code === 'ENOENT') return [];
    console.error('Failed to read feeds file:', err);
    return [];
  }
}

function writeFeeds(feeds) {
  fs.writeFileSync(feedsFilePath, JSON.stringify(feeds, null, 2));
}

export function getFeeds() {
  return readFeeds();
}

export function addFeed(url) {
  const feeds = readFeeds();
  if (feeds.some((f) => f.url === url)) return feeds;
  feeds.push({ url, title: url });
  writeFeeds(feeds);
  return feeds;
}

export function removeFeed(url) {
  const feeds = readFeeds().filter((f) => f.url !== url);
  writeFeeds(feeds);
  return feeds;
}
