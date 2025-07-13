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
            content: 'You are an AI threat analyst. Only respond with a JSON object: {"score": 1–10}, where 1 = low threat and 10 = high threat. No other commentary.',
          },
          {
            role: 'user',
            content: text,
          },
        ],
      }),
    });

    const data = await response.json();
    const message = data.choices?.[0]?.message?.content?.trim();

    console.log('OpenAI raw response:', message);

    // Try to parse JSON directly
    try {
      const parsed = JSON.parse(message);
      if (typeof parsed.score === 'number') {
        return res.status(200).json({ score: parsed.score });
      }
    } catch (jsonErr) {
      // Fallback to regex match
      const match = message && message.match(/"score"\s*:\s*(\d+)/i);
      const score = match ? parseInt(match[1], 10) : null;

      if (score) {
        return res.status(200).json({ score });
      }

      return res.status(500).json({ error: 'Failed to extract score from response', raw: message });
    }

    return res.status(500).json({ error: 'Invalid response format from OpenAI', raw: message });
  } catch (error) {
    console.error('Score API error:', error);
    return res.status(500).json({ error: 'Internal server error', debug: error.message });
  }
}