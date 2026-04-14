import { neon } from '@neondatabase/serverless';

export function getDb(databaseUrl: string) {
  return neon(databaseUrl);
}