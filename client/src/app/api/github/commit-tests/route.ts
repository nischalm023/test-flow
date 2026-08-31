import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { Octokit } from "octokit";
import { db } from "@/db";
import { repoScans } from "@/db/schema";
import { GITHUB_ACCESS_COOKIE, readGithubAccessToken, resolveDbUserFromGithubToken } from "@/lib/github-oauth";
import { applyLiveAppUrl, buildTestFiles } from "@/lib/playwrightCodegen";
import { indexGeneratedTestFilesToQdrant } from "@/lib/indexTestCases";
import type { TestCase } from "@/lib/types";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as {
    scanId?: string;
    owner?: string;
    repo?: string;
    branch?: string;
    testCases?: TestCase[];
  };

  const { scanId, owner, repo, branch } = body;
  const testCases = Array.isArray(body.testCases) ? body.testCases : [];
  if (!owner || !repo || !branch || testCases.length === 0) {
    return NextResponse.json(
      { error: "Provide owner, repo, branch and a non-empty testCases array" },
      { status: 400 },
    );
  }

  const cookieStore = await cookies();
  const raw = cookieStore.get(GITHUB_ACCESS_COOKIE)?.value;
  const token = (raw ? readGithubAccessToken(raw) : null) || process.env.GITHUB_TOKEN;
  if (!token) {
    return NextResponse.json({ error: "GitHub auth required" }, { status: 401 });
  }

  const octokit = new Octokit({ auth: token, userAgent: "QA-Studio" });

  const liveUrl = testCases.find((tc) => tc.targetUrl?.trim())?.targetUrl?.trim() ?? "";
  const stamped = testCases.map((tc) => applyLiveAppUrl(tc, liveUrl || tc.targetUrl));
  const baseUrl = stamped[0]?.targetUrl ?? "";
  const files = buildTestFiles(stamped, baseUrl);
  const filesWritten: string[] = [];
  const filesFailed: { path: string; error: string }[] = [];

  for (const file of files) {
    try {
      const existingSha = await octokit.rest.repos
        .getContent({ owner, repo, path: file.path, ref: branch })
        .then((res) => (Array.isArray(res.data) ? undefined : res.data.sha))
        .catch((err: { status?: number }) => {
          if (err?.status === 404) return undefined;
          throw err;
        });

      await octokit.rest.repos.createOrUpdateFileContents({
        owner,
        repo,
        path: file.path,
        branch,
        message: "Add generated Playwright test cases (QA Studio)",
        content: Buffer.from(file.content, "utf8").toString("base64"),
        sha: existingSha,
      });
      filesWritten.push(file.path);
    } catch (err: unknown) {
      filesFailed.push({
        path: file.path,
        error: err instanceof Error ? err.message : "Failed to write file",
      });
    }
  }

  if (scanId) {
    await db
      .update(repoScans)
      .set({ status: filesFailed.length === 0 ? "COMPLETED" : "FAILED" })
      .where(eq(repoScans.id, scanId))
      .catch(() => {});
  }

  if (filesWritten.length > 0) {
    const dbUser = token ? await resolveDbUserFromGithubToken(token).catch(() => null) : null;
    const writtenFileObjects = files.filter((f) => filesWritten.includes(f.path));
    void indexGeneratedTestFilesToQdrant({
      owner,
      repo,
      branch,
      files: writtenFileObjects,
      userId: dbUser?.id,
    }).catch((err) =>
      console.error("[Commit Tests] Failed to index test files into Qdrant generated_tests collection:", err)
    );
  }

  return NextResponse.json({ branch, filesWritten, filesFailed });
}
