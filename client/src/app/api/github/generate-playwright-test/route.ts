import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import type { TestCase } from "@/lib/types";
import { applyLiveAppUrl } from "@/lib/playwrightCodegen";
import { getRunStatus } from "@/lib/repoRunner";
import { indexTestCasesToQdrant } from "@/lib/indexTestCases";
import { generatePlaywrightTestFromDocuments } from "@/features/github-scan/agent";
import {
  GITHUB_ACCESS_COOKIE,
  readGithubAccessToken,
  resolveDbUserFromGithubToken,
} from "@/lib/github-oauth";

export const runtime = "nodejs";
export const maxDuration = 60;

function parseOwnerRepo(input: string): { owner: string; repo: string } | null {
  const [owner, repo] = input
    .trim()
    .replace(/^https?:\/\/github\.com\//, "")
    .replace(/\.git$/, "")
    .split("/");
  if (!owner || !repo) return null;
  return { owner, repo };
}

function resolveLocalAppUrl(repo: string, explicitUrl?: string): string {
  const trimmed = explicitUrl?.trim();
  if (trimmed) return trimmed.replace(/\/$/, "");
  const run = getRunStatus();
  if (run.status !== "running" || !run.url) return "";
  const parsed = parseOwnerRepo(repo);
  if (!parsed) return run.url;
  return run.url;
}

export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as {
    repo?: string;
    prompt?: string;
    targetUrl?: string;
  };
  const repo = typeof body.repo === "string" ? body.repo.trim() : "";
  const parsed = parseOwnerRepo(repo);
  if (!parsed) {
    return NextResponse.json({ error: "Provide repo as owner/name" }, { status: 400 });
  }

  const liveAppUrl = resolveLocalAppUrl(repo, typeof body.targetUrl === "string" ? body.targetUrl : "");
  const prompt = typeof body.prompt === "string" ? body.prompt.trim() : "";

  try {
    const { test, documents, collection } = await generatePlaywrightTestFromDocuments({
      owner: parsed.owner,
      repo: parsed.repo,
      prompt,
      targetUrl: liveAppUrl,
    });

    const stamp = Date.now();
    const testCase: TestCase = applyLiveAppUrl(
      {
        id: `tc-docs-${stamp}`,
        title: test.title,
        description: test.description,
        priority: test.priority,
        category: test.category,
        status: "draft",
        targetUrl: liveAppUrl,
        createdAt: new Date(stamp).toISOString(),
        steps: test.steps.map((step, idx) => ({
          id: `step-docs-${stamp}-${idx}`,
          order: idx + 1,
          action: step.action,
          targetSelector: step.targetSelector,
          targetDescription: step.targetDescription,
          value: step.value,
          expectedValue: step.expectedValue,
          timeoutMs: 1000,
        })),
      },
      liveAppUrl,
    );

    const cookieStore = await cookies();
    const raw = cookieStore.get(GITHUB_ACCESS_COOKIE)?.value;
    const token = (raw ? readGithubAccessToken(raw) : null) || process.env.GITHUB_TOKEN;
    const dbUser = token ? await resolveDbUserFromGithubToken(token) : null;

    let qdrant: Awaited<ReturnType<typeof indexTestCasesToQdrant>> | { saved: false; error: string };
    try {
      qdrant = await indexTestCasesToQdrant([testCase], {
        userId: dbUser?.id,
        githubRepo: repo,
        owner: parsed.owner,
        repo: parsed.repo,
      });
    } catch (err) {
      qdrant = {
        saved: false,
        error: err instanceof Error ? err.message : "Failed to save to Qdrant",
      };
    }

    return NextResponse.json({
      testCase,
      playwrightTestCode: test.playwrightTestCode,
      filePath: test.filePath,
      documents,
      collection,
      qdrant,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to generate Playwright test";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
