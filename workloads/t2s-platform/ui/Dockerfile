# syntax=docker/dockerfile:1.7
# Multi-stage build: deps → build → tiny runtime.
# Final image runs as non-root with the standalone Next.js server only.

# ---------- deps ----------
FROM node:20-alpine AS deps
WORKDIR /app
COPY package.json ./
# package-lock.json is committed in real deployments; for the demo we npm install
RUN npm install --omit=dev=false --no-audit --no-fund

# ---------- build ----------
FROM node:20-alpine AS build
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

# ---------- runtime ----------
FROM node:20-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

# non-root user (uid 10001 matches the Pod securityContext)
RUN addgroup -S t2s -g 10001 && adduser -S t2s -G t2s -u 10001

COPY --from=build --chown=t2s:t2s /app/.next/standalone ./
COPY --from=build --chown=t2s:t2s /app/.next/static ./.next/static
COPY --from=build --chown=t2s:t2s /app/public ./public

USER 10001:10001
EXPOSE 3000
CMD ["node", "server.js"]
