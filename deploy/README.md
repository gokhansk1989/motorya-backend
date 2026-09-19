# Sunucu yapılandırması

Buradaki dosyalar sunucuda elle oluşturulmuştu ve hiçbir repoda yoktu.
Sunucu değişirse sıfırdan yazmak yerine buradan kopyalanır.

| dosya | sunucudaki yeri |
|---|---|
| `nginx-motorya.conf` | `/etc/nginx/sites-available/motorya` (`sites-enabled/motorya` buna symlink) |
| `ecosystem.config.js` | `~/ecosystem.config.js` (pm2: frontend 3001, admin 3002) |

Backend 3000 portunda Docker Compose ile çalışıyor (`docker-compose.yml` repo kökünde).

## Git'e giremeyecekler — taşımada elle götürülmesi gerekenler

Aşağıdakiler sır içerdiği veya veri olduğu için repoda tutulmuyor.
Liste burada duruyor ki taşımada ne eksik olduğu bilinsin.

**1. Veritabanı — aynı makinede, Docker'da DEĞİL.**
Postgres 16 sisteme kurulu; `DATABASE_URL` Docker köprüsü üzerinden
(`172.17.0.1:5432`) ona bağlanıyor. Veritabanının adı **`vites`** —
projenin eski adı; yeniden adlandırmak kesinti gerektirdiği için
ertelendi. Aynı sunucuda `ortamnasil` veritabanı da var, yedek alırken
hangisini aldığını teyit et (`deploy/pg-backup.sh` ikisini de alır).

Not: AWS döneminde veritabanı ayrı bir makinedeydi ve `motorya_postgres`
adlı bir konteynerde çalışıyordu. Bu artık geçerli değil.

**2. Yüklenen görseller** — `motorya-backend_uploads_data` Docker volume'ünde
(`/app/uploads`). S3'te değil; volume kopyalanmazsa tüm ilan görselleri gider.

**3. `.env` dosyaları** — backend `~/motorya-backend/.env`, ayrıca frontend ve
admin'in `.env.production` dosyaları. Backend'deki anahtarlar:

```
NODE_ENV DB_NAME DB_USER DB_PASSWORD JWT_SECRET DATABASE_URL
MEILI_MASTER_KEY MESSAGE_MASTER_KEY
GOOGLE_CLIENT_ID GOOGLE_CLIENT_SECRET GOOGLE_CALLBACK_URL
FRONTEND_URL VAPID_PUBLIC_KEY VAPID_PRIVATE_KEY VAPID_EMAIL
RESEND_API_KEY TURNSTILE_SECRET SENTRY_DSN FIREBASE_SERVICE_ACCOUNT_JSON
```

`MESSAGE_MASTER_KEY` kaybolursa şifreli mesajlar bir daha okunamaz —
yeniden üretilemez, mutlaka taşınmalı.

**4. Meilisearch verisi** — `motorya-backend_meili_data`. Taşınmasa da olur ama
o zaman yeni sunucuda reindex gerekir, yoksa arama boş döner.

**5. Let's Encrypt sertifikaları** — `/etc/letsencrypt/`. Yeni sunucuda certbot
ile yeniden alınabilir; DNS yeni IP'ye döndükten sonra yapılmalı.

**6. GitHub Actions secrets** — üç repoda da `EC2_HOST`, `EC2_USER`,
`EC2_SSH_KEY`. Güncellenmezse deploy eski sunucuya gitmeye devam eder.
