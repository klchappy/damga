/**
 * Yasal sayfalar — KVKK aydınlatma + Kullanım Şartları (taslak).
 * Production'a açılmadan önce KVKK uzmanı + avukat gözden geçirmesi şart.
 */
export function KvkkPage() {
  return (
    <div className="container mx-auto max-w-3xl px-4 py-8 space-y-4">
      <h1 className="font-display text-3xl">KVKK Aydınlatma Metni</h1>
      <p className="text-xs text-muted italic">
        Son güncelleme: {new Date().toLocaleDateString('tr-TR')} · Bu metin taslaktır,
        avukat onayı sonrası yayınlanır.
      </p>

      <section className="space-y-2">
        <h2 className="font-display text-xl">Veri Sorumlusu</h2>
        <p>
          İşvereniniz (sözleşmeli organizasyon, "Şirket"), Damga uygulaması üzerinden
          topladığı çalışan giriş/çıkış verileri için <strong>veri sorumlusu</strong>dur.
          Damga (Damga Yazılım, "Hizmet Sağlayıcı") veri işleyen sıfatıyla hareket eder.
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="font-display text-xl">İşlenen Kişisel Veri Kategorileri</h2>
        <ul className="list-disc pl-6 space-y-1">
          <li><strong>Kimlik</strong>: Ad, soyad, e-posta</li>
          <li><strong>İşlem</strong>: Giriş/çıkış zamanı, doğrulama yöntemi (NFC/QR/GPS), trust score</li>
          <li><strong>Konum</strong>: Sadece check-in/out anında, geofence kontrolü için</li>
          <li><strong>Cihaz</strong>: Cihaz id, IP (son 2 oktet maskelenir)</li>
          <li><strong>Sağlık (Özel Nitelikli)</strong>: Mood emojisi — ayrı açık rıza ile</li>
        </ul>
      </section>

      <section className="space-y-2">
        <h2 className="font-display text-xl">İşleme Sebepleri</h2>
        <ul className="list-disc pl-6 space-y-1">
          <li>İş Kanunu md. 75 — özlük dosyası tutma yükümlülüğü</li>
          <li>İş sözleşmesi gereği veri işleme zorunluluğu (KVKK md. 5/2)</li>
          <li>Mood verisi için <strong>açık rıza</strong> (KVKK md. 5/1, 6/2)</li>
        </ul>
      </section>

      <section className="space-y-2">
        <h2 className="font-display text-xl">Saklama Süresi</h2>
        <p>İş Kanunu md. 75 ışığında <strong>5 yıl</strong>.</p>
      </section>

      <section className="space-y-2">
        <h2 className="font-display text-xl">Haklarınız (KVKK md. 11)</h2>
        <p>
          Verilerinizin işlenip işlenmediğini öğrenme, düzeltme/silme talep etme,
          işleme itiraz etme. İletişim:
        </p>
        <p className="font-mono">kvkk@damga.deploi.net</p>
      </section>

      <section className="space-y-2">
        <h2 className="font-display text-xl">Çerez Politikası</h2>
        <p>
          Sadece zorunlu çerezler (oturum, dil tercihi). Üçüncü taraf
          analitik/reklam çerezi yoktur.
        </p>
      </section>
    </div>
  );
}

export function TermsPage() {
  return (
    <div className="container mx-auto max-w-3xl px-4 py-8 space-y-4">
      <h1 className="font-display text-3xl">Kullanım Şartları</h1>
      <p className="text-xs text-muted italic">Taslak — avukat onayı bekleniyor.</p>

      <section className="space-y-2">
        <h2 className="font-display text-xl">1. Kabul</h2>
        <p>
          Damga'yı kullanarak 18 yaşından büyük olduğunuzu ve şirketiniz tarafından
          kullanım yetkisi verildiğini kabul edersiniz.
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="font-display text-xl">2. Hesap Güvenliği</h2>
        <ul className="list-disc pl-6 space-y-1">
          <li>Şifrenizi ve API key'lerinizi paylaşmayın</li>
          <li>NFC tag'larınızı yetkisiz kişilere vermeyin</li>
          <li>Şüpheli aktivite için kvkk@damga.deploi.net'e bildirin</li>
        </ul>
      </section>

      <section className="space-y-2">
        <h2 className="font-display text-xl">3. Yasak Davranışlar</h2>
        <ul className="list-disc pl-6 space-y-1">
          <li>Sahte GPS / spoofing yazılımları kullanmak</li>
          <li>Başkasının yerine check-in yapmak</li>
          <li>NFC/QR kodu kopyalamak veya çoğaltmak</li>
          <li>API rate limit'leri aşmak</li>
        </ul>
        <p className="text-sm text-warning">
          İhlal halinde hesap askıya alınır + işverene bildirim gönderilir.
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="font-display text-xl">4. Sorumluluk Sınırları</h2>
        <p>
          Damga, kesintisiz hizmet garantisi vermez. Trust score sonuçları danışma
          niteliğindedir; idari kararlar işverenin sorumluluğundadır.
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="font-display text-xl">5. Faturalandırma</h2>
        <p>
          Free plan ücretsizdir (1-3 kişi). Üst planlar Iyzico üzerinden aylık
          tahsil edilir. Plan iptali sonraki dönem başında geçerli olur.
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="font-display text-xl">6. İletişim</h2>
        <p className="font-mono">destek@damga.deploi.net</p>
      </section>
    </div>
  );
}
