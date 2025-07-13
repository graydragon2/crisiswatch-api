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
    const message = data.choices?.[0]?.message?.content;
    console.log('🧠 Raw AI message:', message);

    let score;
    try {
      const json = JSON.parse(message);
      score = json.score;
    } catch {
      const match = message && message.match(/"score"\s*:\s*(\d+)/i);
      score = match ? parseInt(match[1], 10) : null;
    }

    if (!score || score < 1 || score > 10) {
      throw new Error('Invalid score returned from AI');
    }

    res.status(200).json({ score });
  } catch (error) {
    console.error('AI scoring error:', error);
    res.status(500).json({ error: 'Failed to score threat' });
  }
}