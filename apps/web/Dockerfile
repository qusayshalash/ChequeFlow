# syntax=docker/dockerfile:1.7
#
# The dashboard, ready to run on any machine with Docker.
#
# Built from the repository root:
#
#   docker build -f apps/web/Dockerfile \
#     --build-arg NEXT_PUBLIC_API_URL=https://cheques.example.com/api/v1 \
#     -t chequeflow-web .
#
# The API's address is a build argument, not a runtime setting, because
# Next.js writes `NEXT_PUBLIC_*` values into the JavaScript it sends to the
# browser at build time. Without it the dashboard guesses the API from its own
# hostname and port 3333 — right in development, wrong behind HTTPS on 443.

ARG NODE_VERSION=24.20.0

FROM node:${NODE_VERSION}-bookworm-slim AS build
WORKDIR /repo
RUN corepack enable && corepack prepare pnpm@10.15.0 --activate

ARG NEXT_PUBLIC_API_URL
ARG NEXT_PUBLIC_DEFAULT_LOCALE=ar
ENV NEXT_PUBLIC_API_URL=${NEXT_PUBLIC_API_URL} \
    NEXT_PUBLIC_DEFAULT_LOCALE=${NEXT_PUBLIC_DEFAULT_LOCALE} \
    NEXT_TELEMETRY_DISABLED=1

COPY . .
RUN test -n "$NEXT_PUBLIC_API_URL" \
 || (echo "NEXT_PUBLIC_API_URL must be set at build time" >&2 && exit 1)
RUN pnpm install --frozen-lockfile --filter "@cheque-flow/web..."
RUN pnpm --filter "@cheque-flow/web..." build

# ──────────────────────────────────────────────────────────────────────────
FROM node:${NODE_VERSION}-bookworm-slim AS runtime
WORKDIR /repo
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1
COPY --from=build --chown=node:node /repo /repo

USER node
WORKDIR /repo/apps/web
EXPOSE 3000

HEALTHCHECK --interval=15s --timeout=5s --start-period=30s --retries=5 \
  CMD node -e "fetch('http://127.0.0.1:3000/login').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

# Bound to every interface: inside a container, localhost is only the
# container itself, and the proxy in front of it is elsewhere.
CMD ["/repo/node_modules/.bin/next", "start", "--port", "3000", "--hostname", "0.0.0.0"]
