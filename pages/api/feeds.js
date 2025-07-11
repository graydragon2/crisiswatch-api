import fs from 'fs';
import path from 'path';

const feedsFile = path.join(process.cwd(), 'api/data', 'feeds.json');

export default async function handler(req, res) {
  if (req.method === 'GET') {
    try {
      const feeds = JSON.parse(fs.readFileSync(feedsFile, 'utf-8') || '[]');
      return res.status(200).json(feeds);
    } catch (err) {
      return res.status(500).json({ error: 'Failed to read feeds.' });
    }
  }

  if (req.method === 'POST') {
    const { url } = req.body;
    try {
      let feeds = [];
      if (fs.existsSync(feedsFile)) {
        feeds = JSON.parse(fs.readFileSync(feedsFile, 'utf-8') || '[]');
      }
      if (!feeds.includes(url)) feeds.push(url);
      fs.writeFileSync(feedsFile, JSON.stringify(feeds, null, 2));
      return res.status(200).json({ feeds });
    } catch (err) {
      return res.status(500).json({ error: 'Failed to save feed.' });
    }
  }

  if (req.method === 'DELETE') {
    const { url } = req.body;
    try {
      let feeds = JSON.parse(fs.readFileSync(feedsFile, 'utf-8') || '[]');
      feeds = feeds.filter((f) => f !== url);
      fs.writeFileSync(feedsFile, JSON.stringify(feeds, null, 2));
      return res.status(200).json({ feeds });
    } catch (err) {
      return res.status(500).json({ error: 'Failed to delete feed.' });
    }
  }

  return res.status(405).end();
}
