/**
 * Yasal sayfalar — KVKK aydınlatma, Kullanım Şartları, Gizlilik, Çerezler.
 *
 * Damga B2B SaaS modeli: işveren (org) = veri sorumlusu, Damga = veri işleyen.
 * Tek tek route: /legal/kvkk · /legal/terms · /legal/privacy · /legal/cookies
 */
import { Link } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';

function Layout({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-cream">
      <header className="bg-white border-b border-orange-100">
        <div className="container mx-auto max-w-3xl px-4 py-3 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-md bg-orange-500 text-white font-display font-bold">
              D
            </div>
            <span className="font-display text-lg font-semibold">Damga</span>
          </Link>
          <Link
            to="/auth/sign-in"
            className="text-sm text-muted hover:text-orange-600 inline-flex items-center gap-1"
          >
            <ArrowLeft className="size-3.5" />
            Geri
          </Link>
        </div>
      </header>

      <main className="container mx-auto max-w-3xl px-4 py-10">
        <h1 className="font-display text-3xl mb-1">{title}</h1>
        <p className="text-xs text-muted mb-6">
          Son güncelleme: {new Date().toLocaleDateString('tr-TR')}
        </p>
        <article className="space-y-4 text-sm leading-relaxed text-ink">{children}</article>

        <hr className="my-8 border-orange-100" />
        <nav className="flex gap-3 text-xs text-muted flex-wrap">
          <Link to="/legal/kvkk" className="hover:text-orange-600">KVKK</Link>
          <span>·</span>
          <Link to="/legal/terms" className="hover:text-orange-600">Kullanım Şartları</Link>
          <span>·</span>
          <Link to="/legal/privacy" className="hover:text-orange-600">Gizlilik</Link>
          <span>·</span>
          <Link to="/legal/cookies" className="hover:text-orange-600">Çerezler</Link>
        </nav>
      </main>
    </div>
  );
}

// ─── KVKK Aydınlatma Metni ─────────────────────────────────────────────

