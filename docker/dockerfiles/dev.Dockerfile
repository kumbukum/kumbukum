# syntax=docker/dockerfile:1

FROM node:lts-trixie-slim

ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable

WORKDIR /opt/streamient

RUN apt-get update && \
    apt-get install -y --no-install-recommends \
    curl iputils-ping dnsutils git tini vim procps \
    ca-certificates && \
    rm -rf /var/lib/apt/lists/*

ENTRYPOINT ["tini", "--"]
