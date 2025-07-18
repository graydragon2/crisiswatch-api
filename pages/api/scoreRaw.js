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
            content: 'You are an AI threat analyst. Return a JSON object like { "score": <1-10> } based only on the text provided.',
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

    const match = message && message.match(/"score"\s*:\s*(\d+)/i);
    const score = match ? parseInt(match[1], 10) : null;

    if (!score || isNaN(score)) {
      console.error('Invalid AI response:', message);
      return res.status(500).json({ error: 'Invalid score returned from AI' });
    }

    res.status(200).json({ score });
  } catch (error) {
    console.error('Score API error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
}