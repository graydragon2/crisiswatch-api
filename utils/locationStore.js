// utils/locationStore.js
//
// Tracks a per-user watchlist of zip codes for the "Watched Locations"
// dashboard feature. Moved off flat JSON to Postgres in Phase 2 — see
// prisma/schema.prisma's WatchedLocation model and
// scripts/migrate-legacy-data.js for the one-off import of the old shared
// list into account #1.

import { getDb } from './db.js';

export async function getLocations(userId) {
  const rows = await getDb().watchedLocation.findMany({ where: { userId }, orderBy: { createdAt: 'asc' } });
  return rows.map((r) => r.zip);
}

export async function addLocation(userId, zip) {
  const normalized = zip.trim();
  if (!normalized) return getLocations(userId);
  await getDb().watchedLocation.upsert({
    where: { userId_zip: { userId, zip: normalized } },
    create: { userId, zip: normalized },
    update: {}
  });
  return getLocations(userId);
}

export async function removeLocation(userId, zip) {
  const normalized = zip.trim();
  await getDb().watchedLocation.deleteMany({ where: { userId, zip: normalized } });
  return getLocations(userId);
}
