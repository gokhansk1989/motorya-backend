# Huni ölçümü — olay sözlüğü ve metrik hesapları

Bu belge `src/modules/analytics/` altındaki ölçüm sisteminin sözleşmesidir.
Olay adı ya da metrik tanımı değişirse burası da değişmeli; aksi hâlde
rapordaki sayıların ne anlama geldiği kaybolur.

## Neden ayrı bir sistem var

Projede zaten Google Analytics + Ads dönüşüm sinyalleri var
(`motorya-frontend/src/lib/analytics.ts`). O sistem yerinde duruyor ve
reklam tekliflendirmesini besliyor. Huni ölçümü ona **aynı olayları ikinci
kez göndermiyor**, çünkü GA bu işi yapamıyor:

- Çerez onayına bağlı; reddeden kullanıcıların akışı görünmüyor.
- Kendi yönetici panelimizden sorgulanamıyor.
- Moderasyon sonucu ve satıcı yanıtı gibi sunucu gerçekleri tarayıcıda yok.
- Serbest arama metni GA'ya giderse kişisel veri sızma riski doğuyor.

## İki kaynak, tek rapor

| Kaynak | Ne hesaplıyor | Geriye dönük doğru mu |
|---|---|---|
| `veritabani` | İlan gönderimi, moderasyon sonucu, ilk mesaj, satıcı yanıtı, teklifler | **Evet** — `Listing`/`Message`/`Offer` tablolarından |
| `olay` | Form adımları, foto/form hataları, arama sonuç sayısı, sonuç tıklaması, detay görüntüleme, mesaj butonu | Hayır — yalnızca ölçümün kurulduğu tarihten sonrası |
| `karma` | Mesaj butonu → kaydedilmiş ilk mesaj | Yalnızca iki tarafın da veri ürettiği aralıkta |

Veritabanından çıkarılabilen hiçbir şey olay olarak yazılmıyor. Aynı gerçeği
iki yerde tutmak, ikisinin sapması demek.

## Cihaz kimliği yok

Çerez, `localStorage`, `sessionStorage` ve parmak izi kullanılmıyor.
İlişkilendirme iki yolla yapılıyor:

- **Oturum açmış kullanıcı:** `userId`, sunucuda token'dan okunuyor.
- **Akış kimliği:** `crypto.randomUUID()`, yalnızca React state'inde yaşıyor,
  cihaza yazılmıyor, sayfa yenilenince kayboluyor.

Sonuç: ölçüm yeni bir takip mekanizması başlatmıyor, çerez onayına bağlı
değil. Bedeli: **oturum bazlı metrik yok.** "Arama → ilan detayı geçişi"
bu yüzden oturum oranı değil, olay oranı; geçişin kendisi (`arama_sonuc_tiklandi`)
ayrı bir olay olarak ölçülüyor ki oturum birleştirmeye ihtiyaç kalmasın.

## Olay sözlüğü

Tek doğruluk kaynağı `src/modules/analytics/olay-sozlugu.ts`. Sözlükte
olmayan olay adı 400 ile reddediliyor; tanımlanmamış alan sessizce düşürülüyor.
`GET /analitik/sozluk` (ADMIN) aynı listeyi döndürüyor.

| Olay | Akış kimliği | Alanlar | Ne demek |
|---|---|---|---|
| `ilan_akis_basladi` | zorunlu | — | Form açıldı (oturum hazır, T.C. kapısı geçilmiş) |
| `ilan_adim_tamamlandi` | zorunlu | `adim` 1–3 | Adım doğrulamayı geçip ilerledi |
| `ilan_foto_yuklendi` | zorunlu | `adet` | Yükleme sunucuda başarılı |
| `ilan_foto_hata` | zorunlu | `hataKodu` | `ag`/`sunucu`/`boyut`/`tip`/`limit`/`istek` |
| `ilan_form_hatasi` | zorunlu | `alan`, `kod` | Yalnızca alan adı ve hata türü — **girilen değer asla** |
| `ilan_gonderildi` | zorunlu | `listingId` | Sunucu ilanı oluşturdu ve kimliğini döndürdü |
| `arama_yapildi` | — | `sonucSayisi`, `sifirSonuc`, `metinVar`, `kategori`, `filtreler[]` | Sonuç döndü. **Arama metni kaydedilmiyor**, yalnızca var olup olmadığı |
| `arama_sonuc_tiklandi` | — | `listingId` | Sonuç listesinden ilana geçildi |
| `ilan_detay_goruntulendi` | — | `listingId`, `kaynak`, `kendiIlani` | `kaynak`: arama/liste/doğrudan (yalnızca referrer yolundan) |
| `mesaj_butonu_tiklandi` | — | `listingId`, `kendiIlani` | **Gönderilmiş mesaj değil** |

