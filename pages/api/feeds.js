// pages/api/feeds.js
import fs from 'fs';
import path from 'path';

const filePath = path.join(process.cwd(), 'data', 'feeds.json');

function readFeeds() {
  if (!fs.existsSync(filePath)) return [];
  const data = fs.readFileSync(filePath, 'utf8');
  return JSON.parse(data || '[]');
}

function saveFeeds(feeds) {
  fs.writeFileSync(filePath, JSON.stringify(feeds, null, 2));
}

export default function handler(req, res) {
  if (req.method === 'GET') {
    return res.status(200).json(readFeeds());
  }

  if (req.method === 'POST') {
    const { url } = req.body;
    const feeds = readFeeds();
    if (!feeds.includes(url)) {
      feeds.push(url);
      saveFeeds(feeds);
    }
    return res.status(200).json({ success: true, feeds });
  }

  if (req.method === 'DELETE') {
    const { url } = req.body;
    const feeds = readFeeds().filter((feed) => feed !== url);
    saveFeeds(feeds);
    return res.status(200).json({ success: true, feeds });
  }

  res.status(405).json({ error: 'Method not allowed' });
}
