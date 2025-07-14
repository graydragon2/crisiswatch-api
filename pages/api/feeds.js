// pages/api/feeds.js
import fs from 'fs';
import path from 'path';
import { IncomingMessage, ServerResponse } from 'http';

const dataDir = path.join(process.cwd(), 'pages', 'api', 'data');
const feedsFile = path.join(dataDir, 'feeds.json');
const presetsFile = path.join(dataDir, 'presets.json');

function ensureDataDir() {
  if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
}

function loadFeedsWithPresets() {
  ensureDataDir();
  if (!fs.existsSync(feedsFile)) {
    fs.writeFileSync(feedsFile, '[]', 'utf-8');
  }

  let feeds = JSON.parse(fs.readFileSync(feedsFile, 'utf-8'));

  // If user hasn't added any feeds yet, populate from presets.json
  if (feeds.length === 0 && fs.existsSync(presetsFile)) {
    const presets = JSON.parse(fs.readFileSync(presetsFile, 'utf-8'));
    fs.writeFileSync(feedsFile, JSON.stringify(presets, null, 2), 'utf-8');
    feeds = presets;
  }

  return feeds;
}

export default function handler(req, res) {
  // GET /api/feeds
  if (req.method === 'GET') {
    const feeds = loadFeedsWithPresets();
    return res.status(200).json({ feeds });
  }

  // POST /api/feeds  { url: 'https://…' }
  if (req.method === 'POST') {
    const { url } = req.body;
    if (!url || typeof url !== 'string') {
      return res.status(400).json({ error: 'Missing or invalid URL' });
    }

    const feeds = loadFeedsWithPresets();

    // prevent duplicates
    if (feeds.find(f => f.url === url)) {
      return res.status(409).json({ error: 'Feed already exists' });
    }

    const updated = [...feeds, { url }];
    fs.writeFileSync(feedsFile, JSON.stringify(updated, null, 2), 'utf-8');

    return res.status(201).json({ feeds: updated });
  }

  // DELETE /api/feeds  { url: 'https://…' }
  if (req.method === 'DELETE') {
    const { url } = req.body;
    if (!url || typeof url !== 'string') {
      return res.status(400).json({ error: 'Missing or invalid URL' });
    }

    const feeds = loadFeedsWithPresets();
    const updated = feeds.filter(f => f.url !== url);

    fs.writeFileSync(feedsFile, JSON.stringify(updated, null, 2), 'utf-8');
    return res.status(200).json({ feeds: updated });
  }

  // anything else
  res.setHeader('Allow', ['GET','POST','DELETE']);
  return res.status(405).end(`Method ${req.method} Not Allowed`);
}