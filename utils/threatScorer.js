// utils/threatScorer.js
//
// Claude-based severity scoring (1-10), replacing the original OpenAI
// GPT-4 calls. The Anthropic client is built lazily on first use, not at
// module load — constructing it eagerly crashes the whole process at
// startup on any deploy without ANTHROPIC_API_KEY set (this bit
// ThreatPulse's production deploy; not repeating it here).

import Anthropic from '@anthropic-ai/sdk';

let client;
function getClient() {
  if (!client) client = new Anthropic();
  return client;
}

// Haiku is plenty for a bounded 1-10 severity + country classification —
// Opus was significant overkill in cost for what this task needs.
const MODEL = process.env.THREAT_SCORER_MODEL || 'claude-haiku-4-5-20251001';
const BATCH_SIZE = 20;

const SYSTEM_PROMPT = `You are a crisis/threat severity analyst for CrisisWatch, a real-time news monitoring tool.

For each numbered item, score its severity from 1 (no real threat, routine news) to 10 (imminent, catastrophic, large-scale threat). Consider scale, immediacy, and verification status, not just the presence of alarming words — "attack" in a sports headline is not a threat.

Respond only via the provided schema, one result per input item, preserving the input index.`;

const RESULT_SCHEMA = {
  type: 'object',
  properties: {
    results: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          index: { type: 'integer', description: 'Matches the input item number' },
          score: { type: 'integer', description: '1-10 severity' }
        },
        required: ['index', 'score'],
        additionalProperties: false
      }
    }
  },
  required: ['results'],
  additionalProperties: false
};

function chunk(arr, size) {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

async function scoreBatch(texts) {
  const numbered = texts.map((t, i) => `[${i}] ${t}`).join('\n\n');

  const response = await getClient().messages.create({
    model: MODEL,
    max_tokens: 2048,
    thinking: { type: 'disabled' },
    output_config: {
      format: { type: 'json_schema', schema: RESULT_SCHEMA }
    },
    system: SYSTEM_PROMPT,
    messages: [{ role: 'user', content: numbered }]
  });

  if (response.stop_reason === 'refusal') {
    throw new Error('Threat scoring request was refused by the model');
  }

  const textBlock = response.content.find((b) => b.type === 'text');
  const parsed = JSON.parse(textBlock.text);

  const scores = new Array(texts.length).fill(1);
  for (const r of parsed.results) {
    if (r.index >= 0 && r.index < scores.length) scores[r.index] = r.score;
  }
  return scores;
}

/**
 * Scores a single piece of text, 1-10.
 * @param {string} text
 * @returns {Promise<number>}
 */
export async function scoreText(text) {
  const [score] = await scoreBatch([text]);
  return score;
}

/**
 * Scores many texts in batches of 20 per API call.
 * @param {string[]} texts
 * @returns {Promise<number[]>} scores, same order/length as input
 */
export async function scoreTexts(texts) {
  if (!texts.length) return [];
  const batches = chunk(texts, BATCH_SIZE);
  const scores = [];
  for (const batch of batches) {
    scores.push(...(await scoreBatch(batch)));
  }
  return scores;
}

const LOCATE_SYSTEM_PROMPT = `You are a crisis/threat severity and geolocation analyst for CrisisWatch, a real-time news monitoring tool.

For each numbered item, provide:
- score: severity from 1 (no real threat, routine news) to 10 (imminent, catastrophic, large-scale threat). Consider scale, immediacy, and verification status, not just alarming words.
- country: the single country most associated with the event (the country name, e.g. "Ukraine", "United States"). If the item has no clear geographic tie (e.g. a general cybersecurity advisory, or genuinely global/unclear), use null.

Respond only via the provided schema, one result per input item, preserving the input index.`;

const LOCATE_RESULT_SCHEMA = {
  type: 'object',
  properties: {
    results: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          index: { type: 'integer', description: 'Matches the input item number' },
          score: { type: 'integer', description: '1-10 severity' },
          country: { type: ['string', 'null'], description: 'Country name, or null if unclear' }
        },
        required: ['index', 'score', 'country'],
        additionalProperties: false
      }
    }
  },
  required: ['results'],
  additionalProperties: false
};

async function scoreAndLocateBatch(texts) {
  const numbered = texts.map((t, i) => `[${i}] ${t}`).join('\n\n');

  const response = await getClient().messages.create({
    model: MODEL,
    max_tokens: 2048,
    thinking: { type: 'disabled' },
    output_config: {
      format: { type: 'json_schema', schema: LOCATE_RESULT_SCHEMA }
    },
    system: LOCATE_SYSTEM_PROMPT,
    messages: [{ role: 'user', content: numbered }]
  });

  if (response.stop_reason === 'refusal') {
    throw new Error('Threat scoring request was refused by the model');
  }

  const textBlock = response.content.find((b) => b.type === 'text');
  const parsed = JSON.parse(textBlock.text);

  const results = new Array(texts.length).fill(null).map(() => ({ score: 1, country: null }));
  for (const r of parsed.results) {
    if (r.index >= 0 && r.index < results.length) results[r.index] = { score: r.score, country: r.country };
  }
  return results;
}

/**
 * Scores many texts and extracts a best-guess country per item, in batches
 * of 20 per API call (same cost as scoreTexts — location comes along for
 * free in the same structured-output call).
 * @param {string[]} texts
 * @returns {Promise<{score: number, country: string|null}[]>}
 */
export async function scoreAndLocateTexts(texts) {
  if (!texts.length) return [];
  const batches = chunk(texts, BATCH_SIZE);
  const results = [];
  for (const batch of batches) {
    results.push(...(await scoreAndLocateBatch(batch)));
  }
  return results;
}
