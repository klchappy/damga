/**
 * Aylık partition helper'lar — partitioning migration sonrası kullanılır.
 *
 * Şu an `attendance_events` partitioned değil (premature). Bu fonksiyonlar
 * gelecekte migration tamamlandığında BullMQ cron job'u tarafından çağrılacak.
 *
 * Kullanım:
 *   await ensureNextMonthPartition('public.attendance_events');
 *
 * Job tanımı (queue.ts):
 *   { name: 'monthly-partition-create', pattern: '0 3 25 * *', jobId: 'partition-create' }
 *   → Her ayın 25'inde 03:00 (TR), bir sonraki ayın partition'ını oluşturur.
 */
import { Client } from 'pg';

/**
 * `<tableName>_yYYYYmMM` adında bir sonraki ay için partition oluştur.
 * IF NOT EXISTS olduğu için idempotent.
 */
export async function ensureNextMonthPartition(args: {
  parentTable: string;
  dbUrl: string;
}): Promise<{ created: boolean; partitionName: string }> {
  const client = new Client({ connectionString: args.dbUrl, ssl: { rejectUnauthorized: false } });
  await client.connect();

  try {
    const now = new Date();
    const nextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1);
    const monthAfter = new Date(now.getFullYear(), now.getMonth() + 2, 1);

    const ymStr = `y${nextMonth.getFullYear()}m${String(nextMonth.getMonth() + 1).padStart(2, '0')}`;
    const partitionName = `${args.parentTable}_${ymStr}`;
    const fromDate = nextMonth.toISOString().slice(0, 10);
    const toDate = monthAfter.toISOString().slice(0, 10);

    // Tablo zaten varsa skip
    const existsResult = await client.query<{ exists: boolean }>(
      `SELECT EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name = $1
      ) AS exists`,
      [partitionName.replace('public.', '')],
    );
    if (existsResult.rows[0]?.exists) {
      return { created: false, partitionName };
    }

    await client.query(
      `CREATE TABLE IF NOT EXISTS ${partitionName}
       PARTITION OF ${args.parentTable}
       FOR VALUES FROM ('${fromDate}') TO ('${toDate}')`,
    );

    return { created: true, partitionName };
  } finally {
    await client.end();
  }
}

/**
 * 12 aydan eski partition'ları DETACH et (silmez — sadece query planner'dan
 * çıkartır). Manual silinmek istenirse: DROP TABLE attendance_events_yYYYYmMM.
 *
 * KVKK ile uyumlu — silme yerine "soğuk arşiv" (örnek B2 archive bucket).
 */
export async function detachOldPartitions(args: {
  parentTable: string;
  dbUrl: string;
  monthsToKeep: number;
}): Promise<{ detached: string[] }> {
  const client = new Client({ connectionString: args.dbUrl, ssl: { rejectUnauthorized: false } });
  await client.connect();

  try {
    const cutoff = new Date();
    cutoff.setMonth(cutoff.getMonth() - args.monthsToKeep);

    const partitions = await client.query<{ tablename: string }>(
      `SELECT tablename FROM pg_tables
       WHERE schemaname = 'public'
         AND tablename LIKE $1`,
      [`${args.parentTable.replace('public.', '')}_y%m%`],
    );

    const detached: string[] = [];
    for (const row of partitions.rows) {
      const match = row.tablename.match(/_y(\d{4})m(\d{2})$/);
      if (!match) continue;
      const partDate = new Date(parseInt(match[1]!, 10), parseInt(match[2]!, 10) - 1, 1);
      if (partDate < cutoff) {
        await client.query(`ALTER TABLE ${args.parentTable} DETACH PARTITION public.${row.tablename}`);
        detached.push(row.tablename);
      }
    }
    return { detached };
  } finally {
    await client.end();
  }
}
