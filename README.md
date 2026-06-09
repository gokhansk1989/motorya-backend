# 🏍️ VİTES — Backend (NestJS + Prisma)

Motosiklet ekipman pazarının arka ucudur. Emanet (escrow) durum makinesi, kimlik doğrulama, sipariş yönetimi ve anlaşmazlık çözümü içerir.

## Hızlı başlangıç

### Gereksinimler
- Node.js 20+
- Docker & Docker Compose (opsiyonel ama önerilen)

### 1. Kurulum

```bash
# Repo'yu klonla
git clone <repo> vites-backend && cd vites-backend

# Dependencies'leri yükle
npm install

# .env dosyasını oluştur
cp .env.example .env
```

### 2. Docker ile çalıştır (önerilen)

```bash
# Postgres + Redis + API başlat
docker-compose up -d

# Database migrasyonlarını çalıştır
docker-compose exec api npm run db:push

# API şimdi http://localhost:3000 adresinde çalışıyor
curl http://localhost:3000/health
```

### 3. Local'de çalıştır (Postgres+Redis manuel başlat gerekli)

```bash
# dev mode
npm run dev

# production build + start
npm run build
npm start
```

## API Endpoints

### Kimlik Doğrulama
- `POST /auth/register` — Yeni üye kaydı
- `POST /auth/login` — Giriş

### Kullanıcılar
- `GET /users/me` — Profilim (protected)
- `GET /users/:id` — Satıcı profili

### Siparişler & Emanet
- `POST /orders` — Sipariş oluştur (protected)
- `PATCH /orders/:id/transition` — Durum geçişi (protected)
- `POST /orders/:id/dispute` — Anlaşmazlık aç (protected)

### Sağlık
- `GET /health` — API durum kontrolü

## Emanet Durum Makinesi

Sipariş akışı (OrderStatus):

```
CREATED → AWAITING_PAYMENT → PAID_ESCROW → SHIPPED → DELIVERED → COMPLETED
                   ↓                           ↓           ↓            ↓
                CANCELLED                  DISPUTED ─────→ REFUNDED
```

**Kurallar:**
- Para `PAID_ESCROW`'da emanette tutuluyor.
- Anlaşmazlık (`DISPUTED`) sadece admin tarafından `COMPLETED` (serbest) veya `REFUNDED` (iade) ile çözülüyor.
- `COMPLETED` durumunda `Payout` oluşturulur ve satıcıya para geçer.
- Zaman aşımları (ödeme 30 dk, kargolaması 3 gün, teslim onayı 3 gün) otomatik işler (BullMQ) ile tetiklenir.

Detaylı implementasyon: `src/modules/orders/orders.service.ts`

## Veri Modeli

Tam Prisma şeması: `/prisma/schema.prisma` (veya repo root'ta).

**Temel tablolar:**
- `User` — Üyeler, doğrulama durumları
- `Listing` — İlanlar
- `Order` — Siparişler + emanet durumları
- `Payment` — POS işlemleri
- `Review` — Çift yönlü yorumlar
- `Dispute` — Anlaşmazlık kayıtları
- `Payout` — Satıcıya aktarımlar
- `Subscription` — Üyelik planları

## Geliştirme

### Yeni endpoint eklemek

1. `src/modules/<feature>/<feature>.controller.ts` — route
2. `src/modules/<feature>/<feature>.service.ts` — logic
3. DTOs: `src/modules/<feature>/dto/`
4. Module'ü `src/app.module.ts`'de import et

### Database değişiklikleri

```bash
# schema.prisma'yı düzenle
# Ardından:
npm run db:push          # dev
npm run db:migrate       # prod (migration oluştur)
```

## Testing (ilerde)

```bash
npm run test
npm run test:e2e
```

## Deployment

### Docker ile

```bash
docker build -t vites-api:latest .
docker run -p 3000:3000 --env-file .env vites-api:latest
```

### AWS EC2'ye

```bash
# docker-compose.yml'yi sunucuya kopyala
scp docker-compose.yml user@ec2:/app/

# SSH ile bağlan ve başlat
ssh user@ec2
cd /app
docker-compose up -d
```

## Sonraki Adımlar

- [ ] Ödeme webhook'ları (iyzico/PayTR entegrasyonu)
- [ ] Push notification sistemi (FCM/APNs)
- [ ] Arama/filtreleme (Meilisearch)
- [ ] Görsel depolama (S3 integration)
- [ ] Admin dashboard backend endpoints
- [ ] Unit + E2E test'leri
- [ ] Rate limiting & CORS ince ayarı
- [ ] Audit logging

## Destek

Issues: GitHub Issues tab'ında.
