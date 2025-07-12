// pages/api/darkweb.js

export default async function handler(req, res) {
  const { email } = req.query;

  if (!email) {
    return res.status(400).json({ error: 'Missing email' });
  }

  // Simulate a fake breach if email contains "test"
  const hasBreach = email.toLowerCase().includes('test');

  const response = hasBreach
    ? {
        breaches: [
          {
            Name: "ExampleBreach",
            Description: "Your email was exposed in a test data leak from 2023.",
          },
          {
            Name: "SimulatedHackersDB",
            Description: "This is a second fake breach to show multiple results.",
          },
        ],
      }
    : { breaches: [] };

  return res.status(200).json(response);
}
}