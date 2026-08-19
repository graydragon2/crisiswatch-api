// utils/db.js
//
// Lazy Prisma client singleton — same reasoning as the Anthropic client in
// threatScorer.js: constructing it eagerly at module load means any deploy
// without DATABASE_URL set crashes the whole process at startup instead of
// just failing the specific requests that need the database.
//
// Prisma 7 requires a driver adapter for the runtime client (schema.prisma
// no longer carries a connection URL — see prisma.config.js for the
// CLI/migrate side of that same change).

import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

let client;
export function getDb() {
  if (!client) {
    if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is not configured on the server');
    client = new PrismaClient({ adapter: new PrismaPg(process.env.DATABASE_URL) });
  }
  return client;
}
