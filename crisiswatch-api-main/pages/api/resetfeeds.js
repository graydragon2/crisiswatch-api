import fs from 'fs';
import path from 'path';

export default function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Only POST allowed' });
  }

  const feedsFile = path.resolve('./pages/api/data/feeds.json');
  const presetsFile = path.resolve('./pages/api/data/presets.json');

  try {
    const presets = JSON.parse(fs.readFileSync(presetsFile, 'utf-8'));
    fs.writeFileSync(feedsFile, JSON.stringify(presets, null, 2));
    res.status(200).json({ success: true, message: 'Feeds reset from presets.', count: presets.length });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to reset feeds.' });
  }
}
