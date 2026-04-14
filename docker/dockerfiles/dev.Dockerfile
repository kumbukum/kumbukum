# syntax=docker/dockerfile:1

FROM node:lts-trixie-slim

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

ENTRYPOINT ["tini", "--"]
