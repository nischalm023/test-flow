import { NextResponse } from "next/server";
import { fetchTestCaseFromQdrant } from "@/lib/indexTestCases";
import { getRedisClient, getRepoTestCasesKey, setSingleTestCaseHSet } from "@/lib/redis";

export const runtime = "nodejs";

/**
 * GET /api/qdrant/test-case?id=<testCaseId>&repo=<owner/repo>
 * Fetch a single generated test case back from Redis HSET or Qdrant collection.
 */
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id")?.trim();
  const repo = searchParams.get("repo")?.trim();

  if (!id) {
    return NextResponse.json({ error: "Provide a test case id" }, { status: 400 });
  }

  // 1. Check Redis HSET if repo is provided
  if (repo) {
    try {
      const redis = getRedisClient();
      if (redis) {
        if (redis.status === "wait") await redis.connect();
        const raw = await redis.hget(getRepoTestCasesKey(repo), id);
        if (raw) {
          const parsed = JSON.parse(raw);
          return NextResponse.json({ ok: true, source: "redis-hset", cached: true, testCase: parsed });
        }
      }
    } catch {
      // continue to Qdrant
    }
  }

  // 2. Fetch from Qdrant
  try {
    const testCase = await fetchTestCaseFromQdrant(id);
    if (!testCase) {
      return NextResponse.json({ ok: true, testCase: null });
    }

    // 3. Cache to Redis if repo is known
    if (repo) {
      void setSingleTestCaseHSet(repo, testCase);
    }

    return NextResponse.json({ ok: true, source: "qdrant", cached: false, testCase });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to fetch test case from Qdrant";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

