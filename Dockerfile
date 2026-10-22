FROM node:20-alpine AS builder

WORKDIR /app

RUN apk add --no-cache openssl

COPY package*.json ./
COPY prisma ./prisma/

# npm ci: lock dosyasindaki surumleri aynen kurar, yeniden cozmez.
RUN npm ci --no-audit --no-fund --legacy-peer-deps
RUN npx prisma generate

COPY . .

RUN npm run build
RUN npx tsc -p tsconfig.seed.json
RUN npm prune --omit=dev --legacy-peer-deps && npm cache clean --force


FROM node:20-alpine

WORKDIR /app

# Paylasim kartindaki yazilar sharp/librsvg ile ciziliyor; imajda hic font
# olmadigi icin metinler bos cikiyordu. Saira SIL OFL lisanslidir.
# ── HEIC/HEVC cozucusu ───────────────────────────────────────────────
#
# sharp'in hazir ikilisi kendi libvips'ini gomulu getiriyor ve o libvips
# HEVC kod cozucusu OLMADAN derlenmis (patent/lisans). iPhone'dan gelen
# .HEIC dosyalarinda `metadata()` kabi okudugu icin basariyla donuyor,
# piksel cozumu ise patliyordu; kullaniciya "dosyan bozuk" deniyordu.
#
# sharp'i sistem libvips'ine karsi derlemek denendi: 0.35 sürümü
# @img/sharp-libvips-* hazir paketini tercih ettigi icin
# SHARP_FORCE_GLOBAL_LIBVIPS ve --build-from-source bayraklari ise
# yaramadi. Ustelik o yol libvips surumunu degistirecegi icin paylasim
# karti (rsvg) ve AVIF yollarini da riske atiyordu.
#
# Bunun yerine YALNIZCA HEIC icin ayri bir cozucu: libheif-tools.
# 455 KiB, sharp'a hic dokunmuyor, derleme suresini uzatmiyor.
# Gercek bir 4032x3024 iPhone dosyasiyla dogrulandi (2026-10-22):
# 5,42 MB HEIC -> JPEG, 1,35 sn.
RUN apk add --no-cache dumb-init openssl fontconfig libheif-tools
COPY assets/fonts/*.ttf /usr/share/fonts/truetype/
RUN fc-cache -f
# Paylasim kartinda kullanilan logo. Calisma imajina kopyalanmadigi icin
# kart logosuz uretiliyordu; builder asamasindaki dosyalar buraya gelmiyor.
COPY assets/marka /app/assets/marka

COPY package*.json ./
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/dist-seed ./dist-seed
COPY --from=builder /app/prisma ./prisma
COPY docker-entrypoint.sh /docker-entrypoint.sh
RUN chmod +x /docker-entrypoint.sh

EXPOSE 3000

ENTRYPOINT ["dumb-init", "--", "/docker-entrypoint.sh"]
