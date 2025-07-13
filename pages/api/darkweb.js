export default async function handler(req, res) {
  const email = req.query.query; // We expect ?query= in the URL
  const apiKey = process.env.LEAKCHECK_API_KEY;

  if (!email || !apiKey) {
    return res.status(400).json({ error: 'Missing email or API key' });
  }

  try {
    const response = await fetch(
      `https://leakcheck.io/api?key=${apiKey}&check=${encodeURIComponent(email)}&type=email`
    );

    const data = await response.json();

    if (!response.ok) {
      return res.status(response.status).json({ error: data.message || 'Error checking breach' });
    }

    res.status(200).json({
      found: data.success && data.result.length > 0,
      entries: data.result || [],
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Internal server error' });
  }
}