# SIRADAKİ İŞ — Token yönetimi ve CSP (kullanıcı 2026-10-23'te sıraya aldı)

> Kullanıcının notu: "session yenilendiğinde ilk iş bu promtu al"

Motorya'da oturumsuz dış incelemede iki öncelikli güvenlik iyileştirmesi
belirlendi. Önce mevcut frontend, backend ve admin kodunu incele;
aşağıdaki bulguları doğrula, mimariye uygun düzeltmeleri uygula ve test et.

Bunlar doğrulanmış XSS veya hesap ele geçirme açıkları DEĞİL; mevcut
tasarımın risklerini azaltma çalışmasıdır. Çalışan giriş, oturum
yenileme, Google ile giriş, mesajlaşma ve reklam akışlarını koru.

## 1. Tokenların kalıcı tarayıcı deposunda tutulmasını düzelt

Dışarıdan erişilebilen frontend kodunda şunlar görüldü:
- `localStorage.setItem("access_token", ...)`
- `localStorage.setItem("refresh_token", ...)`
- Zustand `motorya-auth` kalıcı durumunda token ve refreshToken alanları
- `device_id` de aynı depoda tutuluyor

Gerçek kullanıcı tokenları okunmadı; bulgu yayımlanmış istemci koduna
dayanıyor. Risk: aynı origin'de çalışan bir XSS veya ele geçirilmiş
üçüncü taraf betiği tokenları okuyabilir. Device ID'nin aynı depoda
bulunması tek başına bu riski ortadan kaldırmaz.

### Önerilen yaklaşım (zorunlu tarif değil — kod incelemesine dayanarak seç ve nedenini açıkla)
- Yenileme tokenını `Secure`, `HttpOnly`, uygun `SameSite` ayarlı çerezde sakla.
- Gereksiz geniş `Domain=.motorya.com.tr` kullanma; mümkünse host-only çerez.
- Erişim tokenını kısa ömürlü olarak bellekte tut veya BFF/sunucu oturumu değerlendir.
- Çerez domain/path ve API proxy davranışını birlikte tasarla. Ana site,
  doğrudan API ve admin aynı origin DEĞİL; bu ayrımı göz ardı etme.
- Admin oturumunu tüketici oturumuyla yanlışlıkla ortaklaştırma.

### Birlikte ele alınacak kontroller
- Çerez tabanlı kimlik doğrulamada CSRF koruması ve sunucu taraflı Origin doğrulaması
- Dar ve açık CORS izin listesi; kimlik bilgili isteklerde joker origin yok
- Refresh token rotasyonu, tekrar kullanım tespiti, eşzamanlı yenileme davranışı
- Çıkışta sunucu oturumunun iptali ve çerezin doğru domain/path ile temizlenmesi
- Mevcut "tüm cihazlardan çıkış" / şifre değişimi sonrası iptal davranışının korunması
- Tokenların URL, analitik, hata kaydı veya loglara yazılmaması
- Özel oturum yanıtlarında `Cache-Control: no-store`

`HttpOnly` çerez XSS'i çözmez; yalnızca tokenın JS ile okunmasını
sınırlar. XSS önlemlerini ve CSP çalışmasını ayrıca sürdür.

### Geçiş planı
- Eski `localStorage`, `sessionStorage` ve Zustand kalıcı durumundaki token kopyalarını kaldır
- Yeni tokenların bu depolara yeniden yazılmadığını doğrula
- Eski oturumların nasıl taşınacağını veya kontrollü yeniden giriş isteyeceğini açıkla
- Geçiş amacıyla süresiz açık kalacak güvensiz eski akış bırakma
- Geri dönüş planını güvenlik etkisiyle birlikte belirt

## 2. CSP'yi kademeli olarak güçlendir

Ana sitede AKTİF CSP yalnızca:
`object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'`

Daha kapsamlı `default-src`, `script-src`, `connect-src` kuralları
`Content-Security-Policy-Report-Only` başlığında — yani ihlalleri
ENGELLEMİYOR. Raporlama politikasındaki `script-src` ayrıca
`unsafe-inline` ve `unsafe-eval` içeriyor.

