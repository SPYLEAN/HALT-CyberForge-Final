# Build context: repository root (npm workspaces share one lockfile).
FROM node:24-slim AS deps
WORKDIR /repo
COPY package.json package-lock.json ./
COPY apps/web/package.json apps/web/
RUN npm ci -w @halt/web --include-workspace-root=false

FROM node:24-slim AS build
WORKDIR /repo
# NEXT_PUBLIC_* values are inlined at build time, so they are build arguments, not runtime environment.
ARG NEXT_PUBLIC_API_ORIGIN=http://localhost:8000
ARG NEXT_PUBLIC_WS_ORIGIN=ws://localhost:8000
ARG NEXT_PUBLIC_DEMO_MODE=simulated
ENV NEXT_PUBLIC_API_ORIGIN=$NEXT_PUBLIC_API_ORIGIN \
    NEXT_PUBLIC_WS_ORIGIN=$NEXT_PUBLIC_WS_ORIGIN \
    NEXT_PUBLIC_DEMO_MODE=$NEXT_PUBLIC_DEMO_MODE \
    NEXT_TELEMETRY_DISABLED=1
COPY --from=deps /repo/node_modules ./node_modules
COPY package.json package-lock.json ./
COPY apps/web apps/web
RUN npm run build -w @halt/web

FROM node:24-slim AS run
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=3000 HOSTNAME=0.0.0.0
COPY --from=build /repo/apps/web/.next/standalone ./
COPY --from=build /repo/apps/web/.next/static ./apps/web/.next/static
# The standalone output omits public/: brand files, 3D posters and the vendored scene scripts live there.
COPY --from=build /repo/apps/web/public ./apps/web/public
USER node
EXPOSE 3000
CMD ["node", "apps/web/server.js"]
