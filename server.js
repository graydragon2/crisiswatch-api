import express from 'express';
import fetch from 'node-fetch';
import cors from 'cors';
import dotenv from 'dotenv';

dotenv.config();
const app = express();
const port = process.env.PORT || 3001;

app.use(cors());

// Root test route
app.get('/', (req, res) => {
  res.send('CrisisWatch API is live');
});

// ✅ Feeds endpoint
app.get('/api/feeds', async (req, res) => {
  const urls = [
    'https://feeds.bbci.co.uk/news/world/rss.xml',
    'https://rss.cnn.com/rss/edition_world.rss',
    'https://www.reutersagency.com/feed/?best-topics=politics'
  ];

  try {
    const feeds = [];

    for (const url of urls) {
      try {
        const response = await fetch(url);
        const text = await response.text();
        feeds.push({ url, xml: text });
      } catch (err) {
        console.warn(`Failed to fetch ${url}`, err.message);
        feeds.push({ url, error: err.message });
      }
    }

    res.json({ feeds });
  } catch (error) {
    console.error('Feed fetch error:', error);
    res.status(500).json({ error: 'Failed to fetch RSS feeds' });
  }
});

// ✅ DarkWeb endpoint
app.get('/api/darkweb', async (req, res) => {
  const email = req.query.email;
  const apiKey = process.env.LEAKCHECK_API_KEY;
