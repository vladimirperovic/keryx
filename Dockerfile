# ──────────────────────────────────────────────
# Stage 1 – Build
# ──────────────────────────────────────────────
FROM node:20-alpine AS builder

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY tsconfig.json ./
COPY src ./src

RUN npm run build

# ──────────────────────────────────────────────
# Stage 2 – Production
# ──────────────────────────────────────────────
FROM node:20-alpine

ENV NODE_ENV=production
WORKDIR /app

COPY package*.json ./
RUN npm ci --omit=dev && \
    apk add --no-cache curl

COPY --from=builder /app/dist ./dist
COPY public ./public

USER node

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --retries=3 \
  CMD curl -f http://localhost:3000/healthz || exit 1

CMD ["node", "dist/index.js"]
