import { readFile } from "fs/promises";
import path from "path";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { Octokit } from "octokit";
import {
  GITHUB_ACCESS_COOKIE,
  readGithubAccessToken,
} from "@/lib/github-oauth";

export const runtime = "nodejs";

const TARGET_BRANCH = "qa-studio/playwright-setup";

// These paths are read from THIS repo (the QA Studio checkout) and copied into the
// target user repo's new branch. Never write to this repo's own working tree here.
const SETUP_FILES = [
  ".vscode/mcp.json",
  ".agents/mcp_config.json",
  ".agents/rules/playwright-rules.md",
];

function parseRepo(input: unknown): { owner: string; repo: string } | null {
  if (typeof input !== "string") return null;
  const [owner, repo] = input
    .trim()
    .replace(/^https?:\/\/github\.com\//, "")
    .replace(/\.git$/, "")
    .split("/");
  if (!owner || !repo) return null;
  return { owner, repo };
}

export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as {
    repo?: string;
    owner?: string;
    name?: string;
    branch?: string;
    baseBranch?: string;
  };
  const parsed =
    parseRepo(body.repo) ??
    (body.owner && body.name ? { owner: body.owner, repo: body.name } : null);
  if (!parsed) {
    return NextResponse.json({ error: "Provide repo as owner/name" }, { status: 400 });
  }
  const { owner, repo } = parsed;

  const cookieStore = await cookies();
  const raw = cookieStore.get(GITHUB_ACCESS_COOKIE)?.value;
  const token = (raw ? readGithubAccessToken(raw) : null) || process.env.GITHUB_TOKEN;
  if (!token) {
    return NextResponse.json({ error: "GitHub auth required" }, { status: 401 });
  }

  const octokit = new Octokit({ auth: token, userAgent: "QA-Studio" });

  try {
    const { data: repoData } = await octokit.rest.repos.get({ owner, repo });
    const baseBranchName = body.branch || body.baseBranch || repoData.default_branch || "main";

    const branchAlreadyExists = await octokit.rest.repos
      .getBranch({ owner, repo, branch: TARGET_BRANCH })
      .then(() => true)
      .catch((err: { status?: number }) => {
        if (err?.status === 404) return false;
        throw err;
      });

    if (branchAlreadyExists) {
      return NextResponse.json(
        { error: `Branch "${TARGET_BRANCH}" already exists on ${owner}/${repo}` },
        { status: 409 },
      );
    }

    const { data: baseRef } = await octokit.rest.git.getRef({
      owner,
      repo,
      ref: `heads/${baseBranchName}`,
    });
    const baseSha = baseRef.object.sha;

    await octokit.rest.git.createRef({
      owner,
      repo,
      ref: `refs/heads/${TARGET_BRANCH}`,
      sha: baseSha,
    });

    const repoRoot = path.join(process.cwd(), "..");
    const filesWritten: string[] = [];

    for (const filePath of SETUP_FILES) {
      const content = await readFile(path.join(repoRoot, filePath), "utf8");

      const existingSha = await octokit.rest.repos
        .getContent({ owner, repo, path: filePath, ref: TARGET_BRANCH })
        .then((res) => (Array.isArray(res.data) ? undefined : res.data.sha))
        .catch((err: { status?: number }) => {
          if (err?.status === 404) return undefined;
          throw err;
        });

      await octokit.rest.repos.createOrUpdateFileContents({
        owner,
        repo,
        path: filePath,
        branch: TARGET_BRANCH,
        message: "Add Playwright + MCP setup (QA Studio)",
        content: Buffer.from(content, "utf8").toString("base64"),
        sha: existingSha,
      });
      filesWritten.push(filePath);
    }

    return NextResponse.json({
      branch: TARGET_BRANCH,
      compareUrl: `${repoData.html_url}/tree/${TARGET_BRANCH}`,
      filesWritten,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to create test setup";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