### Yapılacaklar
- CSP başlıklarının hangi katmanda üretildiğini belirle: uygulama, proxy veya Cloudflare
- Çakışan/birbirini beklenmedik şekilde kısıtlayan birden fazla politika oluşmasını engelle
- Üretimde gereken betik, bağlantı, görsel, font ve iframe kaynaklarını çıkar
- Next.js, Google ile giriş, reklamlar, Cloudflare doğrulaması, analitik/hata izleme, socket
- Uygunsa nonce/hash tabanlı betik politikası; nonce kullanılırsa başlık-HTML eşleşmesi ve CDN/önbellek etkisi
- Üretimde `unsafe-eval` gerekip gerekmediğini araştır; geliştirme ihtiyacını üretime taşıma
- `unsafe-inline` kullanımını azaltacak uygulanabilir plan
- Mevcut `object-src`, `base-uri`, `form-action`, `frame-ancestors` korumalarını koru
- Reklam betiklerinin giriş/hesap gibi hassas sayfalarda gerçekten gerekip gerekmediğini değerlendir

### Dağıtım yaklaşımı
- Önce test ortamında ve raporlama modunda gerçek ihlalleri incele
- Gerekli kaynakları dar izinlerle tanımla
- Uyumlu politikayı kademeli olarak zorunlu uygulamaya geçir
- Report-Only başlığını aynen aktif başlığa kopyalamayı tamamlanmış çözüm SAYMA
- Sorun çıktığında tüm korumayı kapatmak yerine ilgili uyumsuzluğu dar kapsamda çöz

CSP raporlaması kullanılıyorsa URL sorgularında token/kişisel veri
bulunabileceğini dikkate al; veri minimizasyonu ve erişim kontrolü uygula.

## Korunacak mevcut kontroller
Dış incelemede şunlar doğru çalışıyor, BOZMA:
- Admin `/`, `/dashboard`, `/users`, `/ads` → Cloudflare Access giriş kapısı
- `/users/me`, `/messages/conversations`, `/listings/taslak`, `/listings/mine`,
  `/listings/favorites/mine` → hem doğrudan API'de hem `/api-backend` üzerinden oturumsuz 401
- Ana sitede HTTPS yönlendirmesi, HSTS, çerçeveleme engeli, nosniff

Cloudflare Access'in varlığını backend rol kontrolünün yerine koyma.

## Doğrulama (kontrollü test hesaplarıyla)
1. Normal giriş ve Google ile giriş
2. Sayfa yenileme, yeni sekme, tarayıcıyı yeniden açma sonrası oturum davranışı
3. Erişim tokenı sona erdiğinde güvenli yenileme
4. Eşzamanlı isteklerin yenilemede döngü veya rastgele çıkış oluşturmaması
5. Çıkış ve iptal edilmiş oturumun yeniden kullanılamaması
6. Eski refresh tokenın tekrar kullanım davranışı
7. JS'in yenileme çerezini okuyamaması; tarayıcı depolarında token kalmaması
8. CSRF ve izin verilmeyen origin kontrolleri
9. Mesajlaşma/socket, fotoğraf yükleme, ilan taslağı
10. CSP altında reklamlar, Google/Cloudflare akışları, temel sayfalar
11. Admin ve tüketici oturumlarının birbirine karışmaması
12. Oturumsuz özel API isteklerinin 401 dönmeye devam etmesi

Testleri yerel/test ortamında yap. Canlıda parola denemeleri, e-posta
gönderimleri veya gerçek kullanıcı oturumlarını etkileyen işlem YAPMA.

## Teslim
- Doğruladığın mevcut mimariyi ve seçtiğin çözümü kısa açıkla
- Tamamlanan değişiklikleri, test kanıtlarını ve kalan riskleri AYRI sun
- Kod dışı Cloudflare/proxy ayarı gerekiyorsa hangi ayar olduğunu tam belirt;
  uygulanmamış ayarı tamamlandı SAYMA
- Migration, mevcut oturumlara etkisi, dağıtım sırası ve geri dönüş planı
- Sadece derlemenin geçmesini güvenlik doğrulaması kabul etme

Öncelik token yönetimi ve CSP. `security.txt`, servis metaverisi,
`X-Powered-By` gibi düşük öncelikli maddeler AYRI takip listesine.

**CANLIYA DAĞITIM YAPMA; önce kodu ve test sonuçlarını incelemeye hazırla.**
