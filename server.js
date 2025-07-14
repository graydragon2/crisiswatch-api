// server.js
import express from 'express';
import fetch from 'node-fetch';
import https from 'https';
import cors from 'cors';
import dotenv from 'dotenv';
import Parser from 'rss-parser';

dotenv.config();
const app = express();
const port = process.env.PORT || 3001;

// JSON bodies if you ever POST/DELETE
app.use(express.json());
app.use(cors());

// plain rss-parser instance (no built-in HTTP)
const parser = new Parser();

// an https.Agent that ignores invalid certs
const httpsAgent = new https.Agent({ rejectUnauthorized: false });

// healthcheck
app.get('/', (req, res) => {
  res.send('CrisisWatch API is live');
});

// fetch & parse multiple feeds
app.get('/api/feeds', async (req, res) => {
  const urls = [
    'https://feeds.bbci.co.uk/news/world/rss.xml',
    'https://rss.cnn.com/rss/edition_world.rss',
    'https://www.reutersagency.com/feed/?best-topics=politics'
  ];

  try {
    const results = await Promise.all(
      urls.map(async (url) => {
        // 1️⃣ manually fetch the XML with our custom agent
        const response = await fetch(url, { agent: httpsAgent });
        const xml = await response.text();

        // 2️⃣ parse the XML string
        const feed = await parser.parseString(xml);
        return {
          url,
          title: feed.title,
          items: feed.items.slice(0, 5)
        };
      })
    );
    res.json({ feeds: results });
  } catch (err) {
    console.error('RSS feed parse error:', err.message);
    res
      .status(500)
      .json({ error: 'Failed to fetch or parse RSS feeds', debug: err.message });
  }
});

// dark-web endpoint (unchanged)
app.get('/api/darkweb', async (req, res) => {
  const email = req.query.email;
  const apiKey = process.env.LEAKCHECK_API_KEY;
  if (!email || !apiKey)
    return res.status(400).json({ error: 'Missing email or API key' });

  try {
    const leakURL = `https://leakcheck.net/api/public?key=${apiKey}&check=${encodeURIComponent(
      email
    )}&type=email`;
    const response = await fetch(leakURL);
    const json = await response.json();

    if (!response.ok || json.error)
      return res.status(502).json({ error: 'LeakCheck API error', details: json });

    res.json(json);
  } catch (err) {
    console.error('Backend error:', err);
    res.status(500).json({ error: 'Internal server error', debug: err.message });
  }
});

// kick off
app.listen(port, () => {
  console.log(`CrisisWatch API listening on port ${port}`);
});