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
            content: 'You are an AI threat analyst. Return only a JSON with a numeric "score" field from 1 to 10.',
          },
          {
            role: 'user',
            content: text,
          },
        ],
      }),
    });

    const data = await response.json();

    // ✅ Debug logs
    console.log("=== OpenAI API Raw Response ===");
    console.log(JSON.stringify(data, null, 2));

    if (!response.ok) {
      return res.status(response.status).json({ error: data.error?.message || 'OpenAI API error' });
    }

    const message = data.choices?.[0]?.message?.content;
    let score = null;

    try {
      const parsed = JSON.parse(message);
      score = parsed.score;
    } catch (e) {
      console.warn("Failed to parse JSON from OpenAI message:", message);
    }

    if (typeof score !== 'number' || score < 1 || score > 10) {
      console.error("Invalid score:", score);
      return res.status(500).json({ error: 'Invalid score returned from AI' });
    }

    res.status(200).json({ score });
  } catch (error) {
    console.error('Score API error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
}