// utils/darkWebCheck.js
//
// Shared LeakCheck lookup, extracted out of the /api/darkweb route so the
// persistent monitored-email checker (utils/darkWebMonitor.js) can reuse
// the exact same request/response handling instead of duplicating it.

import fetch from 'node-fetch';

/**
 * @param {string} email
 * @returns {Promise<{found: boolean, entries: string[]}>}
 * @throws if LEAKCHECK_API_KEY is missing or the LeakCheck call fails
 */
export async function checkEmailExposure(email) {
  const key = process.env.LEAKCHECK_API_KEY;
  if (!key) throw new Error('LEAKCHECK_API_KEY is not configured on the server');

  const url = `https://leakcheck.io/api/public?key=${key}&check=${encodeURIComponent(email)}&type=email`;
  const r = await fetch(url);
  const j = await r.json();

  // LeakCheck's public API can return HTTP 200 with `success: false` and an
  // explanatory `error` (e.g. a plan/type restriction) instead of a non-2xx
  // status — treat that the same as a hard failure so it isn't silently
  // reported back as "no results found".
  if (!r.ok || j.success === false) {
    throw new Error(j.error || 'LeakCheck error');
  }

  // LeakCheck's public API returns breach names under `sources`, not
  // `result` (that's the v2/paid-lookup shape) — read either defensively.
  const rawEntries = Array.isArray(j.sources) ? j.sources : Array.isArray(j.result) ? j.result : [];
  return {
    found: Boolean(j.found),
    entries: rawEntries.map((entry) => (typeof entry === 'string' ? entry : entry?.name || entry?.source?.name || JSON.stringify(entry)))
  };
}
