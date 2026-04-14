import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { getDb } from '../lib/db';

const __dirname = dirname(fileURLToPath(import.meta.url));

async function migrate() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error('DATABASE_URL environment variable is not set');
  }

  const sql = getDb(databaseUrl);
  const schema = readFileSync(join(__dirname, 'schema.sql'), 'utf-8');

  // Split on blank lines into individual CREATE TABLE statements
  const statements = schema
    .split(/\n\n/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);

  console.log(`Running migration against Neon (${statements.length} statements)...`);

  for (const stmt of statements) {
    await sql.query(stmt);
  }

  console.log('Migration complete. Tables created (or already existed).');
}

migrate().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});