4. adım (Fiyat) ayrı tamamlama olayı üretmiyor — o adımda gönder düğmesi var,
dolayısıyla 4. adımın tamamlanması `ilan_gonderildi`'nin kendisi.

## Ölçüm kuralları

| Kural | Değer | Neden |
|---|---|---|
| Akış boşluğu | 30 dk | Aynı kullanıcının bu süreden kısa aralıklarla açtığı formlar **tek girişim**. Yenileme ve tekrar denemeler sayıyı şişirmiyor |
| Akış penceresi | 24 sa | Gece yarısını aşan ya da yarın devam eden form doğru girişime bağlı kalıyor |
| Olgunlaşma | 48 sa | Yayın ve yanıt oranlarının paydasında yalnızca bu kadar eski kayıtlar. Dün gelen yanıtsız mesaj, bir aydır yanıtlanmayanla aynı değil |
| Asgari payda | 20 | Altında "Yeterli veri yok". 3/5 = %60 karar üretmez |
| Saat dilimi | Europe/Istanbul | Gün sınırları yerel; kolonlar UTC tuttuğu için parametreler `::timestamp` ile açıkça dönüştürülüyor (`ts()`) |
| Tekilleme | `eventId` UNIQUE | `createMany(skipDuplicates)`; istemciye güvenmeden sunucuda |
| Personel/test | Olay anında `isStaff` damgası + `ANALYTICS_HARIC_KULLANICILAR` | Rol sonradan değişirse geçmiş sayılar kaymıyor |
| Bot | UA deseni, alımda | UA hiçbir yere yazılmıyor, yalnızca karşılaştırılıyor |
| Kendi ilanı | `kendiIlani` bayrağı | İlan sahibinin kendi ilanını görüntülemesi dönüşüm hesaplarında yok |

## Metrik hesapları

Her metrik raporda payını, paydasını ve tanımını taşıyor. Kullanıcı, oturum,
ilan ve olay sayıları karıştırılmıyor — birim metrik adında ve tanımında yazıyor.

**İlan verme akışı** (olay)
- Başlangıç → gönderim = `ilan_gonderildi` olan girişim ÷ formu açan girişim
- Adım n: ulaşan = `enYüksekAdım ≥ n-1`, tamamlayan = `≥ n` (n=4 için: gönderildi)
- Foto hata oranı = `ilan_foto_hata` ÷ (`ilan_foto_yuklendi` + `ilan_foto_hata`) — **olay bazlı**
- Form hatası gören girişim oranı = en az bir hata gören girişim ÷ girişim

**Gönderim → yayın** (veritabanı)
- Oran = `publishedAt IS NOT NULL` ÷ `createdAt < şimdi-48sa` olan ilanlar
- Medyan bekleme = `percentile_cont(0.5)` üzerinden `publishedAt - createdAt`
- Ret neden kırılımı = `Listing.rejectionReason` kodları (`src/common/ret-nedenleri.ts`).
  Kod zorunlu değil: önbellekten çalışan eski bir panel paketi reddetmeyi
  kırmasın. Kod gelmezse NULL kalıyor ve kırılımda **`kod-girilmemiş`** olarak
  ayrı satırda duruyor — alan eklenmeden önceki retler de orada. Tahminle
  doldurulmuyor. Serbest metin açıklama satıcıya gidiyor, **analitiğe
  girmiyor**; kişisel veri içerebiliyor
- Personel satıcılar hariç

**Arama** (olay)
- Sıfır sonuç oranı = `sifirSonuc` ÷ tüm aramalar
- Arama → detay geçişi = `arama_sonuc_tiklandi` ÷ `arama_yapildi`.
  **Olay oranıdır**, %100'ü aşabilir (bir arama birden fazla tıklama üretir)

