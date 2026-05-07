/**
 * Damga seed data — lokal dev için örnek org + 3 kullanıcı + 1 lokasyon.
 * Çalıştır: pnpm --filter @damga/db seed
 */
import 'dotenv/config';
import { sql } from 'drizzle-orm';
import { getDb, closeDb, orgs, users, locations } from './index';

async function run() {
  const db = getDb();
  console.log('▶ Seed data yükleniyor...');

  // Mevcut seed'i temizle
  await db.execute(sql`truncate table attendance_events, leaves, moods, statuses cascade`);

  // 1) Org
  const [org] = await db
    .insert(orgs)
    .values({
      name: 'Acme Yazılım',
      slug: 'acme-yazilim-demo',
      plan: 'pro',
      kvkk_consent_text:
        'Acme Yazılım olarak Damga ile çalışan giriş/çıkış verilerini İş Kanunu md. 75 gereği işliyoruz.',
    })
    .returning();
  console.log(`  ✓ Org: ${org!.name} (${org!.id})`);

  // 2) Lokasyon — Levent örnek (İstanbul)
  const [loc] = await db
    .insert(locations)
    .values({
      org_id: org!.id,
      name: 'Acme Merkez Ofis',
      address: 'Levent Mah., Büyükdere Cad. No:1',
      city: 'İstanbul',
      latitude: 41.0826,
      longitude: 29.0091,
      geofence_radius_m: 150,
      wifi_bssids: ['00:11:22:33:44:55'],
      nfc_tag_ids: [],
      qr_codes: [],
      work_hours_start: '09:00',
      work_hours_end: '18:00',
    })
    .returning();
  console.log(`  ✓ Lokasyon: ${loc!.name}`);

  // 3) Kullanıcılar (Supabase Auth bağlantısı yok — dev için)
  const [owner] = await db
    .insert(users)
    .values({
      org_id: org!.id,
      email: 'owner@acme.com',
      full_name: 'Aslı Yıldız',
      role: 'owner',
      department: 'Genel Müdürlük',
      title: 'CEO',
      hired_at: '2020-01-15',
    })
    .returning();
  const [manager] = await db
    .insert(users)
    .values({
      org_id: org!.id,
      email: 'manager@acme.com',
      full_name: 'Mehmet Demir',
      role: 'manager',
      department: 'Yazılım',
      title: 'Engineering Manager',
      hired_at: '2021-06-01',
    })
    .returning();
  const [employee] = await db
    .insert(users)
    .values({
      org_id: org!.id,
      email: 'employee@acme.com',
      full_name: 'Zeynep Kaya',
      role: 'employee',
      department: 'Yazılım',
      title: 'Software Engineer',
      hired_at: '2023-03-15',
      annual_leave_quota_days: 14,
      annual_leave_used_days: 3,
    })
    .returning();

  console.log(`  ✓ Owner: ${owner!.full_name}`);
  console.log(`  ✓ Manager: ${manager!.full_name}`);
  console.log(`  ✓ Employee: ${employee!.full_name}`);

  console.log('\n✅ Seed tamamlandı.');
  console.log('\nLokasyon koordinatları (test check-in için):');
  console.log(`  lat: ${loc!.latitude}, lon: ${loc!.longitude}`);
  console.log('\nNot: Supabase Auth bağlantısı kurulduğunda kullanıcıların auth_user_id alanını güncelle.');
}

run()
  .catch((err) => {
    console.error('❌ Seed hatası:', err);
    process.exit(1);
  })
  .finally(() => closeDb());
