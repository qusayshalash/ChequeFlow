import path from 'node:path';

import { config as loadEnv } from 'dotenv';
import { defineConfig } from 'prisma/config';

// Prisma 7 no longer loads .env implicitly. The monorepo keeps one .env at its
// root; a package-local .env can override it for a throw-away database.
loadEnv({ path: path.resolve(__dirname, '../../.env'), quiet: true });
loadEnv({ path: path.resolve(__dirname, '.env'), quiet: true, override: false });

// `prisma generate` must work without a database URL (CI builds, fresh clones);
// only the migrate/introspect commands actually need one, and they report a
// clear error when it is missing.
const databaseUrl = process.env.DATABASE_URL;

export default defineConfig({
  schema: path.join('prisma', 'schema.prisma'),
  migrations: {
    path: path.join('prisma', 'migrations'),
    seed: 'tsx prisma/seed.ts',
  },
  ...(databaseUrl ? { datasource: { url: databaseUrl } } : {}),
});
