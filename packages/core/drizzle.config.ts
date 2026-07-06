import { defineConfig } from 'drizzle-kit';

// Migrations live in packages/core/drizzle. Never edit an applied migration
// (CLAUDE.md). Module schemas are aggregated in src/db/schema.ts as they land.
export default defineConfig({
  dialect: 'postgresql',
  schema: './src/db/schema.ts',
  out: './drizzle',
  dbCredentials: {
    url: process.env.DATABASE_URL ?? 'postgres://brip:brip@localhost:5432/brip',
  },
  strict: true,
  verbose: true,
});
