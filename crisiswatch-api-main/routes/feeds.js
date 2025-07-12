// routes/feeds.js
const express = require('express');
const router = express.Router();
const Parser = require('rss-parser');
const parser = new Parser();

router.get('/', async (req, res) => {
  try {
    const feed = await parser.parseURL('https://www.reutersagency.com/feed/?best-topics=politics');
    res.json(feed);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch RSS feed', details: err.message });
  }
});

module.exports = router;
