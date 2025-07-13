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
            content: 'You are an AI threat analyst. Return only a JSON with a numeric "score" field from 1 (low threat) to 10 (high threat).',
          },
          {
            role: 'user',
            content: text,
          },
        ],
      }),
    });

    const data = await response.json();

    // ✅ Debug: Log entire OpenAI response
    console.log("🧠 OpenAI Response:", JSON.stringify(data, null, 2));

    if (!response.ok) {
      return res.status(response.status).json({ error: data.error?.message || 'OpenAI API error' });
    }

    const content = data.choices?.[0]?.message?.content || '';
    let score = null;

    // Try JSON.parse first
    try {
      const parsed = JSON.parse(content);
      score = parsed.score;
    } catch {
      // Fallback: regex parse for score
      const match = content.match(/"score"\s*:\s*(\d+)/i);
      if (match) score = parseInt(match[1], 10);
    }

    if (!score || isNaN(score) || score < 1 || score > 10) {
      console.error("❌ Invalid score content:", content);
      return res.status(500).json({ error: 'Invalid score returned from AI' });
    }

    res.status(200).json({ score });
  } catch (error) {
    console.error('❌ Score API error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
}