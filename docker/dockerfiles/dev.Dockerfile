# syntax=docker/dockerfile:1

FROM node:lts-trixie-slim

ARG PNPM_VERSION=12
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN npm install --global pnpm@${PNPM_VERSION}

WORKDIR /opt/streamient

RUN apt-get update && \
    apt-get install -y --no-install-recommends \
    curl iputils-ping dnsutils git tini vim procps poppler-utils \
    ca-certificates && \
    rm -rf /var/lib/apt/lists/*

ENTRYPOINT ["tini", "--"]
