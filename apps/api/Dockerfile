# syntax=docker/dockerfile:1.7
#
# The API, ready to run on any machine with Docker.
#
# Built from the repository root — the API consumes the workspace packages as
# built output, so the whole workspace is the build context:
#
#   docker build -f apps/api/Dockerfile -t chequeflow-api .
#
# Only the API and the packages it depends on are installed; the phone app's
# dependencies, which are most of the lockfile, never enter the image.

ARG NODE_VERSION=24.20.0

FROM node:${NODE_VERSION}-bookworm-slim AS build
WORKDIR /repo
# argon2 ships prebuilt binaries, but a platform without one compiles from
# source; the tools are here so that never fails the build.
RUN apt-get update \
 && apt-get install -y --no-install-recommends python3 make g++ openssl ca-certificates \
 && rm -rf /var/lib/apt/lists/*
RUN corepack enable && corepack prepare pnpm@10.15.0 --activate

COPY . .
RUN pnpm install --frozen-lockfile --filter "@cheque-flow/api..."
RUN pnpm --filter "@cheque-flow/api..." build

# ──────────────────────────────────────────────────────────────────────────
FROM node:${NODE_VERSION}-bookworm-slim AS runtime
WORKDIR /repo
# No package manager here: migrations and the bootstrap call their binaries
# directly, and a non-root user would otherwise try to download pnpm at start.
# OpenSSL is not optional: Prisma's migration engine links against it, and on
# a slim image without it Prisma guesses a version and warns — it happened to
# guess right once, which is not the same as working.
RUN apt-get update \
 && apt-get install -y --no-install-recommends openssl ca-certificates \
 && rm -rf /var/lib/apt/lists/*
ENV NODE_ENV=production

# Built output and the installed dependencies it needs, nothing else of the
# build stage's toolchain.
COPY --from=build --chown=node:node /repo /repo

# Never as root: a compromise of the process should not be a compromise of
# the container.
USER node
WORKDIR /repo/apps/api
EXPOSE 3333

# Answers on the same health route the deployment's proxy and CI check.
HEALTHCHECK --interval=15s --timeout=5s --start-period=40s --retries=5 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.API_PORT||3333)+'/api/v1/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "dist/main.js"]
