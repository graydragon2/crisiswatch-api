// pages/api/threats.js

import fs from 'fs';
import path from 'path';
import Parser from 'rss-parser';

const feedsFile = path.resolve('./pages/api/data/feeds.json');
const parser = new Parser();

export default async function handler(req, res) {
  let feeds = [];
  if (fs.existsSync(feedsFile)) {
    feeds = JSON.parse(fs.readFileSync(feedsFile));
  }

  if (!feeds.length) return res.status(400).json({ error: 'No feeds available' });

  const scoreThreat = async (text) => {
    try {
      const response = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        },
        body: JSON.stringify({
          model: "gpt-4",
          messages: [
            {
              role: "system",
              content: "You are a cybersecurity analyst. Score the following article from 0 (no threat) to 10 (critical threat). Only return a number.",
            },
            {
              role: "user",
              content: text,
            },
          ],
        }),
      });

      const data = await response.json();
      const raw = data.choices?.[0]?.message?.content || "0";
      return parseInt(raw.match(/\d+/)?.[0]) || 0;
    } catch (err) {
      console.error("OpenAI error:", err);
      return 0;
    }
  };

  const allItems = [];

  for (const feed of feeds) {
    const parsed = await parser.parseURL(feed.url);
    const items = parsed.items.map(item => ({
      title: item.title,
      link: item.link,
      summary: item.contentSnippet || item.content || item.summary || '',
      pubDate: item.pubDate,
    }));
    allItems.push(...items);
  }

  const scored = await Promise.all(
    allItems.map(async (item) => {
      const score = await scoreThreat(item.title + ". " + item.summary);
      return { ...item, score };
    })
  );

  res.status(200).json({ threats: scored });
}
