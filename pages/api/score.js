// pages/api/score.js

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { text } = req.body;
  const openaiApiKey = process.env.OPENAI_API_KEY;

  if (!text || !openaiApiKey) {
    return res.status(400).json({ error: 'Missing input text or API key' });
  }

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
            content: 'You are an AI threat analyst. Only respond with a single line JSON like {"score": 7} — a number from 1 (low threat) to 10 (high threat). Do NOT explain.',
          },
          {
            role: 'user',
            content: text,
          },
        ],
      }),
    });

    const data = await response.json();
    const data = await response.json();
    console.log('🔍 OpenAI raw response:', data); // <-- Add this

const content = data.choices?.[0]?.message?.content;
const content = data.choices?.[0]?.message?.content;

    console.log('AI raw response:', content); // 🔍 Log this for debugging

    // Try parsing content directly as JSON
    try {
      const parsed = JSON.parse(content);
      if (typeof parsed.score === 'number') {
        return res.status(200).json({ score: parsed.score });
      }
    } catch {
      // Fallback: extract with regex
      const match = content?.match(/"score"\s*:\s*(\d+)/i);
      if (match) {
        const score = parseInt(match[1], 10);
        return res.status(200).json({ score });
      }
    }

    return res.status(500).json({ error: 'Failed to extract score from AI response', raw: content });
  } catch (error) {
    console.error('Score API error:', error);
    return res.status(500).json({ error: 'Internal server error', debug: error.message });
  }
}