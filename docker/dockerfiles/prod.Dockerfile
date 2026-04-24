# syntax=docker/dockerfile:1

# ──────────────────────────────────────────────
# Stage 1: Base image with system tools & pnpm
# ──────────────────────────────────────────────
FROM node:lts-trixie-slim AS builder

ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
ENV PLAYWRIGHT_BROWSERS_PATH="/ms-playwright"
WORKDIR /opt/kumbukum

RUN apt-get update && \
    apt-get install -y --no-install-recommends \
    curl iputils-ping dnsutils git tini vim procps \
    ca-certificates && \
    npm i -g pnpm@10 && \
    npm remove -g yarn && \
    rm -rf /var/lib/apt/lists/*

# ──────────────────────────────────────────────
# Stage 2: Install ALL deps (dev included for esbuild)
# ──────────────────────────────────────────────
FROM builder AS deps

COPY --link .npmrc package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY --link apps/mcp/package.json ./apps/mcp/
COPY --link docs/package.json ./docs/
RUN pnpm install

# ──────────────────────────────────────────────
# Stage 3: Build frontend assets + VitePress docs
# ──────────────────────────────────────────────
FROM deps AS build

ARG APP_VERSION=latest
ENV VITEPRESS_VERSION=$APP_VERSION

COPY --link . .
RUN NODE_ENV=production node build.js
RUN node docs/scripts/export-openapi.js && pnpm --filter @kumbukum/docs exec vitepress build

# ──────────────────────────────────────────────
# Stage 4: Production image (prod deps only)
# ──────────────────────────────────────────────
FROM builder AS production

COPY --link .npmrc package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY --link apps/mcp/package.json ./apps/mcp/
COPY --link docs/package.json ./docs/
RUN pnpm install --prod
RUN mkdir -p /ms-playwright && chmod 755 /ms-playwright
RUN pnpm exec playwright install --with-deps chromium
RUN chown -R node:node /ms-playwright

COPY --link . .

# Overwrite with built assets from stage 3
COPY --link --from=build /opt/kumbukum/public/js/vendor.js ./public/js/vendor.js
COPY --link --from=build /opt/kumbukum/public/js/editor.js ./public/js/editor.js
COPY --link --from=build /opt/kumbukum/public/js/graph_bundle.js ./public/js/graph_bundle.js
COPY --link --from=build /opt/kumbukum/public/css/vendor.css ./public/css/vendor.css
COPY --link --from=build /opt/kumbukum/public/css/Phosphor-Light-*.woff2 ./public/css/
COPY --link --from=build /opt/kumbukum/public/build-id ./public/build-id
COPY --link --from=build /opt/kumbukum/docs/.vitepress/dist ./docs-dist

USER node
EXPOSE 3000

ENTRYPOINT ["tini", "--"]
CMD ["npm", "start"]
