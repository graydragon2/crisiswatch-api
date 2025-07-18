import express from 'express';
import Parser from 'rss-parser';
import https from 'https';

const router = express.Router();

// Configure parser with TLS bypass
const parser = new Parser({
  requestOptions: {
    agent: new https.Agent({ rejectUnauthorized: false })
  }
});

const urls = [
  'https://feeds.bbci.co.uk/news/world/rss.xml',
  'https://rss.cnn.com/rss/edition_world.rss',
  'https://www.reutersagency.com/feed/?best-topics=politics'
];

router.get('/', async (req, res) => {
  try {
    const results = await Promise.all(
      urls.map(async url => {
        const feed = await parser.parseURL(url);
        return { url, title: feed.title, items: feed.items.slice(0, 5) };
      })
    );

    res.json({ feeds: results });
  } catch (error) {
    console.error('RSS feed parse error:', error.message);
    res.status(500).json({ error: 'Failed to fetch or parse RSS feeds', debug: error.message });
  }
});

export default router;

