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
              'You are an AI threat analyst. Return ONLY a JSON string like: {"score": 7} — with a score between 1 (low) and 10 (high).',
          },
          {
            role: 'user',
            content: text,
          },
        ],
        temperature: 0.4,
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      return res.status(response.status).json({ error: data.error?.message || 'OpenAI API error' });
    }

    const message = data.choices?.[0]?.message?.content;
    let scoreMatch;

    try {
      const parsed = JSON.parse(message);
      if (parsed && typeof parsed.score === 'number') {
        return res.status(200).json({ score: parsed.score });
      }
    } catch {
      scoreMatch = message?.match(/"score"\s*:\s*(\d+)/i);
      if (scoreMatch) {
        return res.status(200).json({ score: parseInt(scoreMatch[1], 10) });
      }
    }

    return res.status(500).json({ error: 'Invalid score returned from AI' });
  } catch (error) {
    console.error('AI scoring error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}