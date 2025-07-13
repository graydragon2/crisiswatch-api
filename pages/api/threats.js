import Parser from 'rss-parser';

const parser = new Parser();

export default async function handler(req, res) {
  const feeds = [
    'https://feeds.bbci.co.uk/news/world/rss.xml',
    'https://rss.cnn.com/rss/edition_world.rss',
    'https://www.reutersagency.com/feed/?best-topics=politics',
  ];

  // OpenAI threat scoring function
  const scoreThreat = async (text) => {
    try {
      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        },
        body: JSON.stringify({
          model: 'gpt-4',
          messages: [
            {
              role: 'system',
              content: 'You are a threat analyst. Return a number only between 1 and 10 indicating the threat level.',
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
    const results = await Promise.all(
      feeds.map(async (url) => {
        const feed = await parser.parseURL(url);
        const items = await Promise.all(
          feed.items.slice(0, 5).map(async (item) => {
            const score = await scoreThreat(item.title + ' ' + (item.contentSnippet || ''));
            return {
              title: item.title,
              link: item.link,
              pubDate: item.pubDate,
              score,
            };
          })
        );
        return items;
      })
    );

    const flat = results.flat();
    res.status(200).json({ items: flat });
  } catch (err) {
    console.error('RSS processing error:', err);
    res.status(500).json({ error: 'RSS feed or scoring failure', debug: err.message });
  }
}