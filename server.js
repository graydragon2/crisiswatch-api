// server.js
import https from 'https';
import express from 'express';
import fetch from 'node-fetch';
import cors from 'cors';
import dotenv from 'dotenv';
import Parser from 'rss-parser';

dotenv.config();

const app = express();
const port = process.env.PORT || 3001;

// Create an HTTPS agent that skips certificate verification
const httpsAgent = new https.Agent({ rejectUnauthorized: false });

// Instantiate rss-parser with our custom agent
const parser = new Parser({
  requestOptions: { agent: httpsAgent }
});

app.use(cors());

// Health check
app.get('/', (_req, res) => {
  res.send('CrisisWatch API is live');
});

// RSS Feeds route
app.get('/api/feeds', async (_req, res) => {
  const urls = [
    'https://feeds.bbci.co.uk/news/world/rss.xml',
    'https://rss.cnn.com/rss/edition_world.rss',
    'https://www.reutersagency.com/feed/?best-topics=politics'
  ];

  const results = await Promise.all(
    urls.map(async (url) => {
      try {
        const feed = await parser.parseURL(url);
        return { url, title: feed.title, items: feed.items.slice(0, 5) };
      } catch (err) {
        console.error(`↯ RSS parse error for ${url}:`, err.message);
        return { url, title: null, items: [] };
      }
    })
  );

  res.json({ feeds: results });
});

// Dark Web Email Check
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
    console.error('↯ Darkweb error:', err);
    res.status(500).json({ error: 'Internal server error', debug: err.message });
  }
});

app.listen(port, () => {
  console.log(`CrisisWatch API listening on port ${port}`);
});