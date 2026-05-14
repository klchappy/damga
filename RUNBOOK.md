# Damga Production RUNBOOK

> **Amaç:** Acil durumlarda hızlı karar verebilmek + olağan operasyonel görevleri tek yerden yapabilmek.
>
> **Hedef kitle:** Kaan (solo dev) — gelecekte yeni dev veya on-call rotasyonu için temel.

---

## 🚨 Acil durum kararları (5 dakikada)

### 1. Site tamamen down (damga.deploi.net 5xx)

```
1. https://damga.deploi.net/status — UptimeRobot dışında native status page
2. https://api.damga.deploi.net/v1/health — API yaşıyor mu?
3. Sentry dashboard: yeni hata patlaması var mı? (deploinet.sentry.io)
4. Coolify panel: container'lar healthy mi?
   → coolify.deploi.net → damga project → API/Web durum

Eğer container down:
   → Coolify > damga-api > "Restart" (in-place restart, 30 sn)
   → Hala down ise: "Redeploy" (full rebuild, 3-5 dk)

Eğer container UP ama 5xx dönüyor:
   → Coolify > damga-api > Logs
   → Son 100 satır oku → Sentry'de detay
```

### 2. DB bağlantı kopuk (Supabase down veya pool dolu)

```
1. https://status.supabase.com — Supabase global durumu
2. Supabase dashboard > tidsuaupjvtviewidbav > Database > Pool
   → Active connections kaç? Max 60 (free tier)
3. Çok yüksekse: damga-api restart (connection leak olabilir)
4. Supabase down ise: Twitter @supabase + status page sayfasına bak
   → ETA al, KVKK yıllığa Customer'a "geçici sorun" duyurusu (eğer >30 dk)
```

### 3. Cloudflare proxy hatası (origin'e ulaşamıyor)

```
1. dash.cloudflare.com > deploi.net > Analytics > 5xx oranı
2. Hetzner sunucusu UP mu? `ping 46.225.25.177`
3. SSL/TLS modu Full mi? (Cloudflare > deploi.net > SSL/TLS > Overview)
4. DNS A record `damga.deploi.net` ve `api.damga.deploi.net` doğru IP'ye işaret mi?
```

### 4. KVKK ihlali şüphesi (data leak)

```
1. ETKİLENEN VERİYI TESPİT ET:
   - Hangi org_id'ler? (multi-tenant izolasyon ihlal mi?)
   - Sentry'de "[BLOCKED: PII]" işaretli error var mı?
   - audit_log tablosunda anormal okuma var mı?
2. 72 SAAT İÇİNDE KVKK BILDİRİMİ ZORUNLU:
   - kvkk.gov.tr/Anasayfa/VeriIhlali → online form
   - Etkilenen kişi sayısı + nitelik + kategori
3. ETKİLENEN ORG'LARA E-POSTA: 48 saat içinde
   - Hangi veri, nasıl, ne aşamada düzeltildi
4. ROOT CAUSE: postmortem.md template'i ile yazılı dokümante et
```

### 5. Hetzner sunucusu çöktü (RTO 30 dk)

```
1. Hetzner Cloud Console > damga-prod > Console
2. Resource graph'ı (CPU/Mem/Disk) son saatleri kontrol et
3. Hard reset gerekiyorsa: Console > Power > "Restart"
4. Tamamen ölmüşse:
   a. Yeni CX22 oluştur (~3 dk Ubuntu 24.04)
   b. Coolify'i hızlı kur: `curl -fsSL https://cdn.coollabs.io/coolify/install.sh | bash`
   c. GitHub'tan repo bağla (auto-deploy aktif)
   d. Env vars Bitwarden'dan oku → Coolify'a yapıştır
   e. Cloudflare DNS A record yeni IP'ye → 30sn TTL ile anında geçer
