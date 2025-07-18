import express from 'express';
import fetch from 'node-fetch';
import cors from 'cors';
import dotenv from 'dotenv';
import Parser from 'rss-parser';
import rssRoute from './routes/rss.js';
import https from 'https'; // ✅ For TLS bypass

dotenv.config();
const app = express();
const port = process.env.PORT || 3001;

// ✅ Custom parser with TLS bypass
const parser = new Parser({
  requestOptions: {
    agent: new https.Agent({ rejectUnauthorized: false })
  }
});

app.use(cors());
app.use('/api/feeds', rssRoute);


// ✅ Root test route
app.get('/', (req, res) => {
  res.send('CrisisWatch API is live');
});

// ✅ RSS Feeds route
app.get('/api/feeds', async (req, res) => {
  const urls = [
    'https://feeds.bbci.co.uk/news/world/rss.xml',
    'https://rss.cnn.com/rss/edition_world.rss',
    'https://www.reutersagency.com/feed/?best-topics=politics'
  ];

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

// ✅ Dark Web Email Check
app.get('/api/darkweb', async (req, res) => {
  const email = req.query.email;
  const apiKey = process.env.LEAKCHECK_API_KEY;

  if (!email || !apiKey) {
    return res.status(400).json({ error: 'Missing email or API key' });
  }

  try {
    const leakURL = `https://leakcheck.net/api/public?key=${apiKey}&check=${encodeURIComponent(email)}&type=email`;
    const response = await fetch(leakURL);
    const json = await response.json();

    if (!response.ok || json.error) {
      return res.status(502).json({ error: 'LeakCheck API error', details: json });
    }

    res.json(json);
  } catch (err) {
    console.error('Backend error:', err);
    res.status(500).json({ error: 'Internal server error', debug: err.message });
  }
});

// ✅ Threat Feed Scoring with keyword filter
app.post('/api/threats', express.json(), async (req, res) => {
  const { sources = ['gdelt', 'bbc', 'cnn'], keywords = [] } = req.body;

  const FEEDS = {
    gdelt: 'https://blog.gdeltproject.org/feed/',
    bbc: 'https://feeds.bbci.co.uk/news/world/rss.xml',
    cnn: 'https://rss.cnn.com/rss/edition.rss'
  };

  const results = [];

  try {
    for (const src of sources) {
      const FEED_URL = FEEDS[src];
      if (!FEED_URL) continue;

      const feed = await parser.parseURL(FEED_URL);

      const filteredItems = feed.items.filter(item =>
        keywords.length === 0 ||
        keywords.some(kw =>
          (item.title || '').toLowerCase().includes(kw.toLowerCase()) ||
          (item.contentSnippet || '').toLowerCase().includes(kw.toLowerCase())
        )
      );

      results.push(...filteredItems.map(item => ({
        ...item,
        source: src
      })));
    }

    res.status(200).json({ threats: results });
  } catch (err) {
    console.error('Threat fetch error:', err.message);
    res.status(500).json({ error: 'Failed to fetch threats', debug: err.message });
  }
});

// ✅ Start server
app.listen(port, () => {
  console.log(`CrisisWatch API listening on port ${port}`);
});
