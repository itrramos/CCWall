# ---------- build stage ----------
FROM node:24-alpine AS build
WORKDIR /build

# Install all workspace dependencies (cached until manifests change).
COPY package.json package-lock.json ./
COPY server/package.json server/
COPY web/package.json web/
RUN npm ci

# Build frontend and backend.
COPY web/ web/
COPY server/ server/
RUN npm run build -w web && npm run build -w server

# Production-only dependencies for the runtime image (hoisted to root
# node_modules; the mkdir guards the COPY below when nothing is nested).
RUN npm ci --omit=dev --workspace server && mkdir -p server/node_modules

# ---------- runtime stage ----------
FROM node:24-alpine
ENV NODE_ENV=production \
    PORT=5599 \
    DATA_DIR=/app/data \
    WEB_DIST=/app/web/dist

WORKDIR /app
COPY --from=build /build/node_modules ./node_modules
COPY --from=build /build/server/node_modules ./server/node_modules
COPY --from=build /build/server/dist ./server/dist
COPY --from=build /build/server/package.json ./server/package.json
COPY --from=build /build/web/dist ./web/dist

# Persistent data (database, uploads, backups, generated session secret).
RUN mkdir -p /app/data && chown -R node:node /app
VOLUME /app/data

USER node
EXPOSE 5599

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||5599)+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "server/dist/index.js"]