export function KvkkPage() {
  return (
    <Layout title="KVKK Aydınlatma Metni">
      <p>
        6698 sayılı Kişisel Verilerin Korunması Kanunu (<strong>"KVKK"</strong>) kapsamında,
        Damga personel takip platformu ("Damga", "Hizmet Sağlayıcı") tarafından işlenen
        kişisel verileriniz hakkında aşağıdaki metinle bilgilendirilirsiniz.
      </p>

      <h2 className="font-display text-xl mt-6 mb-2">1. Veri Sorumlusu</h2>
      <p>
        İşvereniniz (sözleşmeli organizasyon, "Şirket"), Damga uygulaması üzerinden topladığı
        çalışan giriş/çıkış verileri için <strong>veri sorumlusu</strong>dur. Damga (Hizmet
        Sağlayıcı) veri işleyen sıfatıyla hareket eder. İletişim:
        <a href="mailto:kvkk@damga.deploi.net" className="text-orange-600 hover:underline">
          {' '}kvkk@damga.deploi.net
        </a>
      </p>

      <h2 className="font-display text-xl mt-6 mb-2">2. İşlenen Kişisel Veri Kategorileri</h2>
      <ul className="list-disc pl-6 space-y-1">
        <li><strong>Kimlik:</strong> Ad, soyad, e-posta, kullanıcı adı, telefon</li>
        <li><strong>İşlem:</strong> Giriş/çıkış zamanı, doğrulama yöntemi (NFC/QR/GPS), trust score</li>
        <li><strong>Konum:</strong> Sadece check-in/out anında, geofence kontrolü için</li>
        <li><strong>Cihaz:</strong> Cihaz id, IP adresi (son 2 oktet maskelenir), tarayıcı bilgisi</li>
        <li><strong>Sağlık (Özel Nitelikli):</strong> Mood emojisi — ayrı açık rıza ile</li>
        <li><strong>İzin/vardiya:</strong> İzin talepleri, vardiya atamaları, mesai kayıtları</li>
      </ul>

      <h2 className="font-display text-xl mt-6 mb-2">3. İşleme Amaçları</h2>
      <ul className="list-disc pl-6 space-y-1">
        <li>İş Kanunu md. 75 — özlük dosyası tutma yükümlülüğü</li>
        <li>İş sözleşmesi gereği veri işleme zorunluluğu (KVKK md. 5/2-c)</li>
        <li>Mood verisi için <strong>açık rıza</strong> (KVKK md. 5/1, 6/2)</li>
        <li>Hizmet sunumu, hesap yönetimi, raporlama</li>
        <li>Güvenlik, dolandırıcılık ve kötüye kullanım önleme</li>
      </ul>

      <h2 className="font-display text-xl mt-6 mb-2">4. Veri Aktarımı</h2>
      <p>
        Verileriniz; hizmetin sunulabilmesi için altyapı sağlayıcılarımıza (Supabase,
        Cloudflare, Hetzner, Coolify) ve yasal zorunluluk halinde resmi kurumlara
        aktarılabilir. Yurtdışı aktarımı (Supabase EU bölgesi, Cloudflare global) açık
        rızanıza dayalı yapılır.
      </p>

      <h2 className="font-display text-xl mt-6 mb-2">5. Saklama Süresi</h2>
      <p>
        İş Kanunu md. 75 ışığında <strong>5 yıl</strong>. Hesap silindiğinde kişisel
        veriler 30 gün içinde anonimleştirilir veya silinir; yasal saklama yükümlülüğü
        kapsamındaki kayıtlar süre sonuna kadar korunur.
      </p>

      <h2 className="font-display text-xl mt-6 mb-2">6. Haklarınız (KVKK md. 11)</h2>
      <p>Aşağıdaki haklara sahipsiniz:</p>
      <ul className="list-disc pl-6 space-y-1">
        <li>İşlenip işlenmediğini öğrenme</li>
        <li>İşlenmişse buna ilişkin bilgi talep etme</li>
        <li>İşleme amacını ve uygun kullanılıp kullanılmadığını öğrenme</li>
        <li>Yurtiçi/yurtdışında aktarıldığı 3. kişileri bilme</li>
        <li>Eksik/yanlış işlenmişse düzeltilmesini isteme</li>
        <li>Silinmesini veya yok edilmesini isteme</li>
        <li>Otomatik analiz sonucu aleyhinize çıkan duruma itiraz etme</li>
        <li>Zarara uğramışsanız tazminat talep etme</li>
      </ul>
      <p>
        Haklarınızı kullanmak için: <strong>kvkk@damga.deploi.net</strong> adresine
        kimliğinizi tevsik edici belgelerle başvurabilirsiniz. 30 gün içinde yanıt alacaksınız.
      </p>

      <h2 className="font-display text-xl mt-6 mb-2">7. Güncelleme</h2>
      <p>
        Bu aydınlatma metni mevzuat değişiklikleri ve hizmet güncellemelerine bağlı olarak
        revize edilebilir. Önemli değişiklikler size e-posta ile bildirilir.
      </p>
    </Layout>
  );
}

// ─── Kullanım Şartları ─────────────────────────────────────────────────

