import fs from 'fs';
import path from 'path';

const feedsFile = path.resolve('./pages/api/data/feeds.json');
const presetsFile = path.resolve('./pages/api/data/presets.json');

function loadFeedsWithPresets() {
  if (!fs.existsSync(feedsFile)) fs.writeFileSync(feedsFile, '[]');

  const feeds = JSON.parse(fs.readFileSync(feedsFile));
  if (feeds.length === 0 && fs.existsSync(presetsFile)) {
    const presets = JSON.parse(fs.readFileSync(presetsFile));
    fs.writeFileSync(feedsFile, JSON.stringify(presets, null, 2));
    return presets;
  }
  return feeds;
}

export default function handler(req, res) {
  if (req.method === 'GET') {
    const feeds = loadFeedsWithPresets();
    return res.status(200).json({ feeds });
  }

  res.status(405).json({ error: 'Method not allowed' });
}

