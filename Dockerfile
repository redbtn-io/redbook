# syntax=docker/dockerfile:1

# ---------- deps ----------
FROM node:24-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json .npmrc ./
# NODE_ENV is deliberately NOT set to production here: `npm ci` must install
# devDependencies for the build stage to compile. Setting it (or setting it in
# the RedRun appConfig, which leaks into the build) breaks `next build`.
#
# @redbtn/* are private packages on registry.redbtn.io. The committed .npmrc
# maps the scope to that registry but carries NO credential; the token is
# supplied only at build time as a BuildKit secret mount (id "npmrc"), backed
# by the global NPMRC redsecret RedRun injects into every git-source build. It
# never lands in an image layer, runtime env, or docker history — the mount
# shadows /app/.npmrc for the duration of this RUN only. The _BUILD_SECRET_NPMRC
# build-arg is the fallback for a non-BuildKit builder.
ARG _BUILD_SECRET_NPMRC
RUN --mount=type=secret,id=npmrc,target=/tmp/npmrc-secret \
    if [ -s /tmp/npmrc-secret ]; then \
      cp /tmp/npmrc-secret .npmrc; \
    elif [ -n "$_BUILD_SECRET_NPMRC" ]; then \
      printf '%s' "$_BUILD_SECRET_NPMRC" > .npmrc; \
    fi && \
    npm ci --ignore-scripts --no-audit --no-fund && \
    printf '@redbtn:registry=https://registry.redbtn.io/\n' > .npmrc

# ---------- builder ----------
FROM node:24-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build

# ---------- runner ----------
FROM node:24-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

RUN addgroup --system --gid 1001 nodejs \
  && adduser --system --uid 1001 nextjs

COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

USER nextjs
EXPOSE 3000

# /healthz reports unhealthy until Mongo and JWT_SECRET are both usable, which
# is exactly the condition under which this container should not take traffic.
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "server.js"]
