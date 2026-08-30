import cachePackage from "@managani/cache";
import config from "../config.js";
import mongoose from "../db.js";
import { createLogger } from "./logger.js";

const { createCache, createMongoCoordinator, createRateLimitStore } =
  cachePackage;
const log = createLogger("cache");
const workerMode = (process.env.SERVER_MODE || "app") !== "app";
const cache = createCache({
  servers: config.memcachedServers,
  namespace: `${process.env.APP_INSTANCE || "streamient"}:v${process.env.APP_VERSION || 3}`,
  logger: log,
  l1: { maxBytes: (workerMode ? 4 : 16) * 1024 * 1024, maxTtlMs: 2000 },
});
let coordinator;

export function getCache() {
  return cache;
}

export function getMongoCoordinator() {
  if (!coordinator)
    coordinator = createMongoCoordinator({
      db: mongoose.connection.db,
      namespace: `${process.env.APP_INSTANCE || "streamient"}:v${process.env.APP_VERSION || 3}`,
      logger: log,
    });
  return coordinator;
}

export function getRateLimitStore(prefix, windowMs) {
  return createRateLimitStore({ cache, prefix: `rl:${prefix}:`, windowMs });
}

export async function cacheGet(key, options = {}) {
  return cache.get(key, options);
}

export async function cacheSet(key, value, ttlSeconds = 300, options = {}) {
  return cache.set(key, value, {
    ...options,
    ttlMs: Math.max(1, Number(ttlSeconds) || 300) * 1000,
  });
}

export async function cacheDelete(key, options = {}) {
  return cache.delete(key, options);
}

export async function cacheInvalidateScope(scope) {
  return cache.invalidateScope(scope);
}

export async function initCache() {
  const status = await cache.health();
  if (status.healthy)
    log.info({ nodes: status.nodes.length }, "Memcached cache ready");
  else
    log.warn(
      { status },
      "Memcached cache unavailable; cache operations will miss",
    );
  return status;
}
