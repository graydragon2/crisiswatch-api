import Parser from 'rss-parser';

const parser = new Parser();
const feeds = [
  'https://feeds.bbci.co.uk/news/world/rss.xml',
  'https://rss.cnn.com/rss/edition_world.rss',
  'https://www.reutersagency.com/feed/?best-topics=politics',
];

export default async function handler(req, res) {
  const { keywords = [], useAI = true } = req.query;
  const openaiApiKey = process.env.OPENAI_API_KEY;

  const scoreThreat = async (text) => {
    try {
      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${openaiApiKey}`,
        },
        body: JSON.stringify({
          model: 'gpt-4',
          messages: [
            {
              role: 'system',
              content: 'You are a threat analyst. Return a number between 1 (low) and 10 (critical) based on the following text.',
            },
            {
              role: 'user',
              content: text,
            },
          ],
        }),
      });

      const data = await response.json();
      const content = data.choices?.[0]?.message?.content?.trim();
      const score = parseInt(content.match(/\d+/)?.[0], 10);
      return isNaN(score) ? null : score;
    } catch (err) {
      console.error('Threat scoring failed:', err);
      return null;
    }
  };

  try {
    const results = [];

    for (const url of feeds) {
      const feed = await parser.parseURL(url);
      for (const item of feed.items.slice(0, 10)) {
        const text = (item.title || '') + ' ' + (item.contentSnippet || '');

        // Apply keyword filter if keywords provided
        const keywordMatch =
          keywords.length === 0 ||
          keywords.some((kw) =>
            text.toLowerCase().includes(kw.toLowerCase())
          );

        if (!keywordMatch) continue;

        let score = null;

        if (useAI === 'true' && openaiApiKey) {
          score = await scoreThreat(text);
        }

        results.push({
          title: item.title,
          link: item.link,
          pubDate: item.pubDate,
          summary: item.contentSnippet,
          score: score ?? 'N/A',
        });
      }
    }

    res.status(200).json({ threats: results });
  } catch (err) {
    console.error('RSS processing error:', err);
    res.status(500).json({ error: 'RSS or AI scoring failed', debug: err.message });
  }
}
