export default async function handler(req, res) {
  const email = req.query.query; // we use "query" to match frontend call
  const apiKey = process.env.LEAKCHECK_API_KEY;

  if (!email || !apiKey) {
    return res.status(400).json({ error: 'Missing email or API key' });
  }

  try {
    const leakURL = `https://leakcheck.net/api/public?key=${apiKey}&check=${encodeURIComponent(email)}&type=email`;
    const response = await fetch(leakURL);
    const json = await response.json();

    if (!response.ok || json.error) {
      return res.status(502).json({ error: 'LeakCheck API error', details: json });
    }

    res.status(200).json({
      found: json.found || false,
      entries: json.result || [],
    });
  } catch (err) {
    console.error('DarkWeb API error:', err);
    res.status(500).json({ error: 'Internal server error', debug: err.message });
  }
}