import Redis from "ioredis";

const redis = new Redis(process.env.REDIS_URL || "redis://localhost:6379", {
  maxRetriesPerRequest: null,
  // Without this, a command issued while Redis is unreachable sits in
  // ioredis's offline queue forever instead of failing — since Redis here
  // is only a cache, callers need commands to reject on a bounded timeout
  // so they can fall back to Postgres instead of hanging the request.
  commandTimeout: 2000,
});

redis.on("error", (err) => {
  console.error("Redis error:", err.message);
});

export default redis;

// Best-effort cache helpers: every call swallows its own errors (a timed-out
// or unreachable Redis) so a cache miss/failure just means "go read Postgres
// instead," never a failed or hung request.
export async function cacheGet(key: string): Promise<string | null> {
  try {
    return await redis.get(key);
  } catch (err) {
    console.error(`Redis get failed for ${key}:`, (err as Error).message);
    return null;
  }
}

export async function cacheSet(key: string, value: string, ttlSeconds = 3000): Promise<void> {
  try {
    await redis.set(key, value, "EX", ttlSeconds);
  } catch (err) {
    console.error(`Redis set failed for ${key}:`, (err as Error).message);
  }
}

export async function cacheDel(key: string): Promise<void> {
  try {
    await redis.del(key);
  } catch (err) {
    console.error(`Redis del failed for ${key}:`, (err as Error).message);
  }
}
