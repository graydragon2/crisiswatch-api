// utils/notificationStore.js
//
// Persists the in-app notification center's list. Populated from the same
// per-tick detection pass that drives email alerts (see alertDetector.js /
// server.js), so a notification appears exactly once per newly-seen item,
// same as email — this store never does its own detection or dedup.

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import crypto from 'crypto';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const filePath = path.join(__dirname, '../data/notifications.json');

// Bounds the file so it doesn't grow forever.
const MAX_NOTIFICATIONS = 300;

function readAll() {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
  } catch (err) {
    if (err.code === 'ENOENT') return [];
    console.error('Failed to read notifications file:', err);
    return [];
  }
}

function writeAll(entries) {
  fs.writeFileSync(filePath, JSON.stringify(entries, null, 2));
}

export function getNotifications() {
  return readAll();
}

export function getUnreadCount() {
  return readAll().filter((n) => !n.read).length;
}

/**
 * @param {{category: 'Critical'|'High'|'Medium'|'Informational', title: string, message: string, link?: string|null}[]} items
 */
export function addNotifications(items) {
  const entries = readAll();
  if (!items.length) return entries;

  const now = new Date().toISOString();
  const newEntries = items.map((item) => ({
    id: crypto.randomUUID(),
    category: item.category,
    title: item.title,
    message: item.message,
    link: item.link || null,
    createdAt: now,
    read: false
  }));

  const merged = [...newEntries, ...entries].slice(0, MAX_NOTIFICATIONS);
  writeAll(merged);
  return merged;
}

export function markRead(id) {
  const entries = readAll();
  const entry = entries.find((n) => n.id === id);
  if (entry) entry.read = true;
  writeAll(entries);
  return entries;
}

export function markAllRead() {
  const entries = readAll().map((n) => (n.read ? n : { ...n, read: true }));
  writeAll(entries);
  return entries;
}

export function clearNotification(id) {
  const entries = readAll().filter((n) => n.id !== id);
  writeAll(entries);
  return entries;
}
