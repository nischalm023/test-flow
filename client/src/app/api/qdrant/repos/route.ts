import { NextResponse } from "next/server";
import { qdrantCollection, qdrantTestCasesCollection, scrollAllPoints } from "@/lib/qdrant";

export const runtime = "nodejs";

export interface RepoSummary {
  name: string;
  owner: string;
  repo: string;
  testCasesCount: number;
  testFilesCount: number;
  documentChunksCount: number;
  totalPoints: number;
}

/**
 * GET /api/qdrant/repos
 * Scans Qdrant's collections (`generated_tests` and `documents`) to discover
 * all indexed repositories and their test case / document point counts.
 */
export async function GET() {
  try {
    const docsCollection = qdrantCollection();
    const testsCollection = qdrantTestCasesCollection();

    const [docPoints, testPoints] = await Promise.all([
      scrollAllPoints(docsCollection, { maxPoints: 1000 }).catch(() => []),
      scrollAllPoints(testsCollection, { maxPoints: 1000 }).catch(() => []),
    ]);

    const repoMap = new Map<string, RepoSummary>();

    const getOrCreate = (githubRepo: string): RepoSummary => {
      const normalized = githubRepo.trim().replace(/^https?:\/\/github\.com\//, "").replace(/\.git$/, "").replace(/\/$/, "");
      let existing = repoMap.get(normalized);
      if (!existing) {
        const [owner, repo] = normalized.split("/");
        existing = {
          name: normalized,
          owner: owner || "",
          repo: repo || normalized,
          testCasesCount: 0,
          testFilesCount: 0,
          documentChunksCount: 0,
          totalPoints: 0,
        };
        repoMap.set(normalized, existing);
      }
      return existing;
    };

    // 1. Process test points
    for (const p of testPoints) {
      const payload = p.payload || {};
      const repoKey = (payload.githubRepo as string) || (payload.owner && payload.repo ? `${payload.owner}/${payload.repo}` : null);
      if (!repoKey) continue;

      const summary = getOrCreate(repoKey);
      summary.totalPoints++;
      if (payload.source === "generated-test-case" || payload.testCase) {
        summary.testCasesCount++;
      } else if (payload.source === "generated-test-file" || payload.isTestSpec) {
        summary.testFilesCount++;
      } else {
        summary.testCasesCount++;
      }
    }

    // 2. Process document points
    for (const p of docPoints) {
      const payload = p.payload || {};
      const repoKey = (payload.githubRepo as string) || (payload.owner && payload.repo ? `${payload.owner}/${payload.repo}` : null);
      if (!repoKey) continue;

      const summary = getOrCreate(repoKey);
      summary.totalPoints++;
      summary.documentChunksCount++;
    }

    const repos = Array.from(repoMap.values()).sort((a, b) => b.testCasesCount - a.testCasesCount || b.totalPoints - a.totalPoints);

    return NextResponse.json({
      ok: true,
      count: repos.length,
      repos,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to load repos from Qdrant";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
