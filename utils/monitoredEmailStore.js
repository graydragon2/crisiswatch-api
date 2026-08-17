// utils/monitoredEmailStore.js
//
// Tracks a watchlist of email addresses for persistent dark-web exposure
// monitoring, plus the result of their most recent check. Same persistence
// pattern as the other stores in this project — the current-state-per-item
// shape (not a separate history log) matches locationStore.js/
// locationWatch.js rather than historyStore.js, since "is this email
// currently exposed" is what matters, not a time series.

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const filePath = path.join(__dirname, '../data/monitoredEmails.json');

function readAll() {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
  } catch (err) {
    if (err.code === 'ENOENT') return [];
    console.error('Failed to read monitored emails file:', err);
    return [];
  }
}

function writeAll(entries) {
  fs.writeFileSync(filePath, JSON.stringify(entries, null, 2));
}

export function getMonitoredEmails() {
  return readAll();
}

export function addMonitoredEmail(email) {
  const normalized = email.trim().toLowerCase();
  const entries = readAll();
  if (!normalized || entries.some((e) => e.email === normalized)) return entries;
  entries.push({
    email: normalized,
    addedAt: new Date().toISOString(),
    status: 'pending',
    lastChecked: null,
    found: null,
    exposureCount: 0,
    riskLevel: 'Unknown',
    entries: []
  });
  writeAll(entries);
  return entries;
}

export function removeMonitoredEmail(email) {
  const normalized = email.trim().toLowerCase();
  const entries = readAll().filter((e) => e.email !== normalized);
  writeAll(entries);
  return entries;
}

/**
 * Overwrites one monitored email's check result in place.
 * @param {string} email
 * @param {{found: boolean, entries: string[]}|{error: string}} result
 */
export function updateCheckResult(email, result) {
  const entries = readAll();
  const entry = entries.find((e) => e.email === email);
  if (!entry) return entries;

  entry.lastChecked = new Date().toISOString();
  if (result.error) {
    entry.status = 'error';
    entry.error = result.error;
  } else {
    entry.status = 'active';
    entry.error = undefined;
    entry.found = result.found;
    entry.exposureCount = result.entries.length;
    entry.entries = result.entries;
    entry.riskLevel = riskLevelFor(result.entries.length);
  }
  writeAll(entries);
  return entries;
}

// Simple, documented heuristic — not a claim of precise risk scoring, just
// a way to sort "monitor this closely" from "nothing here."
function riskLevelFor(exposureCount) {
  if (exposureCount === 0) return 'None';
  if (exposureCount <= 2) return 'Low';
  if (exposureCount <= 5) return 'Medium';
  return 'High';
}
