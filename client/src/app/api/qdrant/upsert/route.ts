import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import type { TestCase } from "@/lib/types";
import { indexTestCasesToQdrant } from "@/lib/indexTestCases";
import {
  GITHUB_ACCESS_COOKIE,
  readGithubAccessToken,
  resolveDbUserFromGithubToken,
} from "@/lib/github-oauth";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as {
    testCases?: TestCase[];
    userId?: string;
    githubRepo?: string;
    owner?: string;
    repo?: string;
  };
  const testCases = Array.isArray(body.testCases) ? body.testCases : [];
  if (testCases.length === 0) {
    return NextResponse.json({ error: "Provide a non-empty testCases array" }, { status: 400 });
  }

  const cookieStore = await cookies();
  const raw = cookieStore.get(GITHUB_ACCESS_COOKIE)?.value;
  const token = (raw ? readGithubAccessToken(raw) : null) || process.env.GITHUB_TOKEN;
  const dbUser = token ? await resolveDbUserFromGithubToken(token) : null;

  try {
    const qdrant = await indexTestCasesToQdrant(testCases, {
      userId: dbUser?.id || body.userId,
      githubRepo: body.githubRepo,
      owner: body.owner,
      repo: body.repo,
    });

    const repoKey = body.githubRepo || (body.owner && body.repo ? `${body.owner}/${body.repo}` : null);
    if (repoKey) {
      const { cacheRepoTestCasesHSet } = await import("@/lib/redis");
      void cacheRepoTestCasesHSet(repoKey, testCases, 3600);
    }

    return NextResponse.json({ qdrant });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to save to Qdrant" },
      { status: 502 },
    );
  }
}
