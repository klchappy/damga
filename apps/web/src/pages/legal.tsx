/**
 * Yer tutucu yasal sayfalar — production'a almadan önce avukat onayı şart.
 */
export function KvkkPage() {
  return (
    <div className="container mx-auto max-w-3xl px-4 py-8 prose prose-orange">
      <h1 className="font-display text-3xl">KVKK Aydınlatma Metni</h1>
      <p className="text-muted">
        <em>Bu metin yer tutucudur. Production'a geçmeden önce KVKK uzmanı tarafından
        gözden geçirilmelidir.</em>
      </p>
      <h2>Veri Sorumlusu</h2>
      <p>
        İşvereniniz (org_id), Damga uygulaması üzerinden topladığı çalışan giriş/çıkış
        verileri için <strong>veri sorumlusu</strong>dur. Damga (Damga Yazılım A.Ş.)
        veri işleyen sıfatıyla hareket eder.
      </p>
      <h2>İşlenen Veriler</h2>
      <ul>
        <li>Kimlik: ad, soyad, e-posta</li>
        <li>İşlem: giriş/çıkış zamanı, lokasyon (sadece check-in anında)</li>
        <li>Cihaz: cihaz id, IP (son 2 oktet maskelenir)</li>
        <li>Sağlık: günlük mood damgası (özel rıza ile)</li>
      </ul>
      <h2>Hukuki Sebep</h2>
      <p>
        İş Kanunu md. 75 — özlük dosyası tutma zorunluluğu (sözleşmesel zorunluluk).
        Mood verisi için ayrıca KVKK md. 5/1 açık rıza alınır.
      </p>
      <h2>Saklama Süresi</h2>
      <p>5 yıl (İş Kanunu md. 75 ışığında).</p>
      <h2>Haklarınız</h2>
      <p>KVKK md. 11 kapsamındaki haklarınız için: <code>kvkk@damga.deploi.net</code></p>
    </div>
  );
}

export function TermsPage() {
  return (
    <div className="container mx-auto max-w-3xl px-4 py-8 prose prose-orange">
      <h1 className="font-display text-3xl">Kullanım Şartları</h1>
      <p className="text-muted"><em>Yer tutucu — avukat onayı bekleniyor.</em></p>
      <p>
        Damga'yı kullanarak <strong>13 yaş üstü olduğunuzu</strong> ve şirketiniz tarafından
        Damga kullanım yetkilendirilmesi yapıldığını kabul edersiniz.
      </p>
      <h2>Hesap Güvenliği</h2>
      <p>Şifrenizi paylaşmayın. NFC tag'ları başkasına vermeyin.</p>
      <h2>Yasak Davranışlar</h2>
      <ul>
        <li>Konum spoofing (sahte GPS)</li>
        <li>Başkasının yerine check-in</li>
        <li>NFC/QR kod kopyalama</li>
      </ul>
    </div>
  );
}
