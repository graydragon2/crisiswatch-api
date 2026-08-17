// utils/darkWebMonitor.js
//
// Re-checks monitored emails on a much longer cadence than the main
// monitor tick — breach data doesn't change minute to minute, and
// LeakCheck's free/public tier has rate limits, so hammering it every 15
// minutes for every monitored address would be wasteful and risks getting
// throttled. Only re-checks entries whose last check is stale (or that
// have never been checked).

import { getMonitoredEmails, updateCheckResult } from './monitoredEmailStore.js';
import { checkEmailExposure } from './darkWebCheck.js';

const STALE_AFTER_MS = (Number(process.env.DARKWEB_RECHECK_HOURS) || 24) * 60 * 60 * 1000;

function isStale(entry) {
  if (!entry.lastChecked) return true;
  return Date.now() - new Date(entry.lastChecked).getTime() >= STALE_AFTER_MS;
}

export async function refreshStaleMonitoredEmails() {
  if (!process.env.LEAKCHECK_API_KEY) return;

  const stale = getMonitoredEmails().filter(isStale);
  for (const entry of stale) {
    try {
      const result = await checkEmailExposure(entry.email);
      updateCheckResult(entry.email, result);
    } catch (err) {
      console.error(`Dark web check failed for a monitored email:`, err.message);
      updateCheckResult(entry.email, { error: err.message });
    }
  }
}
