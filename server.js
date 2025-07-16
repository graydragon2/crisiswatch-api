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

// global JSON body parser
app.use(express.json());
app.use(cors());

// bypass bad certs for RSS parser
const httpsAgent = new https.Agent({ rejectUnauthorized: false });
const parser = new Parser({ requestOptions: { agent: httpsAgent } });

app.get('/', (req, res) => {
  res.send('CrisisWatch API is live');
});

// 1) RSS feeds
app.get('/api/feeds', async (req, res) => {
  const urls = [
    'https://feeds.bbci.co.uk/news/world/rss.xml',
    // you can drop CNN if it never works, or keep trying:
    'https://rss.cnn.com/rss/edition_world.rss',
    'https://www.reutersagency.com/feed/?best-topics=politics'
  ];
  try {
    const results = await Promise.all(urls.map(async (u) => {
      try {
        const feed = await parser.parseURL(u);
        return { url: u, title: feed.title, items: feed.items.slice(0,5) };
      } catch(err) {
        console.error(`↯ RSS parse error for ${u}:`, err.message);
        return { url: u, title: null, items: [] };
      }
    }));
    res.json({ feeds: results });
  } catch(err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch feeds', debug: err.message });
  }
});

// 2) Dark‑web check
app.get('/api/darkweb', async (req, res) => {
  const email = req.query.email;
  const key = process.env.LEAKCHECK_API_KEY;
  if (!email || !key) return res.status(400).json({ error:'Missing email or API key' });
  try {
    const url = `https://leakcheck.net/api/public?key=${key}&check=${encodeURIComponent(email)}&type=email`;
    const r = await fetch(url);
    const j = await r.json();
    if (!r.ok) return res.status(502).json({ error:'LeakCheck error', details:j });
    res.json(j);
  } catch(err) {
    console.error(err);
    res.status(500).json({ error:'Internal error', debug: err.message });
  }
});

// 3) AI scoring
app.post('/api/score', async (req, res) => {
  const { text } = req.body;
  const key = process.env.OPENAI_API_KEY;
  if (!text || !key) return res.status(400).json({ error:'Missing text or API key' });
  try {
    const ai = await fetch('https://api.openai.com/v1/chat/completions', {
      method:'POST',
      headers:{
        'Content-Type':'application/json',
        Authorization:`Bearer ${key}`
      },
      body: JSON.stringify({
        model: 'gpt-4',
        messages: [
          { role:'system', content:
            'You are a cybersecurity analyst. Score the threat level of this message from 1 (low) to 10 (critical). Return only the number.' },
          { role:'user', content: text }
        ]
      })
    });
    const { choices } = await ai.json();
    const raw = choices?.[0]?.message?.content.trim() || '';
    const n = parseInt(raw,10);
    if (isNaN(n)) throw new Error('Invalid number from AI → ' + raw);
    res.json({ score: n });
  } catch(err) {
    console.error('AI scoring error:', err);
    res.status(500).json({ error:'Failed to score threat', debug: err.message });
  }
});

app.listen(port, ()=>console.log(`API live on ${port}`));
