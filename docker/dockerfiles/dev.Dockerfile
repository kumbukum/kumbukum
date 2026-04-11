# syntax=docker/dockerfile:1

FROM node:lts-trixie-slim AS builderdev

ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
WORKDIR /opt/kumbukum

RUN corepack enable && corepack prepare pnpm@latest --activate

FROM builderdev AS devpnpmdev
COPY --link .npmrc package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install

# BUILD
FROM builderdev
COPY --link --from=devpnpmdev /opt/kumbukum/node_modules /opt/kumbukum/node_modules


