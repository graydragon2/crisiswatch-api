// utils/phishingAnalyzer.js
//
// Claude-based phishing risk analysis for the dashboard's Phishing
// Detection tool (previously a placeholder — see PR that introduced this
// file). Accepts pasted email/message text, a URL, or a screenshot image.
//
// For URLs, this only ever analyzes the URL string's structure (domain,
// TLD, encoding, lookalike patterns) — it never fetches the target page.
// Fetching an arbitrary user-supplied URL server-side would be an SSRF
// risk, so that's intentionally out of scope here.

import Anthropic from '@anthropic-ai/sdk';

let client;
function getClient() {
  if (!client) client = new Anthropic({ timeout: 30000 });
  return client;
}

// Same default as threatScorer.js — Haiku is plenty for this, and vision
// works on every current Claude model.
const MODEL = process.env.THREAT_SCORER_MODEL || 'claude-haiku-4-5-20251001';

export const ANALYSIS_TYPES = ['email', 'message', 'url', 'screenshot'];
export const ALLOWED_IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/gif'];
// Decoded image size cap — keeps the base64 payload (and Claude's per-image
// limit) sane; screenshots don't need to be huge to be legible.
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

const SYSTEM_PROMPT = `You are a phishing/social-engineering analyst for CrisisWatch, a security monitoring tool.

You'll be given an email, a text message, a URL, or a screenshot to assess for phishing risk. Identify concrete indicators — sender/domain mismatches, urgency or threat language, suspicious links, lookalike domains, requests for credentials or payment, poor grammar inconsistent with a claimed sender, unexpected attachments, etc.

Critically: you cannot verify identity, confirm whether a domain is truly spoofed, or visit any link. Never state with certainty that something "is" or "is not" phishing. Describe what you observe and how consistent it is with known phishing patterns, using calibrated, non-absolute language ("shows several signs commonly associated with...", "nothing notably suspicious was found, though that alone doesn't confirm legitimacy"). If given a URL, analyze only its structure/text — you have not visited it and must not imply otherwise.

Respond only via the provided schema.`;

const RESULT_SCHEMA = {
  type: 'object',
  properties: {
    riskScore: { type: 'integer', description: '0 (no notable indicators) to 100 (numerous strong phishing indicators)' },
    indicators: {
      type: 'array',
      items: { type: 'string' },
      description: 'Specific, concrete observations. Empty array if nothing notable was found.'
    },
    summary: { type: 'string', description: '1-3 sentences, calibrated non-absolute language, per the system prompt.' }
  },
  required: ['riskScore', 'indicators', 'summary'],
  additionalProperties: false
};

function riskLevelFor(score) {
  if (score >= 90) return 'Critical';
  if (score >= 70) return 'High';
  if (score >= 40) return 'Medium';
  return 'Low';
}

function buildUserContent({ type, content, mediaType }) {
  if (type === 'screenshot') {
    return [
      { type: 'image', source: { type: 'base64', media_type: mediaType, data: content } },
      { type: 'text', text: 'Analyze this screenshot for phishing risk.' }
    ];
  }
  const label = type === 'url' ? 'URL to analyze (structure/text only — you have not visited it)' : type === 'email' ? 'Email content to analyze' : 'Message content to analyze';
  return `${label}:\n\n${content}`;
}

/**
 * @param {{type: 'email'|'message'|'url'|'screenshot', content: string, mediaType?: string}} input
 * @returns {Promise<{riskScore: number, riskLevel: string, indicators: string[], summary: string}>}
 */
export async function analyzePhishingRisk(input) {
  const response = await getClient().messages.create({
    model: MODEL,
    max_tokens: 1024,
    thinking: { type: 'disabled' },
    output_config: {
      format: { type: 'json_schema', schema: RESULT_SCHEMA }
    },
    system: SYSTEM_PROMPT,
    messages: [{ role: 'user', content: buildUserContent(input) }]
  });

  if (response.stop_reason === 'refusal') {
    throw new Error('Phishing analysis request was refused by the model');
  }

  const textBlock = response.content.find((b) => b.type === 'text');
  const parsed = JSON.parse(textBlock.text);
  const riskScore = Math.max(0, Math.min(100, parsed.riskScore));

  return {
    riskScore,
    riskLevel: riskLevelFor(riskScore),
    indicators: parsed.indicators || [],
    summary: parsed.summary
  };
}
