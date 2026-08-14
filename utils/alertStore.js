// utils/alertStore.js
//
// Persists email alert settings (enabled + recipient) and a rolling list of
// already-alerted item keys, so the periodic checker doesn't re-send the
// same story/alert every interval. Same persistence pattern as the other
// stores in this project.

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const alertsFilePath = path.join(__dirname, '../data/alerts.json');

// Bounds the "seen" list so the file doesn't grow forever.
const MAX_SEEN = 500;

const DEFAULTS = { enabled: false, recipient: '', seen: [] };

function readState() {
  try {
    return { ...DEFAULTS, ...JSON.parse(fs.readFileSync(alertsFilePath, 'utf-8')) };
  } catch (err) {
    if (err.code === 'ENOENT') return { ...DEFAULTS };
    console.error('Failed to read alerts file:', err);
    return { ...DEFAULTS };
  }
}

function writeState(state) {
  fs.writeFileSync(alertsFilePath, JSON.stringify(state, null, 2));
}

export function getAlertSettings() {
  const { enabled, recipient } = readState();
  return { enabled, recipient };
}

export function updateAlertSettings({ enabled, recipient }) {
  const state = readState();
  if (typeof enabled === 'boolean') state.enabled = enabled;
  if (typeof recipient === 'string') state.recipient = recipient.trim();
  writeState(state);
  return { enabled: state.enabled, recipient: state.recipient };
}

export function filterUnseen(keys) {
  const { seen } = readState();
  const seenSet = new Set(seen);
  return keys.filter((k) => !seenSet.has(k));
}

export function markSeen(keys) {
  if (!keys.length) return;
  const state = readState();
  const seenSet = new Set(state.seen);
  keys.forEach((k) => seenSet.add(k));
  // Keep only the most recent MAX_SEEN entries.
  state.seen = [...seenSet].slice(-MAX_SEEN);
  writeState(state);
}
