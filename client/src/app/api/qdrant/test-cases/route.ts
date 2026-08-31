import { NextResponse } from "next/server";
import { qdrantTestCasesCollection, scrollAllPoints } from "@/lib/qdrant";
import {
  cacheRepoTestCasesHSet,
  getRepoTestCasesHGetAll,
  clearRepoTestCasesCache,
  setSingleTestCaseHSet,
} from "@/lib/redis";
import type { TestCase, TestCaseStep } from "@/lib/types";

export const runtime = "nodejs";

function parseStepsFromContent(content: string): TestCaseStep[] {
  if (!content) return [];
  const lines = content.split("\n");
  const stepLines = lines.filter((l) => /^\d+\.\s+/.test(l.trim()));
  if (stepLines.length === 0) return [];

  return stepLines.map((line, idx) => {
    const trimmed = line.trim().replace(/^\d+\.\s+/, "");
    const parts = trimmed.split(/\s+/);
    const actionRaw = parts[0]?.toLowerCase();
    const action = ["click", "type", "select", "assert_visible", "assert_text", "assert_value", "wait", "hover", "navigate"].includes(
      actionRaw
    )
      ? (actionRaw as any)
      : "assert_visible";

    return {
      id: `step-${idx + 1}-${Date.now()}`,
      order: idx + 1,
      action,
      targetSelector: parts.slice(2).join(" ") || parts[1] || "body",
      targetDescription: trimmed,
      timeoutMs: 1200,
    };
  });
}

function parseTestCaseFromPoint(point: any): TestCase | null {
  const payload = point.payload || {};
  if (payload.testCase && typeof payload.testCase === "object") {
    return payload.testCase as TestCase;
  }

  const documentId = payload.documentId || String(point.id);
  const title = payload.title || payload.filePath || "Generated Test Case";
  const steps = payload.steps || parseStepsFromContent(payload.content as string) || [];

  return {
    id: String(documentId),
    title: String(title),
    description: String(payload.description || payload.content || ""),
    priority: (payload.priority as TestCase["priority"]) || "medium",
    category: (payload.category as TestCase["category"]) || (payload.isTestSpec ? "E2E" : "Functional"),
    status: "ready",
    targetUrl: String(payload.targetUrl || ""),
    steps: steps.length > 0 ? steps : [
      {
        id: `step-default-1`,
        order: 1,
        action: "navigate",
        targetSelector: "window",
        targetDescription: `Execute ${title}`,
        timeoutMs: 1200,
      }
    ],
    createdAt: (payload.createdAt as string) || new Date().toISOString(),
  };
}

/**
 * GET /api/qdrant/test-cases?repo=owner/repo&refresh=false
 *
 * Checks Redis HSET cache first (HGETALL testcases:<repo>).
 * If cache miss, queries Qdrant generated_tests collection, transforms points to TestCase[],
 * stores them in Redis using HSET, and returns results.
 */
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const repo = searchParams.get("repo")?.trim();
  const refresh = searchParams.get("refresh") === "true";

  if (!repo) {
    return NextResponse.json({ ok: false, error: "Missing required 'repo' parameter (e.g. owner/repo)" }, { status: 400 });
  }

  const normalizedRepo = repo.replace(/^https?:\/\/github\.com\//, "").replace(/\.git$/, "").replace(/\/$/, "");
  const startTime = Date.now();

  try {
    // 1. Check Redis HSET Cache if refresh not requested
    if (!refresh) {
      const cached = await getRepoTestCasesHGetAll(normalizedRepo);
      if (cached && cached.length > 0) {
        const durationMs = Date.now() - startTime;
        return NextResponse.json({
          ok: true,
          source: "redis-hset",
          cached: true,
          repo: normalizedRepo,
          count: cached.length,
          testCases: cached,
          latencyMs: durationMs,
        });
      }
    }

    // 2. Cache Miss: Fetch from Qdrant
    const collection = qdrantTestCasesCollection();
    const filter = {
      must: [
        {
          key: "githubRepo",
          match: { value: normalizedRepo },
        },
      ],
    };

    let points = await scrollAllPoints(collection, { filter, maxPoints: 500 }).catch(() => []);

    // Fallback: If filtered returned 0, search all points and filter manually (in case of owner/repo variations)
    if (points.length === 0) {
      const allPoints = await scrollAllPoints(collection, { maxPoints: 500 }).catch(() => []);
      const [owner, repoName] = normalizedRepo.split("/");
      points = allPoints.filter((p) => {
        const pl = p.payload || {};
        return (
          pl.githubRepo === normalizedRepo ||
          (pl.owner === owner && pl.repo === repoName) ||
          (typeof pl.documentId === "string" && pl.documentId.includes(`${owner}_${repoName}`))
        );
      });
    }

    const testCases: TestCase[] = points
      .map(parseTestCaseFromPoint)
      .filter((tc): tc is TestCase => tc !== null);

    // 3. Cache to Redis using HSET (HSET key field value for each test case)
    if (testCases.length > 0) {
      await cacheRepoTestCasesHSet(normalizedRepo, testCases, 3600); // 1 hour TTL
    }

    const durationMs = Date.now() - startTime;
    return NextResponse.json({
      ok: true,
      source: "qdrant",
      cached: false,
      repo: normalizedRepo,
      count: testCases.length,
      testCases,
      latencyMs: durationMs,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to load test cases";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

/**
 * DELETE /api/qdrant/test-cases?repo=owner/repo
 * Clears Redis HSET cache for the specified repository
 */
export async function DELETE(req: Request) {
  const { searchParams } = new URL(req.url);
  const repo = searchParams.get("repo")?.trim();
  if (!repo) {
    return NextResponse.json({ ok: false, error: "Missing 'repo' query parameter" }, { status: 400 });
  }

  const normalizedRepo = repo.replace(/^https?:\/\/github\.com\//, "").replace(/\.git$/, "").replace(/\/$/, "");
  await clearRepoTestCasesCache(normalizedRepo);

  return NextResponse.json({
    ok: true,
    message: `Redis cache cleared for repo "${normalizedRepo}"`,
  });
}

/**
 * POST /api/qdrant/test-cases
 * Save/update a single test case in Redis HSET cache
 */
export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { repo, testCase } = body;
    if (!repo || !testCase) {
      return NextResponse.json({ ok: false, error: "Provide repo and testCase" }, { status: 400 });
    }

    const normalizedRepo = repo.replace(/^https?:\/\/github\.com\//, "").replace(/\.git$/, "").replace(/\/$/, "");
    await setSingleTestCaseHSet(normalizedRepo, testCase);

    return NextResponse.json({
      ok: true,
      message: `Test case cached in Redis HSET for "${normalizedRepo}"`,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to save test case to cache";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
