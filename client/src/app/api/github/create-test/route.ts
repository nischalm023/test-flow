import { readFile } from "fs/promises";
import { randomUUID } from "node:crypto";
import path from "path";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { Octokit } from "octokit";
import { db } from "@/db";
import { repoScans } from "@/db/schema";
import {
  GITHUB_ACCESS_COOKIE,
  readGithubAccessToken,
  resolveDbUserFromGithubToken,
} from "@/lib/github-oauth";
import { generateNativeRepoReadme } from "@/features/github-scan/agent";

export const runtime = "nodejs";

const TARGET_BRANCH = "qa-studio/playwright-setup";

// These paths are read from THIS repo (the QA Studio checkout) and copied into the
// target user repo's new branch. Never write to this repo's own working tree here.
const SETUP_FILES = [
  ".vscode/mcp.json",
  ".agents/mcp_config.json",
  ".agents/rules/playwright-rules.md",
  ".agents/skills/playwright-test-planner/SKILL.md",
  ".agents/skills/playwright-test-generator/SKILL.md",
  ".agents/skills/playwright-test-healer/SKILL.md",
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

async function writeRepoFile(
  octokit: Octokit,
  opts: {
    owner: string;
    repo: string;
    path: string;
    branch: string;
    content: string;
    message: string;
  },
) {
  const existingSha = await octokit.rest.repos
    .getContent({ owner: opts.owner, repo: opts.repo, path: opts.path, ref: opts.branch })
    .then((res) => (Array.isArray(res.data) ? undefined : res.data.sha))
    .catch((err: { status?: number }) => {
      if (err?.status === 404) return undefined;
      throw err;
    });

  await octokit.rest.repos.createOrUpdateFileContents({
    owner: opts.owner,
    repo: opts.repo,
    path: opts.path,
    branch: opts.branch,
    message: opts.message,
    content: Buffer.from(opts.content, "utf8").toString("base64"),
    sha: existingSha,
  });
}

export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as {
    repo?: string;
    owner?: string;
    name?: string;
    branch?: string;
    baseBranch?: string;
    mode?: "reuse" | "new";
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

  const dbUser = await resolveDbUserFromGithubToken(token);

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

    if (branchAlreadyExists && !body.mode) {
      return NextResponse.json(
        {
          error: `Branch "${TARGET_BRANCH}" already exists on ${owner}/${repo}`,
          conflict: true,
          existingBranch: TARGET_BRANCH,
        },
        { status: 409 },
      );
    }

    const targetBranch =
      branchAlreadyExists && body.mode === "new"
        ? `${TARGET_BRANCH}-${randomUUID().slice(0, 8)}`
        : TARGET_BRANCH;

    if (!branchAlreadyExists || targetBranch !== TARGET_BRANCH) {
      const { data: baseRef } = await octokit.rest.git.getRef({
        owner,
        repo,
        ref: `heads/${baseBranchName}`,
      });

      await octokit.rest.git.createRef({
        owner,
        repo,
        ref: `refs/heads/${targetBranch}`,
        sha: baseRef.object.sha,
      });
    }

    const repoRoot = path.join(process.cwd(), "..");
    const filesWritten: string[] = [];

    // 1. Write standard Playwright & MCP setup files
    for (const filePath of SETUP_FILES) {
      const content = await readFile(path.join(repoRoot, filePath), "utf8");
      await writeRepoFile(octokit, {
        owner,
        repo,
        path: filePath,
        branch: targetBranch,
        content,
        message: "Add Playwright + MCP setup (QA Studio)",
      });
      filesWritten.push(filePath);
    }

    // 2. Check whether README.md already exists on the repository
    const readmeResult = await generateNativeRepoReadme({
      token,
      owner,
      repo,
      branch: baseBranchName,
    });

    // If README.md does NOT exist on the repo, write the newly generated native README.md
    if (!readmeResult.exists && readmeResult.content) {
      await writeRepoFile(octokit, {
        owner,
        repo,
        path: "README.md",
        branch: targetBranch,
        content: readmeResult.content,
        message: `Add generated README.md for ${owner}/${repo}`,
      });
      filesWritten.push("README.md");
    }

    // 3. Write clean helper READMEs for test suites and agents
    const helperReadmes = [
      {
        path: "tests/README.md",
        content: `# Playwright Test Suite for ${owner}/${repo}

Senior QA Engineer Test Automation Suite. All testing code is isolated in the \`${targetBranch}\` branch.

## QA Workflow & Guidelines
1. **Branch Isolation**: All testing activities run on \`${targetBranch}\`. Never modify the default/main branch or application production code.
2. **Execute Test Suite**: Run and validate test cases against the selected repository.
3. **Failure Analysis & Root Cause Diagnosis**: Determine exact root causes for any failing test cases.
4. **Fix Test Cases**: Repair broken or incorrect test cases without changing production code.
5. **Re-Run & Verification**: Re-run tests to verify fixes until green.
6. **Final QA Report**: Summarize passed tests, failed tests, fixes made, and recommendations.

## Running Tests Locally

\`\`\`bash
# Run all tests
npx playwright test

# Run tests in UI mode
npx playwright test --ui

# Run specific tag (e.g. @smoke, @critical)
npx playwright test --grep @smoke
\`\`\`
`,
      },
      {
        path: "specs/README.md",
        content: `# Test Plan Specifications for ${owner}/${repo}

Test plans and feature specifications are written here by the **Planner** agent (\`specs/<feature>.md\`).

The **Generator** agent turns numbered scenarios into runnable specs under \`tests/\`.
`,
      },
      {
        path: ".agents/README.md",
        content: `# QA Automation Agents for ${owner}/${repo}

Configured for Senior QA Engineer workflow on branch \`${targetBranch}\`:

| Agent | Skill Path | Role |
|-------|------------|------|
| **Planner** | \`.agents/skills/playwright-test-planner/\` | Explores the app and writes test plans to \`specs/\` |
| **Generator** | \`.agents/skills/playwright-test-generator/\` | Generates Playwright spec files in \`tests/\` |
| **Healer** | \`.agents/skills/playwright-test-healer/\` | Debugs and repairs failing test locators |

Configuration: \`.vscode/mcp.json\` and \`.agents/mcp_config.json\`.
`,
      },
    ];

    for (const readme of helperReadmes) {
      await writeRepoFile(octokit, {
        owner,
        repo,
        path: readme.path,
        branch: targetBranch,
        content: readme.content,
        message: `Add ${readme.path} for ${owner}/${repo}`,
      });
      filesWritten.push(readme.path);
    }

    // 4. Ensure tests/ folder exists
    const testsFolderExists = await octokit.rest.repos
      .getContent({ owner, repo, path: "tests", ref: targetBranch })
      .then(() => true)
      .catch((err: { status?: number }) => {
        if (err?.status === 404) return false;
        throw err;
      });

    let testsFolderCreated = false;
    if (!testsFolderExists) {
      await writeRepoFile(octokit, {
        owner,
        repo,
        path: "tests/.gitkeep",
        branch: targetBranch,
        content: "",
        message: "Create tests/ folder (QA Studio)",
      });
      testsFolderCreated = true;
    }

    const [scan] = await db
      .insert(repoScans)
      .values({
        userId: dbUser?.id,
        owner,
        repoName: repo,
        setupBranch: targetBranch,
        baseBranch: baseBranchName,
        testsFolderCreated,
      })
      .returning();

    return NextResponse.json({
      id: scan.id,
      branch: targetBranch,
      compareUrl: `${repoData.html_url}/tree/${targetBranch}`,
      filesWritten,
      testsFolderCreated,
      readmeAlreadyExisted: readmeResult.exists,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to create test setup";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
