// utils/keywordStore.js
//
// Tracks a per-user watchlist of keywords for the "Keywords Alert"
// dashboard feature. Moved off flat JSON to Postgres in Phase 2 — see
// prisma/schema.prisma's Keyword model and scripts/migrate-legacy-data.js
// for the one-off import of the old shared list into account #1.

import { getDb } from './db.js';

export async function getKeywords(userId) {
  const rows = await getDb().keyword.findMany({ where: { userId }, orderBy: { createdAt: 'asc' } });
  return rows.map((r) => r.value);
}

export async function addKeyword(userId, keyword) {
  const normalized = keyword.trim().toLowerCase();
  if (!normalized) return getKeywords(userId);
  await getDb().keyword.upsert({
    where: { userId_value: { userId, value: normalized } },
    create: { userId, value: normalized },
    update: {}
  });
  return getKeywords(userId);
}

export async function removeKeyword(userId, keyword) {
  const normalized = keyword.trim().toLowerCase();
  await getDb().keyword.deleteMany({ where: { userId, value: normalized } });
  return getKeywords(userId);
}
