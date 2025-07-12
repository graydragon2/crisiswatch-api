// pages/api/darkweb.js

export default async function handler(req, res) {
  const { email } = req.query;

  // Simulate a fake breach for testing
  const fakeData = {
    breaches: [
      {
        Name: "ExampleBreach",
        Description: "Your email was exposed in a test data leak from 2023.",
      },
    ],
  };

  res.status(200).json(fakeData);
}