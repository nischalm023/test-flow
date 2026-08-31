import Redis from "ioredis";
import type { TestCase } from "@/lib/types";

let redisClient: Redis | null = null;

export function getRedisUrl(): string {
  return process.env.REDIS_URL || process.env.REDIS_URI || "redis://127.0.0.1:6379";
}

/**
 * Get or initialize a shared Redis connection
 */
export function getRedisClient(): Redis | null {
  if (redisClient) return redisClient;

  try {
    const url = getRedisUrl();
    redisClient = new Redis(url, {
      maxRetriesPerRequest: 2,
      connectTimeout: 4000,
      retryStrategy(times) {
        if (times > 3) return null; // stop retry after 3 failures
        return Math.min(times * 200, 1000);
      },
      lazyConnect: true,
    });

    redisClient.on("error", (err) => {
      console.warn("[Redis] ⚠️ Connection warning:", err?.message || err);
    });

    return redisClient;
  } catch (err) {
    console.warn("[Redis] ⚠️ Failed to initialize Redis client:", err);
    return null;
  }
}

export function getRepoTestCasesKey(repo: string): string {
  const normalized = repo.trim().replace(/^https?:\/\/github\.com\//, "").replace(/\.git$/, "").replace(/\/$/, "");
  return `testcases:${normalized}`;
}

/**
 * Cache test cases for a repository using Redis HSET
 * Key: testcases:<owner/repo>
 * Fields: <testCaseId> -> JSON string
 */
export async function cacheRepoTestCasesHSet(
  repo: string,
  testCases: TestCase[],
  ttlSeconds: number = 3600
): Promise<boolean> {
  const redis = getRedisClient();
  if (!redis || testCases.length === 0) return false;

  try {
    if (redis.status === "wait") await redis.connect();

    const key = getRepoTestCasesKey(repo);
    const pipeline = redis.pipeline();

    for (const tc of testCases) {
      if (tc?.id) {
        pipeline.hset(key, tc.id, JSON.stringify(tc));
      }
    }

    if (ttlSeconds > 0) {
      pipeline.expire(key, ttlSeconds);
    }

    await pipeline.exec();
    console.log(`[Redis] ⚡ Cached ${testCases.length} test case(s) in HSET "${key}" (TTL: ${ttlSeconds}s)`);
    return true;
  } catch (err) {
    console.warn("[Redis] ⚠️ Failed to cache test cases with HSET:", err);
    return false;
  }
}

/**
 * Retrieve all cached test cases for a repository using Redis HGETALL
 */
export async function getRepoTestCasesHGetAll(repo: string): Promise<TestCase[] | null> {
  const redis = getRedisClient();
  if (!redis) return null;

  try {
    if (redis.status === "wait") await redis.connect();

    const key = getRepoTestCasesKey(repo);
    const hash = await redis.hgetall(key);

    if (!hash || Object.keys(hash).length === 0) {
      return null;
    }

    const testCases: TestCase[] = [];
    for (const raw of Object.values(hash)) {
      try {
        const parsed = JSON.parse(raw);
        if (parsed && parsed.id) {
          testCases.push(parsed);
        }
      } catch {
        // ignore malformed JSON
      }
    }

    console.log(`[Redis] 🎯 Cache HIT: Retrieved ${testCases.length} test case(s) from HSET "${key}"`);
    return testCases.length > 0 ? testCases : null;
  } catch (err) {
    console.warn("[Redis] ⚠️ Failed to retrieve test cases from HSET:", err);
    return null;
  }
}

/**
 * Set a single test case in repository HSET cache
 */
export async function setSingleTestCaseHSet(
  repo: string,
  testCase: TestCase,
  ttlSeconds: number = 3600
): Promise<boolean> {
  const redis = getRedisClient();
  if (!redis || !testCase?.id) return false;

  try {
    if (redis.status === "wait") await redis.connect();

    const key = getRepoTestCasesKey(repo);
    await redis.hset(key, testCase.id, JSON.stringify(testCase));
    if (ttlSeconds > 0) {
      await redis.expire(key, ttlSeconds);
    }
    console.log(`[Redis] ⚡ Updated single test case "${testCase.id}" in HSET "${key}"`);
    return true;
  } catch (err) {
    console.warn("[Redis] ⚠️ Failed to set single test case in HSET:", err);
    return false;
  }
}

/**
 * Delete repository test cases cache
 */
export async function clearRepoTestCasesCache(repo: string): Promise<boolean> {
  const redis = getRedisClient();
  if (!redis) return false;

  try {
    if (redis.status === "wait") await redis.connect();

    const key = getRepoTestCasesKey(repo);
    await redis.del(key);
    console.log(`[Redis] 🗑️ Cleared cache for "${key}"`);
    return true;
  } catch (err) {
    console.warn("[Redis] ⚠️ Failed to clear cache:", err);
    return false;
  }
}
