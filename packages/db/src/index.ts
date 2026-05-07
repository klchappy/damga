import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import * as schema from './schema';

export * from './schema';
export * from './types';

let _pool: Pool | null = null;
let _db: NodePgDatabase<typeof schema> | null = null;

export function getDb(databaseUrl?: string): NodePgDatabase<typeof schema> {
  if (_db) return _db;
  const url = databaseUrl ?? process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL gerekli — packages/db/getDb()');
  _pool = new Pool({
    connectionString: url,
    max: 10,
    ssl: url.includes('supabase.co') ? { rejectUnauthorized: false } : false,
  });
  _db = drizzle(_pool, { schema });
  return _db;
}

export async function closeDb(): Promise<void> {
  if (_pool) {
    await _pool.end();
    _pool = null;
    _db = null;
  }
}
