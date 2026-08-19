// prisma.config.js
//
// Deliberately has NO datasource block. `prisma generate` (run on every
// deploy, before the server even starts — see nixpacks.toml) doesn't
// actually need a database connection, but Prisma 7's config loader
// evaluates `env('DATABASE_URL')` eagerly for ANY command if a datasource
// block references it — so declaring one here would make `generate` fail
// on any deploy where DATABASE_URL isn't set yet, which would crash the
// whole server at import time (see utils/db.js's comment), not just the
// new auth routes. See prisma.migrate.config.js for the config `migrate`
// commands use instead, which genuinely does need a real connection.

import { defineConfig } from 'prisma/config';

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations'
  }
});
