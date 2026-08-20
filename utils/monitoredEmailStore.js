// utils/monitoredEmailStore.js
//
// Tracks a per-user watchlist of email addresses for persistent dark-web
// exposure monitoring, plus the result of their most recent check. Moved
// off flat JSON to Postgres in Phase 2 — see prisma/schema.prisma's
// MonitoredEmail model. The current-state-per-item shape (not a separate
// history log) is unchanged from the old store: "is this email currently
// exposed" is what matters, not a time series.

import { getDb } from './db.js';

function toEntry(row) {
  return {
    email: row.email,
    addedAt: row.createdAt.toISOString(),
    status: row.status,
    lastChecked: row.lastChecked ? row.lastChecked.toISOString() : null,
    found: row.found,
    exposureCount: row.exposureCount,
    riskLevel: row.riskLevel,
    entries: row.entries,
    error: row.error || undefined
  };
}

export async function getMonitoredEmails(userId) {
  const rows = await getDb().monitoredEmail.findMany({ where: { userId }, orderBy: { createdAt: 'asc' } });
  return rows.map(toEntry);
}

export async function addMonitoredEmail(userId, email) {
  const normalized = email.trim().toLowerCase();
  if (!normalized) return getMonitoredEmails(userId);
  const existing = await getDb().monitoredEmail.findUnique({ where: { userId_email: { userId, email: normalized } } });
  if (!existing) {
    await getDb().monitoredEmail.create({ data: { userId, email: normalized } });
  }
  return getMonitoredEmails(userId);
}

export async function removeMonitoredEmail(userId, email) {
  const normalized = email.trim().toLowerCase();
  await getDb().monitoredEmail.deleteMany({ where: { userId, email: normalized } });
  return getMonitoredEmails(userId);
}

/**
 * Overwrites one monitored email's check result in place.
 * @param {string} userId
 * @param {string} email
 * @param {{found: boolean, entries: string[]}|{error: string}} result
 */
export async function updateCheckResult(userId, email, result) {
  const data = { lastChecked: new Date() };
  if (result.error) {
    data.status = 'error';
    data.error = result.error;
  } else {
    data.status = 'active';
    data.error = null;
    data.found = result.found;
    data.exposureCount = result.entries.length;
    data.entries = result.entries;
    data.riskLevel = riskLevelFor(result.entries.length);
  }
  await getDb().monitoredEmail.updateMany({ where: { userId, email }, data });
  return getMonitoredEmails(userId);
}

// Simple, documented heuristic — not a claim of precise risk scoring, just
// a way to sort "monitor this closely" from "nothing here."
function riskLevelFor(exposureCount) {
  if (exposureCount === 0) return 'None';
  if (exposureCount <= 2) return 'Low';
  if (exposureCount <= 5) return 'Medium';
  return 'High';
}
