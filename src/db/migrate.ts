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

  console.log('Running migration against Neon...');
  await sql.transaction(async (tx) => {
    await tx(schema);
  });
  console.log('Migration complete. Tables created (or already existed).');
}

migrate().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});