export function TermsPage() {
  return (
    <Layout title="Kullanım Şartları">
      <p>
        Damga platformuna ("hizmet", "platform") erişerek veya kayıt olarak aşağıdaki
        koşulları kabul etmiş sayılırsınız.
      </p>

      <h2 className="font-display text-xl mt-6 mb-2">1. Hizmet Tanımı</h2>
      <p>
        Damga, işletmeler için bulut tabanlı bir SaaS personel takip platformudur:
        check-in/out, vardiya, izin, mesai, gamification ve raporlama modülleri sunar.
      </p>

      <h2 className="font-display text-xl mt-6 mb-2">2. Hesap ve Sorumluluk</h2>
      <ul className="list-disc pl-6 space-y-1">
        <li>Damga'yı kullanarak 18 yaşından büyük olduğunuzu kabul edersiniz</li>
        <li>Hesap bilgilerinizin gizliliğinden siz sorumlusunuz</li>
        <li>Şifrenizi, NFC tag'larınızı ve API key'lerinizi paylaşmayın</li>
        <li>Yetkisiz erişim fark ederseniz derhal bildirin: kvkk@damga.deploi.net</li>
      </ul>

      <h2 className="font-display text-xl mt-6 mb-2">3. Ücretlendirme</h2>
      <ul className="list-disc pl-6 space-y-1">
        <li>14 gün ücretsiz deneme süresi sunulur, kart bilgisi gerekmez</li>
        <li>Deneme sonunda ücretli plana geçiş veya ücretsiz plana düşüş uygulanır</li>
        <li>Ücretler önceden bildirim ile değiştirilebilir</li>
        <li>İade politikası: 14 gün içinde sebep göstermeksizin iade hakkı</li>
        <li>Plan iptali sonraki dönem başında geçerli olur</li>
      </ul>

      <h2 className="font-display text-xl mt-6 mb-2">4. Yasak Davranışlar</h2>
      <ul className="list-disc pl-6 space-y-1">
        <li>Sahte GPS / spoofing yazılımları kullanmak</li>
        <li>Başkasının yerine check-in yapmak</li>
        <li>NFC / QR kodu kopyalamak veya çoğaltmak</li>
        <li>API rate limit'leri aşmak, scrape veya DoS amaçlı kullanım</li>
        <li>Yanıltıcı/yasadışı içerik yükleme, spam veya kötü niyetli yazılım dağıtma</li>
      </ul>
      <p className="text-sm text-warning">
        İhlal halinde hesap askıya alınır + işverene bildirim gönderilir.
      </p>

      <h2 className="font-display text-xl mt-6 mb-2">5. Hizmet Kesintileri</h2>
      <p>
        Bakım veya teknik aksaklıklar nedeniyle hizmet geçici olarak kesintiye uğrayabilir.
        Damga, %99.5 erişilebilirlik hedefler ancak garantilemez. Trust score sonuçları
        danışma niteliğindedir; idari kararlar işverenin sorumluluğundadır.
      </p>

      <h2 className="font-display text-xl mt-6 mb-2">6. Fikri Mülkiyet</h2>
      <p>
        Damga yazılımının tüm hakları saklıdır. Kullanıcı tarafından üretilen veriler
        (check-in kayıtları, izin talepleri, vb.) işverene aittir; veri export hakkı
        her zaman saklıdır.
      </p>

      <h2 className="font-display text-xl mt-6 mb-2">7. Sorumluluk Sınırı</h2>
      <p>
        Damga, dolaylı zararlardan, kar kaybından veya iş kesintisinden sorumlu değildir.
        Toplam sorumluluk, son 12 ayda ödediğiniz ücretle sınırlıdır.
      </p>

      <h2 className="font-display text-xl mt-6 mb-2">8. Hesap Sonlandırma</h2>
      <p>
        Bu koşulları ihlal eden hesaplar uyarı sonrası askıya alınabilir. Veriler 30 gün
        boyunca saklanır, sonra silinir. Kullanıcı her zaman hesabını silebilir.
      </p>

      <h2 className="font-display text-xl mt-6 mb-2">9. Uygulanacak Hukuk</h2>
      <p>
        Bu koşullar Türk hukukuna tabidir. Uyuşmazlıklar İstanbul Mahkemeleri ve İcra
        Daireleri'nde çözülür.
      </p>

      <h2 className="font-display text-xl mt-6 mb-2">10. İletişim</h2>
      <p className="font-mono text-xs">destek@damga.deploi.net</p>
    </Layout>
  );
}

// ─── Gizlilik Politikası ───────────────────────────────────────────────