```

---

## 🔄 Olağan operasyonlar

### Yeni feature deploy
```bash
git add . && git commit -m "feat: ..." && git push origin main
# Coolify webhook auto-deploy tetikler (2-5 dk)
# Doğrulama: https://api.damga.deploi.net/v1/health timestamp güncel mi?
```

### Backup test (ayda 1)
```bash
# Hetzner SSH veya Coolify > damga-api > Scheduled Tasks > "daily-pg-dump" > Run now
ssh root@damga
ls -lah /var/backups/damga/  # son dump var mı?
# Test restore:
cd /opt/damga/restore-test
gunzip -c /var/backups/damga/damga_$(date +%Y-%m-%d_*).sql.gz | psql $TEST_DB_URL
psql $TEST_DB_URL -c "SELECT count(*) FROM orgs, users, attendance_events;"
```

### Plan limit'leri güncelleme
```bash
# Supabase SQL Editor:
UPDATE public.plan_catalog
SET max_users = 50, max_locations = 10
WHERE plan = 'pro';
# Cache yok — anında geçerli
```

### Yeni org'a manuel destek (support@deploi.net)
```bash
# Platform admin sayfasından:
1. /platform → Organizasyonlar → Org bul
2. Detayda: kullanıcı listesi + plan + son aktivite
3. Org owner ile email/telefon iletişim
```

### Şüpheli kullanıcı işlemi (KVKK / dolandırıcılık)
```sql
-- 1. Kullanıcının son 24 saatlik aktivitesini gör
SELECT * FROM audit_log
WHERE user_id = $1 AND created_at > now() - interval '24 hours'
ORDER BY created_at DESC;

-- 2. Damga olaylarındaki anomali skorları
SELECT id, server_time, verification_score, flags, review_status
FROM attendance_events
WHERE user_id = $1 AND server_time > now() - interval '7 days'
ORDER BY server_time DESC;

-- 3. Hash chain doğrulama
SELECT public.verify_hash_chain((SELECT org_id FROM users WHERE id = $1));

