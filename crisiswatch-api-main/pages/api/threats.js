import Parser from 'rss-parser';

const parser = new Parser();

// Example feeds
const FEEDS = {
  gdelt: 'https://blog.gdeltproject.org/feed/',
  bbc: 'http://feeds.bbci.co.uk/news/world/rss.xml',
  cnn: 'http://rss.cnn.com/rss/edition.rss'
};

export default async function handler(req, res) {
  const { sources = ['gdelt', 'bbc'], keywords = [] } = req.query;

  try {
    const results = [];

    for (const src of sources) {
      if (FEEDS[src]) {
        const feed = await parser.parseURL(FEEDS[src]);
        const filteredItems = feed.items.filter(item =>
          keywords.length === 0 || keywords.some(kw =>
            (item.title + item.contentSnippet).toLowerCase().includes(kw.toLowerCase())
          )
        );
        results.push(...filteredItems.map(item => ({ ...item, source: src })));
      }
    }

    res.status(200).json(results);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch feeds' });
  }
}
