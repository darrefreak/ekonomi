/**
 * BullMQ connection settings derived from `REDIS_URL`.
 *
 * The logical database in the URL path is honoured, and an optional
 * `FFOS_QUEUE_PREFIX` namespaces every key. Together these keep a test run and
 * a running development worker from seeing each other's jobs, which is what
 * made the jobs suite depend on whether the dev stack happened to be up
 * (RT2-005).
 */
export function redisConnection() {
  const url = new URL(process.env.REDIS_URL ?? "redis://localhost:6379");
  const logicalDb = Number(url.pathname.replace(/^\//, "") || "0");
  return {
    host: url.hostname,
    port: Number(url.port || 6379),
    db: Number.isFinite(logicalDb) ? logicalDb : 0,
    maxRetriesPerRequest: null as null,
  };
}

/** Key namespace, so two contexts on one Redis database still stay apart. */
export function queuePrefix(): string {
  const prefix = process.env.FFOS_QUEUE_PREFIX?.trim();
  return prefix ? `{ffos:${prefix}}` : "{ffos}";
}

export function queueOptions() {
  return { connection: redisConnection(), prefix: queuePrefix() };
}
