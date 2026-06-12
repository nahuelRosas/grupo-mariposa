# syntax=docker/dockerfile:1.7
#
# Build context: this Dockerfile is invoked with the *repo root* as
# context (see docker-compose.yml: context: ../ when building this
# service). That way the proto file at ../proto/library.proto is
# reachable via a normal COPY.

# ---- Stage 1: build ----
FROM node:20-alpine AS builder
RUN apk add --no-cache openssl libc6-compat
WORKDIR /app
COPY catalog-service/package.json catalog-service/package-lock.json* ./
RUN npm install --no-audit --no-fund
COPY catalog-service/tsconfig*.json catalog-service/nest-cli.json ./
COPY catalog-service/prisma ./prisma
RUN npx prisma generate
COPY catalog-service/src ./src
RUN npm run build && npm prune --omit=dev

# ---- Stage 2: runtime ----
FROM node:20-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/prisma ./prisma
# Copy the proto file so the gRPC client can load it at runtime.
# GRPC_PROTO_PATH is set to ./proto/library.proto via env_file / compose.
COPY proto/library.proto ./proto/library.proto
COPY catalog-service/docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
RUN apk add --no-cache wget openssl libc6-compat bash && \
    chmod +x /usr/local/bin/docker-entrypoint.sh
EXPOSE 3000
HEALTHCHECK --interval=10s --timeout=5s --retries=6 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3000/health || exit 1
ENTRYPOINT ["/usr/local/bin/docker-entrypoint.sh"]
CMD []