**Satıcıya ulaşma**
- Detay → ilk mesaj gönderimi = kaydedilmiş ilk alıcı mesajı ÷ detay görüntülemesi.
  Uçtan uca oran; aşağıdaki iki metrik aynı yolu düğme tıklamasından bölerek
  düşüşün nerede olduğunu gösteriyor
- Detay → mesaj butonu = buton tıklaması ÷ detay görüntülemesi (ikisi de `kendiIlani=false`)
- Satıcı yanıt oranı = yanıtlanan konuşma ÷ ilk mesajı 48 saatten eski konuşma
- Medyan yanıt süresi = ilk satıcı mesajı − ilk alıcı mesajı
- Her konuşma **bir kez** sayılıyor; aynı konuşmadaki sonraki mesajlar yeni
  iletişim başlangıcı değil. Satıcının kendi konuşması hariç

**Teklifler** (veritabanı)
- Dönemde oluşturulan ve bunlardan kabul edilenler (aynı kohort)
- **Kabul edilmiş teklif gerçekleşmiş satış değildir** — ödeme/teslim platform dışında

## Gizlilik

Analitiğe gitmeyen veriler: ad, e-posta, telefon, T.C. kimlik, tam konum,
mesaj içeriği, teklif notu, şifre, token, form değerleri, serbest arama metni.
Sözlükteki alan tipleri (`tamsayi`/`bayrak`/`kimlik`/`kod`/`kodListesi`)
serbest metne hiç izin vermiyor; `propsTemizle()` bilinmeyen alanı düşürüyor.

**Saklama:** 180 gün, günlük `@Cron('15 4 * * *')` ile budanıyor.
**Silme:** `AnalyticsEvent.userId` → `User` ilişkisi `ON DELETE CASCADE`;
hesap silinince o hesabın olayları da siliniyor.
**Yetki:** rapor ve sözlük uçları `AuthGuard('jwt') + RolesGuard` ile
ADMIN/SUPER_ADMIN'e kısıtlı. Panelde menüyü gizlemek yeterli değil.
**Kötüye kullanım:** alım ucu `@Throttle(60/dk)`, paket başına en fazla 20 olay.

## Arıza dayanıklılığı

Ölçüm arızası ilan vermeyi, aramayı ya da mesajlaşmayı engellemiyor:
- İstemci yanıt beklemiyor (`keepalive` fetch, hata yutuluyor, toast yok).
- `AnalyticsService.kaydet()` hiçbir koşulda hata fırlatmıyor.
- Alım ucu 202 döndürüyor.
- Tablo yoksa bile akış çalışmaya devam eder (yazma denemesi loglanıp düşer).

## Kurulum

Eklemeli değişiklik — sıra **veritabanı → kod** (bkz. `motorya-db-migration`):

```bash
# Kilit kuyruğuna girmemek için lock_timeout ile; betikler yeniden koşulabilir
(echo "SET lock_timeout='3s';"; cat prisma/migrations/add_analytics_event.sql) \
  | ssh ubuntu@78.47.227.132 "sudo -u postgres psql -d vites -v ON_ERROR_STOP=1 -f -"
(echo "SET lock_timeout='3s';"; cat prisma/migrations/add_listing_rejection_reason.sql) \
  | ssh ubuntu@78.47.227.132 "sudo -u postgres psql -d vites -v ON_ERROR_STOP=1 -f -"
```

Yabancı anahtar eklenirken `User` üzerinde kısa bir `ShareRowExclusiveLock`
alınıyor (ölçüldü: 59 ms) — okuma serbest, yazma bekliyor. `lock_timeout`
kilit kuyruğunun o 59 ms'yi dakikalara çevirmesini engelliyor.

Doğrulama:

```bash
ssh ubuntu@78.47.227.132 "sudo -u postgres psql -d vites -c '\d \"AnalyticsEvent\"'"
```

Betik yeniden koşulabilir. Sonra kodu deploy et (local > github > sunucu).

İsteğe bağlı ortam değişkeni:
`ANALYTICS_HARIC_KULLANICILAR=cuid1,cuid2` — personel rolü olmayan test hesapları.
