const Parser = require('rss-parser');
const https = require('https');

// Custom parser that ignores TLS certificate issues (temporary!)
const parser = new Parser({
  requestOptions: {
    agent: new https.Agent({ rejectUnauthorized: false }),
  }
});

// Example usage
app.post('/api/threats', async (req, res) => {
  const { url } = req.body;
  if (!url) return res.status(400).json({ error: 'Missing feed URL' });

  try {
    const feed = await parser.parseURL(url);
    res.json({ title: feed.title, items: feed.items });
  } catch (err) {
    console.error('RSS feed parse error:', err.message);
    res.status(500).json({ error: 'Failed to parse feed' });
  }
});
