/**
 * Damga DB migration runner.
 * Çalıştır: pnpm --filter @damga/db migrate
 *
 * 1) Drizzle migration'ları çalıştırır (src/migrations/)
 * 2) src/migrations/custom/*.sql dosyalarını sırayla çalıştırır
 *    (hash chain trigger, append-only constraint, vs)
 */
import 'dotenv/config';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { Pool } from 'pg';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

async function run() {
  const url = process.env.DIRECT_URL ?? process.env.DATABASE_URL;
  if (!url) {
    throw new Error('DATABASE_URL veya DIRECT_URL gerekli');
  }
  const pool = new Pool({
    connectionString: url,
    ssl: url.includes('supabase.co') ? { rejectUnauthorized: false } : false,
  });
  const db = drizzle(pool);

  console.log('▶ Drizzle migration başlıyor...');
  try {
    await migrate(db, { migrationsFolder: join(__dirname, 'migrations') });
    console.log('✓ Drizzle migration tamamlandı');
  } catch (err) {
    console.error('✗ Drizzle migration hatası:', err);
    await pool.end();
    process.exit(1);
  }

  // Custom SQL dosyaları (hash chain trigger vs)
  const customDir = join(__dirname, 'migrations', 'custom');
  if (existsSync(customDir)) {
    const files = readdirSync(customDir)
      .filter((f) => f.endsWith('.sql'))
      .sort();

    console.log(`▶ ${files.length} custom SQL dosyası uygulanıyor...`);
    for (const file of files) {
      const sql = readFileSync(join(customDir, file), 'utf-8');
      try {
        await pool.query(sql);
        console.log(`  ✓ ${file}`);
      } catch (err) {
        console.error(`  ✗ ${file}:`, (err as Error).message);
      }
    }
  }

  await pool.end();
  console.log('✅ Migration tamamlandı');
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
