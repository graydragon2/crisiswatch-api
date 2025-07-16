// server.js
import express from 'express';
import fetch from 'node-fetch';
import cors from 'cors';
import dotenv from 'dotenv';
import Parser from 'rss-parser';
import https from 'https';

dotenv.config();
const app = express();
const port = process.env.PORT || 3001;

// ─── MIDDLEWARE ────────────────────────────────────────────────────────────────
// enable CORS
app.use(cors());
// parse JSON bodies
app.use(express.json());

// ─── RSS PARSER (with TLS bypass) ──────────────────────────────────────────────
const parser = new Parser({
  requestOptions: {
    agent: new https.Agent({ rejectUnauthorized: false })
  }
});

// ─── ROUTES ─────────────────────────────────────────────────────────────────────

// Health‑check
app.get('/', (_req, res) => {
  res.send('CrisisWatch API is live');
});

// GET /api/feeds
app.get('/api/feeds', async (_req, res) => {
  const urls = [
    'https://feeds.bbci.co.uk/news/world/rss.xml',
    'https://rss.cnn.com/rss/edition_world.rss',
    'https://www.reutersagency.com/feed/?best-topics=politics'
  ];

  try {
    const results = await Promise.all(
      urls.map(async (url) => {
        const feed = await parser.parseURL(url);
        return { url, title: feed.title, items: feed.items.slice(0, 5) };
      })
    );
    res.json({ feeds: results });
  } catch (err) {
    console.error('RSS parse error:', err.message);
    res.status(500).json({ error: 'Failed to fetch/parse RSS feeds', debug: err.message });
  }
});

// GET /api/darkweb?email=someone@domain.com
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
    console.error('Dark‑web error:', err);
    res.status(500).json({ error: 'Internal server error', debug: err.message });
  }
});

// POST /api/score   ← new
app.post('/api/score', async (req, res) => {
  const { text } = req.body;
  const apiKey    = process.env.OPENAI_API_KEY;
  if (!text || !apiKey) {
    return res.status(400).json({ error: 'Missing text or API key' });
  }

  try {
    const aiRes = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type':  'application/json',
        Authorization:   `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model:    'gpt-4',
        messages: [
          {
            role:    'system',
            content: 'You are a cybersecurity analyst. Score the threat level of this message on a scale from 1 (very low) to 10 (extreme threat). Return only the number.',
          },
          { role: 'user', content: text },
        ],
      }),
    });

    const data   = await aiRes.json();
    const result = data.choices?.[0]?.message?.content.trim() || '';
    const score  = parseInt(result, 10);
    if (isNaN(score)) throw new Error(`Invalid AI response: ${result}`);

    res.json({ score });
  } catch (err) {
    console.error('Scoring error:', err);
    res.status(500).json({ error: 'Failed to score threat' });
  }
});

// ─── START SERVER ────────────────────────────────────────────────────────────────
app.listen(port, () => {
  console.log(`CrisisWatch API listening on port ${port}`);
});
