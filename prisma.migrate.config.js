// prisma.migrate.config.js
//
// Used only by `prisma migrate` commands (via --config), which genuinely
// require a real DATABASE_URL — unlike `prisma generate`, which uses the
// datasource-free default config (prisma.config.js) so it stays safe to
// run even before DATABASE_URL exists in an environment. See that file's
// comment for why they're split.

import { defineConfig, env } from 'prisma/config';
import 'dotenv/config';

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations'
  },
  datasource: {
    url: env('DATABASE_URL')
  }
});
