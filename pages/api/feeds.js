
import fs from 'fs';
import path from 'path';

const feedsFile = path.resolve('./pages/api/data/feeds.json');
const presetsFile = path.resolve('./pages/api/data/presets.json');

// Merge presets into feeds.json if it's empty
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
  // ✅ GET handler - returns all feeds
  if (req.method === 'GET') {
    const feeds = loadFeedsWithPresets();
    return res.status(200).json({ feeds });
  }

  // ✅ POST handler - add a new feed

  if (req.method === 'POST') {
    const { url } = req.body;
    if (!url) return res.status(400).json({ error: 'Missing URL' });

    const feeds = JSON.parse(fs.readFileSync(feedsFile));

    if (feeds.some(feed => feed.url === url)) {
      return res.status(409).json({ error: 'Feed already exists' });
    }

    feeds.push({ url });

    if (feeds.includes(url)) return res.status(409).json({ error: 'Feed already exists' });

    feeds.push(url);

    fs.writeFileSync(feedsFile, JSON.stringify(feeds, null, 2));
    return res.status(201).json({ message: 'Feed added' });
  }


  if (req.method === 'DELETE') {
    const { url } = req.body;
    let feeds = JSON.parse(fs.readFileSync(feedsFile));
    feeds = feeds.filter(f => f.url !== url);
    fs.writeFileSync(feedsFile, JSON.stringify(feeds, null, 2));
    return res.status(200).json({ message: 'Feed removed' });
  }

  res.status(405).json({ error: 'Method not allowed' });
}



  // ✅ DELETE handler - remove a feed
  if (req.method === 'DELETE') {
    const { url } = req.body;
    const feeds = JSON.parse(fs.readFileSync(feedsFile));
    const updated = feeds.filter(f => f !== url);

    fs.writeFileSync(feedsFile, JSON.stringify(updated, null, 2));
    return res.status(200).json({ message: 'Feed removed' });
  }

  // Default
  res.status(405).json({ error: 'Method not allowed' });
}

