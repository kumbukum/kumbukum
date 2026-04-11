# syntax=docker/dockerfile:1

FROM node:lts-trixie-slim AS builderdev

ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
WORKDIR /opt/kumbukum

RUN apt-get update && \
    apt-get install -y --no-install-recommends \
    curl iputils-ping dnsutils git tini vim \
    ca-certificates && \
    npm i -g pnpm@10 && \
    npm remove -g yarn && \
    rm -rf /var/lib/apt/lists/*

FROM builderdev AS devpnpmdev
COPY --link .npmrc package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install

# BUILD
FROM builderdev
COPY --link --from=devpnpmdev /opt/kumbukum/node_modules /opt/kumbukum/node_modules

