FROM node:20-alpine AS builder

WORKDIR /app

RUN apk add --no-cache openssl

COPY package*.json ./
COPY prisma ./prisma/

RUN npm install --no-audit --no-fund
RUN npx prisma generate

COPY . .

RUN npm run build
RUN npm prune --omit=dev && npm cache clean --force


FROM node:20-alpine

WORKDIR /app

RUN apk add --no-cache dumb-init openssl

COPY package*.json ./
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/prisma ./prisma

EXPOSE 3000

ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "dist/main.js"]
