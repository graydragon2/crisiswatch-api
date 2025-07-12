export default async function handler(req, res) {
  const { email } = req.query;
  const apiKey = process.env.LEAKCHECK_API_KEY;

  if (!email || !apiKey) {
    return res.status(400).json({ error: 'Missing email or API key.' });
  }

  try {
    const response = await fetch(
      `https://leakcheck.io/api?key=${apiKey}&check=${encodeURIComponent(email)}&type=email`
    );

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || 'API error');
    }

    return res.status(200).json({ breaches: data.result || [] });
  } catch (error) {
    console.error('Dark Web API error:', error.message);
    return res.status(500).json({ error: 'Error checking breach' });
  }
}