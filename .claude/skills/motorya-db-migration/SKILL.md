---
name: motorya-db-migration
description: Motorya'da Prisma şeması (prisma/schema.prisma) değiştiğinde veritabanını güncelleme düzeni. Bu projede `prisma migrate` KULLANILMIYOR — kolonlar sunucuda elle SQL ile açılır ve sıra yanlış olursa API tümden düşer. Modele alan eklerken/çıkarırken, yeni bir model eklerken, bir alanı zorunlu yaparken ya da kullanıcı "veritabanına kolon ekle", "şemayı güncelle", "migration" dediğinde bu skill'i kullan. Şemaya dokunan her değişiklikte, küçük görünse bile uygula.
---

# Motorya veritabanı değişiklik düzeni

## Önce bunu bil: `prisma migrate` yok

`Dockerfile` yalnızca `npx prisma generate` çalıştırır. CI'da da,
sunucuda da migration uygulayan hiçbir adım yok. Yani **şemayı
değiştirmek veritabanını değiştirmez**. `schema.prisma`'ya alan ekleyip
deploy edersen Prisma olmayan bir kolonu `select` eder ve uygulama
açılışta ya da ilk sorguda patlar — tek bir sayfa değil, **API'nin
tamamı**.

Bağlantı:

```bash
ssh ubuntu@78.47.227.132 "sudo -u postgres psql -d vites -c '<SQL>'"
```

Veritabanı adı **`vites`** (`motorya` değil — bu bir kez "database does
not exist" hatasına yol açtı). Postgres sistemde kurulu, Docker'da değil.

## Sıra, değişikliğin türüne göre belirlenir

Kural tek cümle: **eski kod da yeni kod da aynı anda çalışabilmeli.**
Deploy anında ikisi bir arada bulunur.

### Eklemeli değişiklik → önce VERİTABANI, sonra kod

Yeni kolon (nullable ya da `DEFAULT`'lu), yeni tablo, yeni index.
Eski kod bu kolonu tanımaz ama varlığı onu rahatsız etmez.

```sql
ALTER TABLE "BlogPost" ADD COLUMN IF NOT EXISTS "viewCount" INTEGER NOT NULL DEFAULT 0;
```

`IF NOT EXISTS` şart: betik yeniden koşarsa patlamasın. Bu düzen
`realName` ve `viewCount` için tam olarak böyle uygulandı ve deploy
sırasında hiç kesinti olmadı.

### Bozucu değişiklik → önce KOD, sonra veritabanı

Kolon silme, yeniden adlandırma, `NOT NULL` yapma, tip daraltma.
Önce kolonu kullanmayı bırakan kodu yayına al, **sonra** kolonu kaldır.
Ters sırada eski kod hâlâ ayakta ve olmayan kolonu okuyor olur.

Yeniden adlandırma tek adımda yapılmaz; üç deploy ister: yeni kolonu
ekle → iki kolonu da yaz, yeniden okumaya geç → eskiyi düşür.

## Veri taşıma betikleri

Mevcut satırları doldurmak gerekiyorsa betiği `prisma/migrations/*.js`
altına koy (örnek: `add_username.js`) ve repoya commit et. Sunucuda
yazılan tek kullanımlık betik, ne yapıldığının kaydını bırakmaz.

Betikler **yeniden koşulabilir** olmalı. `add_username.js`'teki desen:

```js
// Tekrar kosarsa uzerine yazmaz
`UPDATE "User" SET "realName" = "displayName" WHERE "realName" IS NULL;`
```

Koşulsuz bir `UPDATE`, kullanıcı adını değiştirmiş birinin gerçek adını
ezerdi — geri dönülemez.

## Bozucu değişiklikten önce yedek al

Günlük yedek zaten var (`/home/ubuntu/pg-backup.sh`, `ubuntu` kullanıcısının
cron'unda 03:00, `/var/backups/postgres`, 14 gün; repodaki kopyası
`deploy/pg-backup.sh`). Ama kolon silmeden ya da toplu `UPDATE` çalıştırmadan önce
taze bir yedek al — en kötü an, son yedeğin 20 saat öncesine ait olduğu
andır.

```bash
ssh ubuntu@78.47.227.132 "/home/ubuntu/pg-backup.sh"
```

Yedekler veritabanıyla **aynı makinede**. Makine tümden kaybolursa
yedek de gider (kullanıcı dış yedeği şimdilik istemedi). Bunu geri
yükleme gerektiren bir konuşmada hatırlat.

## Uyguladıktan sonra doğrula

Kolonun gerçekten açıldığını gör — `ALTER TABLE` çıktısını okumak
yetmez, yanlış veritabanına bağlanmış olabilirsin:

```bash
ssh ubuntu@78.47.227.132 "sudo -u postgres psql -d vites -c '\d \"BlogPost\"'" | grep viewCount
```

Deploy'dan sonra da ucu canlıda çağırıp alanın döndüğünü doğrula.
Sonra `motorya-deploy` düzenine dön.

## Uzun vade

Bu elle düzen ilk unutulduğunda canlıyı kırar. `prisma migrate`'e geçiş
konuşulmaya değer; kullanıcı bunu gündeme getirirse mevcut şemadan bir
baseline migration üretmek gerekeceğini söyle.