-- 4. Hesabı pasifleştir (KVKK gereği bildirimli)
UPDATE public.users SET is_active = false, updated_at = now() WHERE id = $1;
```

### Sentry alert handle
```
1. Email/Slack notification geldi → Sentry issue link aç
2. Issue stack trace + event detayı incele
3. Etkilenen user/org sayısı (issue > Users)
4. Reproduce edilebiliyorsa: lokal test ortamı (pnpm dev)
5. Fix → commit → push → Coolify auto-deploy
6. Sentry'de issue "Resolved in <commit-hash>" işaretle
```

### Dependabot PR review
```
1. Her Pazartesi sabah GitHub > Pull Requests
2. Patch + minor PR'lar: typecheck + test pass ise auto-merge OK
3. Major PR'lar: changelog oku, breaking change var mı? Manual test
4. Kabul: gh pr merge --auto --squash
```

---

## 🛠️ Bakım rutinleri

### Haftalık (Pazartesi sabah, 15 dk)
- [ ] Sentry'de "Unresolved" issue'lere göz at, gerek varsa fix
- [ ] PostHog dashboard: funnel conversion'da düşüş var mı?
- [ ] UptimeRobot/native status: son 7 günlük uptime % kontrol
- [ ] Dependabot PR'larını triage
- [ ] Disk doluluk: `df -h` SSH'tan veya Coolify resources tab

### Aylık (ayın 1'i, 60 dk)
- [ ] Backup test restore (yukarıda)
- [ ] Bitwarden vault audit — eski/kullanılmayan secret var mı?
- [ ] Supabase storage doluluk + maliyet (free tier 1GB, Pro 100GB)
- [ ] CX22 → CX32 upgrade kararı (CPU ortalama >%70 ise)
- [ ] Sentry quota — free tier 5K errors aşıldı mı?
- [ ] PostHog quota — 1M events aşıldı mı?

### Üç aylık (90 günde 1)
- [ ] KVKK Aydınlatma Metni revize gerekiyor mu? (yeni özellikler eklendiyse)
- [ ] DPA template'ini yeni müşterilere veriyor musun?
- [ ] Pen-test gerekli mi? (yeni kurumsal müşteri ihalesi varsa)
- [ ] SLA performans rapor (uptime %, response time avg)

---

## 📊 SLO (Service Level Objectives)

| Metric | Hedef | Ölçüm |
|---|---|---|
| **API uptime** | 99.5% / ay | `/v1/status?range=30d` |
| **Web uptime** | 99.5% / ay | aynı endpoint |
| **API p95 latency** | <500ms | health monitor `latency_ms` |
| **Sentry error rate** | <0.5% request | Sentry "Error rate" |
| **RPO** (kayıp tahammülü) | ≤24 saat | günlük pg_dump |
| **RTO** (kurtarma süresi) | ≤30 dakika | DR prosedürü test |

**Aşıldığında:**
- 99.5% < uptime → POST-MORTEM zorunlu
- Sentry error rate > 1% → hotfix branch + hızlı deploy
- RTO/RPO ihlali → arch review

---

## 🔐 Erişimler + kimlik

**Tüm erişimler Bitwarden vault'unda:** "Damga Sistem Envanteri" notu

| Servis | URL | Notes |
|---|---|---|
| Hetzner Cloud | console.hetzner.cloud | SSH key Bitwarden'da |
| Coolify | coolify.deploi.net | Admin: kaanklc498@gmail.com |
| Supabase | supabase.com/dashboard/project/tidsuaupjvtviewidbav | EU/Frankfurt |
| Cloudflare | dash.cloudflare.com | Zone: deploi.net |
| GitHub | github.com/klchappy/damga | Private repo |
| Sentry | deploinet.sentry.io | 2 projects: damga-api + damga-web |
| Resend | resend.com/domains | deploi.net verified |
| PostHog | (kurulduktan sonra) | EU host |
| Backblaze B2 | backblaze.com | Backup destination |
| Bitwarden | vault.bitwarden.com | Master password 2FA |

**Acil durumda öncelik:** Bitwarden → vault aç → "Damga Sistem Envanteri" notu.

---

## 📝 Postmortem template

Major incident sonrası (uptime ihlali, data leak, prolonged outage):

```markdown
# Postmortem: [Kısa başlık]
Date: YYYY-MM-DD
Severity: P0 / P1 / P2
Duration: HH:MM - HH:MM (X dk)

## Özet
Bir paragrafla ne oldu.

## Etki
- Kaç kullanıcı / org etkilendi?
- Hangi feature down kaldı?
- Mali etki var mı?

## Zaman çizelgesi
- 14:32 — Sentry alert: 500 patlama
- 14:35 — Investigation başladı
- 14:48 — Root cause bulundu: ...
- 14:55 — Fix deploy edildi
- 15:02 — Resolved + Sentry confirm

## Root cause
Teknik detayla ne yanlış gitti.

## Çözüm
Anlık fix ne yapıldı.

## Bundan sonra
- [ ] Action item 1
- [ ] Action item 2 (test ekle, monitoring ekle, runbook güncelle vs.)

## Dersler
- Ne işe yaradı?
- Ne işe yaramadı?
- Ne öğrenildi?
```

---

## 🆘 İletişim sırası

**Müşteri etkili kritik durumda (P0/P1):**
1. Müşteri tarafı: destek@deploi.net otomatik email (3 dk içinde)
2. Sosyal: Status page güncellemesi (web/api targeting)
3. Eğer >1 saat: org owner'lara doğrudan email (manuel)

**Müşteri etkili olmayan acil (P2):**
- 24 saat içinde fix yeterli, müşteri bildirim gerekmez

**Vendor escalation:**
- Hetzner: Console → Ticket (resmi support)
- Supabase: support@supabase.io (Free tier 48 saat, Pro 8 saat)
- Cloudflare: dash > Support → Free tier sadece community

---

## 🔄 Versiyonlama

| Versiyon | Tarih | Değişiklik |
|---|---|---|
| 0.1 | 2026-05-14 | İlk RUNBOOK — solo dev için temel rehber |
