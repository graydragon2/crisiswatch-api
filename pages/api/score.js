import { NextResponse } from 'next/server';

export async function POST(req) {
  try {
    const body = await req.json();
    const { title, description, location } = body;

    // Rule-based fallback
    const lowerTitle = title.toLowerCase();
    const keywordsCritical = ["shooting", "explosion", "chemical", "hostage", "riots"];
    const keywordsModerate = ["protest", "power outage", "flood", "suspicious"];
    const localMatch = lowerTitle.includes(location.toLowerCase());

    const matchCritical = keywordsCritical.some(k => lowerTitle.includes(k));
    const matchModerate = keywordsModerate.some(k => lowerTitle.includes(k));

    let score = "Ignore";
    if (matchCritical && localMatch) score = "Critical";
    else if (matchModerate && localMatch) score = "Moderate";

    // If scoring is ambiguous, escalate to OpenAI (optional)
    if (process.env.OPENAI_API_KEY && score === "Moderate") {
      const prompt = `You are a threat classification AI for a security monitoring app.\nClassify this event based on severity: Ignore / Moderate / Critical.\n\nUser location: ${location}\nEvent title: \"${title}\"\nEvent description: \"${description}\"\n\nExplain the score and return JSON: { \"score\": \"...\", \"reason\": \"...\" }`;

      const openaiRes = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${process.env.OPENAI_API_KEY}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          model: "gpt-4",
          messages: [{ role: "user", content: prompt }],
          temperature: 0.2
        })
      });

      const json = await openaiRes.json();
      try {
        const parsed = JSON.parse(json.choices[0].message.content);
        return NextResponse.json({ score: parsed.score, reason: parsed.reason, ai: true });
      } catch (e) {
        console.warn("AI parse failed", json);
      }
    }

    return NextResponse.json({ score, reason: "Scored using rule-based logic.", ai: false });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: 'Failed to classify threat' }, { status: 500 });
  }
}
