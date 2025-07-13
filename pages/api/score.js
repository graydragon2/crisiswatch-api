// pages/api/score.js
return res.status(500).json({ error: 'Test crash — render is updating' });
console.log('OpenAI API Key used:', openaiApiKey);
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
            content: 'You are an AI threat analyst. Return only this exact JSON: { "score": number } — the score must be between 1 and 10.',
          },
          {
            role: 'user',
            content: text,
          },
        ],
      }),
    });

    const data = await response.json();

// 🔍 Log response BEFORE checking status
console.log('OpenAI raw response:', JSON.stringify(data, null, 2));

if (!response.ok) {
  return res.status(response.status).json({ error: data.error?.message || 'OpenAI API error' });
}

    // ✅ Log the actual OpenAI response
    console.log('OpenAI response:', JSON.stringify(data, null, 2));

    const message = data.choices?.[0]?.message?.content || '';
    const match = message.match(/"score"\s*:\s*(\d+)/i);
    const score = match ? parseInt(match[1], 10) : null;

    if (!score || isNaN(score)) {
      return res.status(500).json({ error: 'Invalid score returned from AI', raw: message });
    }

    res.status(200).json({ score });
  } catch (error) {
    console.error('Score API error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
}