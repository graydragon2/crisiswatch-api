// scripts/migrate-legacy-data.js
//
// One-off Phase 2 import: copies the pre-existing flat-JSON personalization
// data (data/keywords.json, data/locations.json, data/monitoredEmails.json,
// data/alerts.json, data/notifications.json) into Postgres, scoped to
// "account #1" — per the migration decision made before Phase 2 started,
// this is the earliest-created User row (or pass an email explicitly to
// target a different account).
//
// Run once, against the real deployed database, via the Railway web
// Console on the crisiswatch-api service (same place the initial `prisma
// migrate dev` was run in Phase 1):
//
//   node scripts/migrate-legacy-data.js
//   node scripts/migrate-legacy-data.js someone@example.com   # explicit target
//
// Safe to re-run — every insert is an upsert or checks for an existing row
// first, so running it twice doesn't duplicate data.

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { getDb } from '../utils/db.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataDir = path.join(__dirname, '../data');

function readJson(file, fallback) {
  try {
    return JSON.parse(fs.readFileSync(path.join(dataDir, file), 'utf-8'));
  } catch (err) {
    if (err.code === 'ENOENT') return fallback;
    throw err;
  }
}

async function resolveTargetUser(db, emailArg) {
  if (emailArg) {
    const user = await db.user.findUnique({ where: { email: emailArg } });
    if (!user) throw new Error(`No user found with email "${emailArg}" — sign up (via magic link) before running this.`);
    return user;
  }
  const user = await db.user.findFirst({ orderBy: { createdAt: 'asc' } });
  if (!user) throw new Error('No users exist yet — sign up (via magic link) before running this.');
  return user;
}

async function migrateKeywords(db, userId) {
  const keywords = readJson('keywords.json', []);
  let count = 0;
  for (const raw of keywords) {
    const value = String(raw).trim().toLowerCase();
    if (!value) continue;
    await db.keyword.upsert({
      where: { userId_value: { userId, value } },
      create: { userId, value },
      update: {}
    });
    count++;
  }
  return count;
}

async function migrateLocations(db, userId) {
  const zips = readJson('locations.json', []);
  let count = 0;
  for (const raw of zips) {
    const zip = String(raw).trim();
    if (!zip) continue;
    await db.watchedLocation.upsert({
      where: { userId_zip: { userId, zip } },
      create: { userId, zip },
      update: {}
    });
    count++;
  }
  return count;
}

async function migrateMonitoredEmails(db, userId) {
  const entries = readJson('monitoredEmails.json', []);
  let count = 0;
  for (const e of entries) {
    const email = String(e.email || '').trim().toLowerCase();
    if (!email) continue;
    const existing = await db.monitoredEmail.findUnique({ where: { userId_email: { userId, email } } });
    if (existing) continue;
    await db.monitoredEmail.create({
      data: {
        userId,
        email,
        status: e.status || 'pending',
        lastChecked: e.lastChecked ? new Date(e.lastChecked) : null,
        found: typeof e.found === 'boolean' ? e.found : null,
        exposureCount: e.exposureCount || 0,
        riskLevel: e.riskLevel || 'Unknown',
        entries: e.entries || [],
        error: e.error || null,
        createdAt: e.addedAt ? new Date(e.addedAt) : undefined
      }
    });
    count++;
  }
  return count;
}

async function migrateAlertSettings(db, userId) {
  const state = readJson('alerts.json', { enabled: false, recipient: '', seen: [] });
  await db.alertSetting.upsert({
    where: { userId },
    create: { userId, enabled: Boolean(state.enabled), recipient: (state.recipient || '').trim() },
    update: { enabled: Boolean(state.enabled), recipient: (state.recipient || '').trim() }
  });

  const seenKeys = Array.isArray(state.seen) ? state.seen : [];
  if (seenKeys.length) {
    await db.seenAlertKey.createMany({
      data: seenKeys.map((key) => ({ userId, key })),
      skipDuplicates: true
    });
  }
  return { settingsMigrated: true, seenKeysMigrated: seenKeys.length };
}

async function migrateNotifications(db, userId) {
  const notifications = readJson('notifications.json', []);
  let count = 0;
  for (const n of notifications) {
    const existing = await db.notification.findUnique({ where: { id: n.id } }).catch(() => null);
    if (existing) continue;
    await db.notification.create({
      data: {
        id: n.id,
        userId,
        category: n.category,
        title: n.title,
        message: n.message,
        link: n.link || null,
        read: Boolean(n.read),
        createdAt: n.createdAt ? new Date(n.createdAt) : undefined
      }
    });
    count++;
  }
  return count;
}

async function main() {
  const db = getDb();
  const emailArg = process.argv[2];
  const user = await resolveTargetUser(db, emailArg);

  console.log(`Migrating legacy flat-JSON data into account #1: ${user.email} (${user.id})`);

  const keywordCount = await migrateKeywords(db, user.id);
  const locationCount = await migrateLocations(db, user.id);
  const monitoredEmailCount = await migrateMonitoredEmails(db, user.id);
  const alerts = await migrateAlertSettings(db, user.id);
  const notificationCount = await migrateNotifications(db, user.id);

  console.log('Done:');
  console.log(`  keywords:          ${keywordCount}`);
  console.log(`  watched locations: ${locationCount}`);
  console.log(`  monitored emails:  ${monitoredEmailCount}`);
  console.log(`  alert settings:    migrated (seen keys: ${alerts.seenKeysMigrated})`);
  console.log(`  notifications:     ${notificationCount}`);
}

main()
  .catch((err) => {
    console.error('Migration failed:', err.message);
    process.exitCode = 1;
  });
