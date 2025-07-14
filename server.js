// server.js
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';  // ← disable cert checks globally

import express from 'express';
import fetch from 'node-fetch';
import https from 'https';
import cors from 'cors';
import dotenv from 'dotenv';
import Parser from 'rss-parser';

dotenv.config();

const app = express();
const port = process.env.PORT || 3001;
app.use(cors());
app.use(express.json());

const parser = new Parser();

// HTTPS agent that ignores invalid certs
const httpsAgent = new https.Agent({ rejectUnauthorized: false });

// Helper to pick our agent for HTTPS URLs
const agentCallback = (parsedURL) => {
  if (parsedURL.protocol === 'https:') return httpsAgent;
  // for http URLs you could return a http.Agent, or just leave undefined
};

/**
 * Healthcheck
 */
app.get('/', (_req, res) => {
  res.send('CrisisWatch API is live');
});

/**
 * GET /api/feeds
 * Fetch & parse multiple RSS feeds, ignoring TLS errors
 */
app.get('/api/feeds', async (_req, res) => {
  const urls = [
    'https://feeds.bbci.co.uk/news/world/rss.xml',
    'https://rss.cnn.com/rss/edition_world.rss',
    'https://www.reutersagency.com/feed/?best-topics=politics'
  ];

  try {
    const feeds = await Promise.all(
      urls.map(async (url) => {
        // fetch the raw XML using our custom agent
        const response = await fetch(url, { agent: agentCallback });
        const xml = await response.text();

        // parse it with rss-parser
        const feed = await parser.parseString(xml);
        return {
          url,
          title: feed.title,
          items: feed.items.slice(0, 5)
        };
      })
    );

    res.json({ feeds });
  } catch (err) {
    console.error('RSS feed parse error:', err.message);
    res
      .status(500)
      .json({ error: 'Failed to fetch or parse RSS feeds', debug: err.message });
  }
});

/**
 * GET /api/darkweb?email=...
 * Dark-web email breach check (unchanged)
 */
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

/**
 * Start the server
 */
app.listen(port, () => {
  console.log(`CrisisWatch API listening on port ${port}`);
});