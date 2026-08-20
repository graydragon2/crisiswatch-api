// utils/notificationStore.js
//
// Persists each user's in-app notification center list. Populated from the
// same per-tick detection pass that drives email alerts (see
// alertDetector.js / server.js), so a notification appears exactly once per
// newly-seen item, same as email — this store never does its own detection
// or dedup. Moved off flat JSON to Postgres in Phase 2 — see
// prisma/schema.prisma's Notification model.

import { getDb } from './db.js';

// Bounds the table per user so it doesn't grow forever.
const MAX_NOTIFICATIONS = 300;

function toEntry(row) {
  return {
    id: row.id,
    category: row.category,
    title: row.title,
    message: row.message,
    link: row.link,
    createdAt: row.createdAt.toISOString(),
    read: row.read
  };
}

export async function getNotifications(userId) {
  const rows = await getDb().notification.findMany({
    where: { userId },
    orderBy: { createdAt: 'desc' },
    take: MAX_NOTIFICATIONS
  });
  return rows.map(toEntry);
}

export async function getUnreadCount(userId) {
  return getDb().notification.count({ where: { userId, read: false } });
}

/**
 * @param {string} userId
 * @param {{category: 'Critical'|'High'|'Medium'|'Informational', title: string, message: string, link?: string|null}[]} items
 */
export async function addNotifications(userId, items) {
  if (!items.length) return getNotifications(userId);
  const db = getDb();
  await db.notification.createMany({
    data: items.map((item) => ({
      userId,
      category: item.category,
      title: item.title,
      message: item.message,
      link: item.link || null
    }))
  });

  const total = await db.notification.count({ where: { userId } });
  if (total > MAX_NOTIFICATIONS) {
    const stale = await db.notification.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      skip: MAX_NOTIFICATIONS,
      select: { id: true }
    });
    await db.notification.deleteMany({ where: { id: { in: stale.map((s) => s.id) } } });
  }
  return getNotifications(userId);
}

export async function markRead(userId, id) {
  await getDb().notification.updateMany({ where: { id, userId }, data: { read: true } });
  return getNotifications(userId);
}

export async function markAllRead(userId) {
  await getDb().notification.updateMany({ where: { userId, read: false }, data: { read: true } });
  return getNotifications(userId);
}

export async function clearNotification(userId, id) {
  await getDb().notification.deleteMany({ where: { id, userId } });
  return getNotifications(userId);
}
