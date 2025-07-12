import express from 'express';
import fetch from 'node-fetch';
import cors from 'cors';
import dotenv from 'dotenv';

dotenv.config();
const app = express();
const port = process.env.PORT || 3001;

app.use(cors());

// Test route
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
    const responses = await Promise.all(
      urls.map(url => fetch(url).then(r => r.text()))
    );

    res.json({
      feeds: responses.map((data, idx) => ({
        url: urls[idx],
        xml: data
      }))
    });
  } catch (error) {
    console.error('Feed fetch error:', error);
    res.status(500).json({ error: 'Failed to fetch RSS feeds' });
  }
});

// ✅ Dark web lookup route
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
    console.error(
