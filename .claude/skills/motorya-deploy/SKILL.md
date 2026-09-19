---
name: motorya-deploy
description: Motorya'nın dört deposundan (backend, frontend, admin, mobile) herhangi birinde yapılan kod değişikliğini canlıya alma düzeni. Kullanıcı "deploy et", "canlıya al", "yayınla", "sunucuya at", "push'la" dediğinde ya da bir düzeltmeyi/özelliği bitirip canlıda görmesi gerektiğinde bu skill'i kullan. Deploy'un başarılı olduğunu bildirmeden önce de kullan — doğru CI koşusunu beklemenin ve canlıda doğrulamanın yolu burada. Kullanıcı deploy kelimesini hiç kullanmasa bile, kod değişikliği canlıya gidecekse bu düzeni uygula.
---

# Motorya deploy düzeni

## Değişmez sıra: local > github > sunucu

Kullanıcının koyduğu kural bu ve bozulmamalı. Sunucudaki dosyayı elle
düzenlemek, git'i atlamak ya da `--no-verify` ile pre-commit kancasını
geçmek yok. Sebebi somut: taşınma sırasında `pg-backup.sh`, nginx ve pm2
yapılandırması **tam olarak** repoda olmadıkları için geride kalmıştı.
Sunucuda elle oluşturduğun her dosya bir sonraki taşımada kaybolur.

## Depolar

| Depo | Dal | Sunucuya nasıl gider | Canlı |
|---|---|---|---|
| `~/Downloads/motorya-backend` | `main` | sunucuda `git pull` + `docker compose build api` | api.motorya.com.tr (:3000) |
| `~/Downloads/motorya-frontend` | `main` | CI'da build, `rsync` + pm2 restart | motorya.com.tr (:3001) |
| `~/Downloads/motorya-admin` | `main` | CI'da build, `rsync` + pm2 restart | admin.motorya.com.tr (:3002) |
| `~/Downloads/motorya-mobile` | **`master`** | CI yok, mağaza sürümü | — |

Mobile'ın dalı `master`. `git push origin main` hata verir — `HEAD`
kullan. Bu bir kez zaman kaybettirdi.

## Adımlar

### 1. Yerelde üretim derlemesi

Her zaman, "küçük değişiklik" olsa bile. CI'da patlayan bir derleme
turu ~4 dakika, yerelde ~40 saniye.

```bash
cd ~/Downloads/<depo> && npm run build     # frontend / admin
cd ~/Downloads/motorya-backend && npx tsc --noEmit   # backend
```

Prisma şemasına dokunduysan önce `npx prisma generate`, yoksa `tsc`
eski istemciyi görür ve yanlış hata verir.

### 2. Commit ve push

Commit mesajı Türkçe, konvansiyonel önek (`fix:`, `feat:`, `chore:`).
Gövdede **neden** yazılır, ne yapıldığı diff'te zaten var.

Aynı anda birden fazla depoyu push'luyorsan sırayı **backend önce**
yap: frontend/admin yeni bir uca bağlıysa, uç hazır olmadan yayına
çıkarsa arada kalan sürede 404 alır.

### 3. CI'ı SHA ile bekle — koşu listesinin başına bakma

Bu oturumda iki kez en son koşuya bakıp "deploy başarılı" dedim; ikisi
de **bir önceki** commit'in koşusuydu. Birinde bundan "deploy'lar yeni
kodu uygulamıyor" gibi tamamen yanlış bir sonuca vardım. Yeni koşu
kaydolana kadar liste eski koşuyu gösteriyor.

Koşuyu daima commit SHA'sıyla eşleştir:

```bash
cd ~/Downloads/<depo>; sha=$(git rev-parse HEAD)
until s=$(gh run list --limit 5 --json headSha,status,conclusion \
    -q ".[] | select(.headSha==\"$sha\") | \"\(.status) \(.conclusion)\"" 2>/dev/null); \
    [ -n "$s" ] && [ "${s%% *}" = "completed" ]; do sleep 15; done
echo "$s"
```

`-n "$s"` kontrolü önemli: koşu henüz kaydolmadıysa çıktı boş gelir ve
onu "bitti" saymak tam da yukarıdaki hataya yol açar.

Birden fazla depo varsa hepsini aynı döngüde bekle, `run_in_background`
ile arka plana al.

### 4. Canlıda doğrula — "CI yeşil" doğrulama değildir

CI yeşil olması kodun derlendiğini gösterir, doğru çalıştığını değil.
Değişikliğin türüne göre gerçekten ölç:

- **API değişikliği** → `curl` ile ucu çağır, dönen alanları kontrol et.
  Kimlik gerekiyorsa `POST /auth/login` ile jeton al (kimlik bilgileri
  asla diske yazılmaz, komut içinde inline kullan).
- **Sayfa/CSS değişikliği** → tarayıcı panelinde aç ve ölç. Ekran
  görüntüsüne bakıp "düzelmiş görünüyor" deme; `motorya-verify`
  düzenindeki gibi `elementFromPoint`/`getComputedStyle` ile kanıtla.
- **Şema değişikliği** → `motorya-db-migration` skill'ine bak; kolonun
  koddan **önce** açılmış olması gerekir.

Doğrulama başarısızsa bunu açıkça söyle. "Deploy geçti" demek, iş
çalışıyor demek değil.

## Geri alma

Cloudflare'de A kaydını değiştirmek saniyeler sürer ama bu sunucu
değişimi içindir. Kod için: sorunlu commit'i `git revert` edip aynı
düzenden geçir. Sunucuda elle dosya düzeltme yok — bir sonraki deploy
onu ezer ve neden bozulduğu anlaşılmaz.
