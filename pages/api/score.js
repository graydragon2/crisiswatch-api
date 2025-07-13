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
            content:
              'You are an AI threat analyst. Return ONLY a JSON like this: { "score": 7 } where score is from 1 (low) to 10 (high). No explanation.',
          },
          {
            role: 'user',
            content: text,
          },
        ],
      }),
    });

    const data = await response.json();

    // Log full response from OpenAI
    console.log('🔥 OpenAI response:', JSON.stringify(data, null, 2));

    const message = data.choices?.[0]?.message?.content || '';

    // Attempt to parse the score using safe JSON parse
    let parsed = null;
    try {
      parsed = JSON.parse(message);
    } catch (e) {
      // fallback regex
      const match = message.match(/"score"\s*:\s*(\d+)/i);
      if (match) {
        parsed = { score: parseInt(match[1], 10) };
      }
    }

    if (!parsed || !parsed.score || isNaN(parsed.score)) {
      throw new Error('Invalid score returned from AI');
    }

    res.status(200).json({ score: parsed.score });
  } catch (error) {
    console.error('AI scoring error:', error);
    res.status(500).json({ error: error.message || 'Internal server error' });
  }
}