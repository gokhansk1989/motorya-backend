---
name: motorya-privacy-review
description: Motorya backend'inde yeni bir uç (endpoint), Prisma sorgusu ya da `select` bloğu yazarken/değiştirirken kişisel verinin sızmadığını denetleme düzeni. Bu projede gerçek ad-soyad, TC kimlik ve parola özeti aynı `User` tablosunda duruyor ve Prisma `select` yazılmazsa TÜM alanları döner. Kullanıcı verisi dönen bir uç eklerken, bir `select`/`include` düzenlerken, rol kontrolü yazarken, ilan/mesaj/profil yanıtına alan eklerken ya da kullanıcı "KVKK", "kişisel veri", "gizlilik", "bu uç ne dönüyor" dediğinde bu skill'i kullan. Var olan bir ucu değiştiriyorsan da uygula — sızıntıların çoğu yeni uçta değil, mevcut bir `select`'e alan eklenirken oluşuyor.
---

# Motorya kişisel veri denetimi

## Alanların üç katmanı

`User` modelindeki alanlar eşit değil. Bir yanıta alan eklerken hangi
katmanda olduğuna bak:

**Asla dışarı çıkmaz — hiçbir role, hiçbir uçta**
`passwordHash`, `emailVerificationToken`, `passwordResetToken`,
`googleId`

**Yalnızca ADMIN / SUPER_ADMIN**
`tcKimlik`, `realName`, `birthDate`, `phone`, `email`

`MODERATOR` bu katmanı görmemeli. Moderatörün işi ilan ve şikâyet
moderasyonu; üyelerin yasal adına ya da kimlik numarasına ihtiyacı yok.
Bu oturumda üye listesi tam da bu yüzden daraltıldı.

**Herkese açık**
`id`, `displayName`, `avatarUrl`, `city`, `district`, `ratingAvg`,
`ratingCount`, `salesCount`, `isFounder`, `createdAt`

`displayName` **kullanıcı adıdır**, gerçek ad değil. Gerçek ad
`realName`'de durur ve yayınlanmaz. Kullanıcı adı seçmemiş eski
üyelerde `displayName === realName` — yani gerçek adları hâlâ yayında.
Bu bilinçli bir ürün kararı (otomatik üretilmiş "uye7k2m9" gibi adlar
istenmedi), hata değil.

## En sık yapılan hata: `select` yazmamak

Prisma'da `select` vermezsen **tüm skaler alanlar** döner. Yani
`findUnique({ where: { id } })` yazmak `passwordHash` ve `tcKimlik`'i
de getirir; o nesne yanıta karışırsa sızıntı olur.

Yönetim panelindeki güvenli desen:

```ts
private readonly guvenliKullaniciAlanlari = {
  id: true, email: true, displayName: true, role: true, status: true,
  createdAt: true, updatedAt: true,
} as const;
```

`admin.service.ts` içinde `changeUserRole` ve `moderateUser` bir dönem
`select` kullanmıyordu ve `passwordHash` + `tcKimlik` döndürüyordu.
Yeni bir yönetim ucu yazarken bu sabiti kullan, elle alan listelemekten
kaçın.

İç içe alanlar da aynı kuralda: `include: { seller: true }` satıcının
her şeyini getirir. Doğrusu `seller: { select: { id: true, displayName: true } }`.

## Rol kontrolünü denetlerken sınıf düzeyine bak

`admin.controller.ts` sınıfın tepesinde
`@Roles('ADMIN', 'SUPER_ADMIN', 'MODERATOR')` taşıyor. Metoda ayrı bir
`@Roles` yazmazsan **MODERATOR de erişir**. Üye listesi tam olarak bu
yüzden moderatöre açıktı.

Rolün veriyi kısıtlaması gerekiyorsa `select`'i koşullu yap, ucu tümden
kapatma — moderatörün listeyi görmesi gerekiyor, gerçek adı değil:

```ts
const gercekAdiGorebilir = rol === 'ADMIN' || rol === 'SUPER_ADMIN';
select: { realName: gercekAdiGorebilir, /* ... */ }
```

Arama alanlarını da daralt: göremediği alana göre arayabilmek, o alanı
tahminle okumaya yarar.

## Sunucuda üretilen sayfalar Google'a gider

İlan sayfaları SSR ve `index, follow`. Satıcı verisi hem HTML'de hem
JSON-LD yapılandırılmış verisinde yayınlanır, yani arama motoruna
girer. İlanda şehir de olduğundan "ad + şehir + ne sattığı" birleşip
kişiyi hedeflenebilir kılar.

Bu yüzden ilan/profil yanıtına kişisel bir alan eklemek, onu
**aranabilir** yapmak demektir. Frontend'de `src/lib/jsonLd.ts` ve
`ilan/[slug]/page.tsx` içindeki alanları da kontrol et.

## Giriş verisini de kontrol et

`ValidationPipe` `whitelist: true` + `forbidNonWhitelisted: true` ile
çalışıyor: DTO'da olmayan alan 400 verir. Bu iyi bir koruma ama bir
yan etkisi var — **DTO'dan alan çıkarmak yayındaki mobil sürümleri
kırar**. `displayName` bu yüzden `UpdateProfileDto`'da bırakıldı ama
serviste atılıyor.

DTO'ya `realName`, `tcKimlik` gibi bir alan eklerken, o alanı kimin
değiştirebileceğini düşün. Herkese açık görünen adın yalnızca
`PATCH /users/me/username` üzerinden değişmesinin sebebi bu: profil
formundan değişebilseydi biri oraya gerçek adını yazıp kullanıcı adı
kurallarını atlardı.

## Bitirmeden önce gerçekten ölç

Okuyarak değil, çağırarak doğrula. Yetkisiz bir jetonla ucu çağır ve
dönen anahtarları listele:

```bash
curl -s <uç> -H "Authorization: Bearer $T" \
  | python3 -c "import sys,json; d=json.load(sys.stdin); \
    print([k for k in (d[0] if isinstance(d,list) else d) \
    if k in ('passwordHash','tcKimlik','realName','phone','birthDate','googleId')])"
```

Boş liste bekliyorsun. Dolu geliyorsa `select`'i düzelt.

Bir sızıntı bulursan düzeltmeyi `motorya-deploy` düzeniyle yayına al —
kişisel veri sızıntısı, bir sonraki toplu deploy'u bekleyecek türden
bir şey değil.
