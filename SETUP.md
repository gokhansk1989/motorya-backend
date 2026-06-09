# 🚀 VİTES Backend — Kurulum & Çalıştırma Rehberi

## İçindekiler
1. [Hızlı Başlangıç (Docker)](#docker)
2. [Local Kurulum](#local)
3. [Veritabanı Migrasyonları](#migrations)
4. [API Test Etme](#testing)
5. [Sorun Giderme](#troubleshooting)

---

## Docker ile Başlangıç (Önerilen) {#docker}

### Gereksinimler
- Docker Desktop (Mac/Windows) veya Docker Engine (Linux)
- Docker Compose

### Kurulum

```bash
# 1. Repo'yu klonla
git clone <repo> vites-backend
cd vites-backend

# 2. .env dosyasını oluştur
cp .env.example .env

# 3. Docker container'ları başlat
docker-compose up -d

# 4. Logları takip et (optional)
docker-compose logs -f api
```

Container'lar başlatıldığında:
- **PostgreSQL**: `localhost:5432` (vites / dev-password)
- **Redis**: `localhost:6379`
- **API**: `http://localhost:3000`

### Veritabanı Kurulumu (Docker)

```bash
# Database'i oluştur ve migrasyonları çalıştır
docker-compose exec api npm run db:push

# Test verisini yükle
docker-compose exec api npm run db:seed

# CTRL+C ile logları kapat (container'lar çalışmaya devam eder)
```

### API'yi Test Et

```bash
# Health check
curl http://localhost:3000/health

# Register (yeni kullanıcı)
curl -X POST http://localhost:3000/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test@example.com",
    "password": "testpassword123",
    "displayName": "Test User"
  }'

# Login
curl -X POST http://localhost:3000/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test@example.com",
    "password": "testpassword123"
  }'

# Profili getir (JWT token gerekli)
curl -H "Authorization: Bearer YOUR_TOKEN_HERE" \
  http://localhost:3000/users/me
```

### Container'ları Durdur/Yeniden Başlat

```bash
# Durdurmak
docker-compose down

# Verileri de silmek (fresh start)
docker-compose down -v

# Yeniden başlatmak
docker-compose up -d
```

---

## Local Kurulum (Manual) {#local}

Eğer Docker kullanmak istemiyorsan:

### Gereksinimler
- Node.js 20+
- PostgreSQL 16+
- Redis 7+

### Adım Adım

```bash
# 1. Klonla
git clone <repo> vites-backend
cd vites-backend

# 2. Dependencies
npm install

# 3. .env dosyasını düzenle (Postgres+Redis konumlarını doğru yazmalıdır)
cp .env.example .env
# Vi/nano ile .env'i aç ve DATABASE_URL, REDIS_URL'i lokalerine göre ayarla

# 4. Database'i oluştur (Postgres zaten çalışıyor olmalı)
npm run db:push

# 5. Test verisi yükle
npm run db:seed

# 6. Development mode başlat
npm run dev
```

API `http://localhost:3000`'de çalışacaktır.

---

## Veritabanı Migrasyonları {#migrations}

### Schema Değişti mi?

1. **prisma/schema.prisma** dosyasını düzenle
2. Migrasyonu oluştur:
   ```bash
   # Docker
   docker-compose exec api npx prisma migrate dev --name <migration_name>
   
   # Local
   npx prisma migrate dev --name <migration_name>
   ```
3. Otomatik `prisma/migrations/` klasörüne kaydedilir

### Veritabanını Sıfırla (dev/test ortamında)

```bash
# Docker
docker-compose exec api npx prisma migrate reset

# Local
npx prisma migrate reset
```

**Uyarı**: Canlı ortamda asla reset yapma!

---

## API Test Etme {#testing}

### REST Client Araçları

**cURL:**
```bash
curl -X POST http://localhost:3000/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"ahmet@example.com","password":"password123"}'
```

**Insomnia/Postman:**
1. Environment değişkenleri oluştur:
   - `base_url` = `http://localhost:3000`
   - `token` = Login yanıtındaki `accessToken`
2. Requests'leri import et (aşağıdaki collection)

### Örnek API Requests

**Kaydol:**
```
POST /auth/register
Content-Type: application/json

{
  "email": "yeni@example.com",
  "password": "securePassword123",
  "displayName": "Yeni Kullanıcı"
}
```

**Giriş Yap:**
```
POST /auth/login
Content-Type: application/json

{
  "email": "ahmet@example.com",
  "password": "password123"
}
```

**Profilimi Getir:**
```
GET /users/me
Authorization: Bearer <your_token>
```

**Satıcı Profili Getir:**
```
GET /users/<seller_id>
```

**Sipariş Oluştur:**
```
POST /orders
Authorization: Bearer <your_token>
Content-Type: application/json

{
  "listingId": "listing-1",
  "sellerId": "seller_user_id",
  "amount": "7250",
  "commissionRate": "0.08"
}
```

---

## Sorun Giderme {#troubleshooting}

### "Port 5432 zaten kullanımda"

```bash
# Mevcut Postgres process'ini kapat
# macOS
lsof -i :5432 | grep -v PID | awk '{print $2}' | xargs kill -9

# Linux
sudo lsof -i :5432 | grep -v PID | awk '{print $2}' | xargs sudo kill -9
```

Veya Docker Compose yeniden başlat:
```bash
docker-compose restart postgres
```

### "Connection refused: localhost:5432"

Database'in çalışıp çalışmadığını kontrol et:
```bash
# Docker
docker-compose ps postgres

# Local (Postgres servisini kontrol et)
systemctl status postgresql  # Linux
brew services list            # macOS
```

### "ENOSPC: no space left on device"

Docker disk alanını kullan etmek. Temizle:
```bash
docker system prune -a
```

### API hata veriyor: "Unauthorized"

- JWT token'ı doğru mu gönderiyorsun?
- Token süresi doldu mu? (`JWT_EXPIRATION=24h`)
- `Authorization: Bearer <token>` formatını kontrol et

### Test data yüklenmedi

```bash
docker-compose exec api npm run db:seed
```

---

## Sonraki Adımlar

- [ ] Postman/Insomnia collection'ı oluştur (share etmek için)
- [ ] E2E test'leri yaz
- [ ] Payment webhook'larını test et
- [ ] Load testing (ab, wrk, k6 ile)
- [ ] Production ortamında çalıştırma

---

## İletişim & Yardım

Sorunlarla karşılaştıysan:
1. Logları kontrol et: `docker-compose logs api`
2. `.env` dosyasını doğrula
3. Issues tab'ında konu aç
