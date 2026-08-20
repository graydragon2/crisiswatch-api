// utils/alertStore.js
//
// Persists per-user email alert settings (enabled + recipient) and a
// rolling list of already-alerted item keys, so the periodic checker
// doesn't re-send the same story/alert every interval. Moved off flat JSON
// to Postgres in Phase 2 — see prisma/schema.prisma's AlertSetting and
// SeenAlertKey models.

import { getDb } from './db.js';

// Bounds the seen-key table per user so it doesn't grow forever.
const MAX_SEEN = 500;

export async function getAlertSettings(userId) {
  const row = await getDb().alertSetting.findUnique({ where: { userId } });
  return { enabled: row?.enabled ?? false, recipient: row?.recipient ?? '' };
}

export async function updateAlertSettings(userId, { enabled, recipient }) {
  const data = {};
  if (typeof enabled === 'boolean') data.enabled = enabled;
  if (typeof recipient === 'string') data.recipient = recipient.trim();

  const row = await getDb().alertSetting.upsert({
    where: { userId },
    create: { userId, enabled: data.enabled ?? false, recipient: data.recipient ?? '' },
    update: data
  });
  return { enabled: row.enabled, recipient: row.recipient };
}

export async function filterUnseen(userId, keys) {
  if (!keys.length) return [];
  const rows = await getDb().seenAlertKey.findMany({
    where: { userId, key: { in: keys } },
    select: { key: true }
  });
  const seenSet = new Set(rows.map((r) => r.key));
  return keys.filter((k) => !seenSet.has(k));
}

export async function markSeen(userId, keys) {
  if (!keys.length) return;
  const db = getDb();
  await db.seenAlertKey.createMany({
    data: keys.map((key) => ({ userId, key })),
    skipDuplicates: true
  });

  // Keep only the most recent MAX_SEEN rows for this user.
  const total = await db.seenAlertKey.count({ where: { userId } });
  if (total > MAX_SEEN) {
    const stale = await db.seenAlertKey.findMany({
      where: { userId },
      orderBy: { seenAt: 'asc' },
      take: total - MAX_SEEN,
      select: { id: true }
    });
    await db.seenAlertKey.deleteMany({ where: { id: { in: stale.map((s) => s.id) } } });
  }
}
