// utils/darkWebMonitor.js
//
// Re-checks a user's monitored emails on a much longer cadence than the
// main monitor tick — breach data doesn't change minute to minute, and
// LeakCheck's free/public tier has rate limits, so hammering it every 15
// minutes for every monitored address would be wasteful and risks getting
// throttled. Only re-checks entries whose last check is stale (or that
// have never been checked).
//
// Runs per-user (see server.js's runMonitorTick) rather than deduping a
// shared email across users — if two users monitor the same address it's
// checked twice. Simple and correct; revisit if LeakCheck's rate limit
// becomes a real constraint.

import { getMonitoredEmails, updateCheckResult } from './monitoredEmailStore.js';
import { checkEmailExposure } from './darkWebCheck.js';

const STALE_AFTER_MS = (Number(process.env.DARKWEB_RECHECK_HOURS) || 24) * 60 * 60 * 1000;

function isStale(entry) {
  if (!entry.lastChecked) return true;
  return Date.now() - new Date(entry.lastChecked).getTime() >= STALE_AFTER_MS;
}

export async function refreshStaleMonitoredEmails(userId) {
  if (!process.env.LEAKCHECK_API_KEY) return;

  const stale = (await getMonitoredEmails(userId)).filter(isStale);
  for (const entry of stale) {
    try {
      const result = await checkEmailExposure(entry.email);
      await updateCheckResult(userId, entry.email, result);
    } catch (err) {
      console.error(`Dark web check failed for a monitored email:`, err.message);
      await updateCheckResult(userId, entry.email, { error: err.message });
    }
  }
}