export function PrivacyPage() {
  return (
    <Layout title="Gizlilik Politikası">
      <p>
        Bu gizlilik politikası, Damga'nın kullanıcı verilerini nasıl topladığını,
        kullandığını ve koruduğunu açıklar. KVKK Aydınlatma Metni ile birlikte okunmalıdır.
      </p>

      <h2 className="font-display text-xl mt-6 mb-2">Topladığımız Veriler</h2>
      <ul className="list-disc pl-6 space-y-1">
        <li><strong>Hesap verileri:</strong> Ad-soyad, e-posta, kullanıcı adı, şifre (hashlanmış)</li>
        <li><strong>Şirket verileri:</strong> Şirket adı, departman, lokasyon, abonelik bilgileri</li>
        <li><strong>İşlem verileri:</strong> Giriş/çıkış zamanı, doğrulama yöntemi, trust score</li>
        <li><strong>Konum verileri:</strong> Sadece check-in/out anında, geofence kontrolü için</li>
        <li><strong>Teknik veriler:</strong> IP (maskelenmiş), tarayıcı, cihaz, kullanım istatistikleri</li>
        <li><strong>Çerezler:</strong> Oturum, tercihler (ayrı politika)</li>
      </ul>

      <h2 className="font-display text-xl mt-6 mb-2">Verileri Nasıl Kullanıyoruz</h2>
      <ul className="list-disc pl-6 space-y-1">
        <li>Hizmeti sunmak ve kişiselleştirmek</li>
        <li>Kimlik doğrulama ve güvenlik</li>
        <li>İşverenin özlük dosyası yükümlülüğü (İş Kanunu md. 75)</li>
        <li>Müşteri desteği</li>
        <li>Hizmet iyileştirme (anonim agregat)</li>
      </ul>

      <h2 className="font-display text-xl mt-6 mb-2">Üçüncü Taraf Hizmetler</h2>
      <ul className="list-disc pl-6 space-y-1">
        <li><strong>Supabase</strong> — kimlik doğrulama ve veritabanı (EU bölgesi)</li>
        <li><strong>Cloudflare</strong> — CDN, DDoS koruma</li>
        <li><strong>Hetzner</strong> — sunucu altyapısı (Almanya)</li>
        <li><strong>Coolify</strong> — uygulama orkestrasyon (kendi sunucumuzda)</li>
        <li><strong>Iyzico</strong> — ödeme alma (yalnızca ücretli plana geçişte)</li>
        <li><strong>Web Push</strong> — tarayıcı bildirimleri (kendi VAPID anahtarımız)</li>
      </ul>

      <h2 className="font-display text-xl mt-6 mb-2">Veri Güvenliği</h2>
      <ul className="list-disc pl-6 space-y-1">
        <li>HTTPS şifreleme (TLS 1.3)</li>
        <li>Şifreler bcrypt ile hash'lenir, asla düz metin saklanmaz</li>
        <li>Org bazında veri izolasyonu (org_id ile zorunlu filtreleme)</li>
        <li>Audit log ile kritik işlemler kayıt altında</li>
        <li>Hash chain ile check-in kayıtlarının değiştirilemezliği</li>
        <li>Düzenli güvenlik güncellemeleri</li>
      </ul>

      <h2 className="font-display text-xl mt-6 mb-2">İletişim</h2>
      <p>
        Gizlilik konularında: <strong>privacy@damga.deploi.net</strong>
      </p>
    </Layout>
  );
}

// ─── Çerez Politikası ──────────────────────────────────────────────────

export function CookiesPage() {
  return (
    <Layout title="Çerez Politikası">
      <p>
        Damga, hizmetin doğru çalışması ve deneyimi iyileştirmek için çerezler kullanır.
      </p>

      <h2 className="font-display text-xl mt-6 mb-2">Kullandığımız Çerezler</h2>
      <table className="w-full text-xs border-collapse my-2">
        <thead>
          <tr className="bg-orange-50">
            <th className="border border-orange-100 px-3 py-2 text-left">Çerez</th>
            <th className="border border-orange-100 px-3 py-2 text-left">Tip</th>
            <th className="border border-orange-100 px-3 py-2 text-left">Süre</th>
            <th className="border border-orange-100 px-3 py-2 text-left">Amaç</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td className="border border-orange-100 px-3 py-2 font-mono">sb-access-token</td>
            <td className="border border-orange-100 px-3 py-2">Zorunlu</td>
            <td className="border border-orange-100 px-3 py-2">1 saat</td>
            <td className="border border-orange-100 px-3 py-2">Oturum doğrulama (Supabase JWT)</td>
          </tr>
          <tr>
            <td className="border border-orange-100 px-3 py-2 font-mono">sb-refresh-token</td>
            <td className="border border-orange-100 px-3 py-2">Zorunlu</td>
            <td className="border border-orange-100 px-3 py-2">7 gün</td>
            <td className="border border-orange-100 px-3 py-2">Oturum yenileme</td>
          </tr>
          <tr>
            <td className="border border-orange-100 px-3 py-2 font-mono">damga-cookie-consent</td>
            <td className="border border-orange-100 px-3 py-2">Zorunlu</td>
            <td className="border border-orange-100 px-3 py-2">1 yıl</td>
            <td className="border border-orange-100 px-3 py-2">Çerez tercihleri</td>
          </tr>
        </tbody>
      </table>

      <h2 className="font-display text-xl mt-6 mb-2">Çerez Yönetimi</h2>
      <p>
        Tarayıcınızın ayarlarından çerezleri yönetebilirsiniz. Zorunlu çerezler devre
        dışı bırakılırsa hizmetin temel işlevleri çalışmayabilir.
      </p>

      <h2 className="font-display text-xl mt-6 mb-2">Üçüncü Taraf Çerezler</h2>
      <p>
        Damga, üçüncü taraf reklam veya analitik çerezleri (Google Analytics, Facebook
        Pixel vb.) kullanmaz. Sadece Supabase auth çerezleri kullanılır.
      </p>
    </Layout>
  );
}
