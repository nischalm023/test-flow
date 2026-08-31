import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { execSync, spawn } from "child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync, readdirSync, statSync } from "fs";
import path from "path";
import os from "os";
import { Octokit } from "octokit";
import { claudeModel, openRouterModel, nvidiaModel } from "@/features/github-scan/agent";
import { GITHUB_ACCESS_COOKIE, readGithubAccessToken } from "@/lib/github-oauth";
import { indexGeneratedTestFilesToQdrant } from "@/lib/indexTestCases";

export const runtime = "nodejs";

interface FileInfo {
  path: string;
  relativePath: string;
  size: number;
}

function findFilesRecursively(dir: string, baseDir: string = dir): FileInfo[] {
  let results: FileInfo[] = [];
  if (!existsSync(dir)) return results;

  const entries = readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.name === "node_modules" || entry.name === ".git" || entry.name === ".next") continue;
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results = results.concat(findFilesRecursively(fullPath, baseDir));
    } else if (entry.isFile()) {
      results.push({
        path: fullPath,
        relativePath: path.relative(baseDir, fullPath),
        size: statSync(fullPath).size,
      });
    }
  }
  return results;
}

function runCommand(command: string, cwd: string, timeoutMs = 120000): { stdout: string; stderr: string; exitCode: number } {
  try {
    const stdout = execSync(command, {
      cwd,
      timeout: timeoutMs,
      encoding: "utf8",
      stdio: ["pipe", "pipe", "pipe"],
      env: {
        ...process.env,
        CI: "true",
        FORCE_COLOR: "0",
      },
    });
    return { stdout, stderr: "", exitCode: 0 };
  } catch (err: any) {
    return {
      stdout: err.stdout?.toString() || "",
      stderr: err.stderr?.toString() || err.message || "",
      exitCode: err.status || 1,
    };
  }
}

async function healFailingSpecWithAnthropic({
  specPath,
  specContent,
  errorOutput,
  repo,
  branch,
  attempt,
}: {
  specPath: string;
  specContent: string;
  errorOutput: string;
  repo: string;
  branch: string;
  attempt: number;
}): Promise<{ fixedCode: string; explanation: string }> {
  const model = process.env.ANTHROPIC_API_KEY
    ? claudeModel(4096)
    : process.env.OPENROUTER_API_KEY
      ? openRouterModel(4096)
      : nvidiaModel(4096);

  const prompt = `You are a Principal QA Automation Architect and Playwright Self-Healing Agent.
The Playwright test file "${specPath}" failed during execution on repository "${repo}" (branch "${branch}").

---
FAILED SPEC FILE:
${specContent}

---
PLAYWRIGHT TEST FAILURE LOGS & ERROR:
${errorOutput.slice(-3000)}

---
Playwright QA Coding Rules (STRICT):
1. Fix broken locators following accessibility priority:
   - getByRole with accessible name
   - getByLabel for form inputs
   - getByPlaceholder when no label exists
   - getByTestId (data-testid / data-test-id)
   - getByText for static UI copy
2. Mock API endpoints with \`page.route()\` if network calls or auth is required.
3. Import \`test\` and \`expect\` properly from fixtures or \`@playwright/test\`.
4. Return ONLY the complete, corrected, runnable TypeScript test file code without explanations or markdown formatting outside of code blocks.

Provide your response in this exact format:
\`\`\`typescript
// Complete runnable fixed test code here
\`\`\`
EXPLANATION: <brief 1-2 sentence explanation of what was fixed>`;

  const response = await model.invoke([
    {
      role: "system",
      content:
        "You are an expert Playwright test automation engineer. Repair failing test files cleanly and accurately.",
    },
    { role: "user", content: prompt },
  ]);

  const rawText = typeof response.content === "string" ? response.content : JSON.stringify(response.content);
  const codeMatch = rawText.match(/```(?:typescript|ts)?\n([\s\S]*?)```/);
  const fixedCode = codeMatch ? codeMatch[1].trim() : rawText.trim();
  const explMatch = rawText.match(/EXPLANATION:\s*(.*)/i);
  const explanation = explMatch ? explMatch[1].trim() : `Healed locator/assertions in ${specPath} (Attempt ${attempt})`;

  return { fixedCode, explanation };
}

async function executeRunAllTests(
  repoUrl: string,
  branchName: string,
  maxHealingRounds: number = 3,
  token?: string,
) {
  console.log("================================================================================");
  console.log(`🚀 [RunAllTests] Starting Automated Playwright Test Execution & Healing Pipeline`);
  console.log(`📦 Target Repository: ${repoUrl}`);
  console.log(`🌿 Target Branch:     ${branchName}`);
  console.log(`⏱️ Max Healing Rounds: ${maxHealingRounds}`);
  console.log("================================================================================");

  const cleanRepoName = repoUrl
    .replace(/^https?:\/\/github\.com\//, "")
    .replace(/\.git$/, "")
    .replace(/[^a-zA-Z0-9_-]/g, "_");

  const runnerBaseDir = path.join(os.tmpdir(), "qa-studio-runs");
  if (!existsSync(runnerBaseDir)) mkdirSync(runnerBaseDir, { recursive: true });

  const workDir = path.join(runnerBaseDir, `${cleanRepoName}_${branchName.replace(/[^a-zA-Z0-9_-]/g, "_")}`);

  // 1. Clone or Pull Repo Branch
  console.log(`\n📥 [Step 1] Cloning / Updating Repository in workspace: ${workDir}`);
  if (existsSync(path.join(workDir, ".git"))) {
    console.log(`[Git] Fetching latest changes for branch "${branchName}"...`);
    runCommand(`git fetch origin`, workDir);
    runCommand(`git checkout ${branchName}`, workDir);
    runCommand(`git pull origin ${branchName}`, workDir);
  } else {
    console.log(`[Git] Cloning repo "${repoUrl}" branch "${branchName}"...`);
    const cloneRes = runCommand(
      `git clone --depth 1 --branch ${branchName} ${repoUrl} ${workDir}`,
      runnerBaseDir,
      180000
    );
    if (cloneRes.exitCode !== 0) {
      // Fallback: Clone default and checkout
      console.log(`[Git] Direct branch clone failed, cloning main repo and checking out...`);
      runCommand(`git clone --depth 1 ${repoUrl} ${workDir}`, runnerBaseDir, 180000);
      runCommand(`git checkout ${branchName}`, workDir);
    }
  }

  // 2. Dynamic Repository Scan
  console.log(`\n🔍 [Step 2] Dynamically Scanning Repository Structure & Test Files...`);
  const allFiles = findFilesRecursively(workDir);
  const specFiles = allFiles.filter((f) => f.relativePath.includes("tests/") && f.relativePath.endsWith(".spec.ts"));
  const pageObjectFiles = allFiles.filter(
    (f) => f.relativePath.includes("src/pages/") || f.relativePath.includes("pages/")
  );
  const configFiles = allFiles.filter((f) => f.relativePath.includes("playwright.config"));

  console.log(`[Scan] 📁 Total Project Files Scanned: ${allFiles.length}`);
  console.log(`[Scan] 🧪 Playwright Spec Files Found: ${specFiles.length}`);
  specFiles.forEach((s) => console.log(`   └─ 📄 ${s.relativePath} (${(s.size / 1024).toFixed(1)} KB)`));
  console.log(`[Scan] 📄 Page Objects Found:         ${pageObjectFiles.length}`);
  console.log(`[Scan] ⚙️ Configuration Files:         ${configFiles.map((c) => c.relativePath).join(", ") || "none"}`);

  // 3. Install Dependencies & Link Playwright
  console.log(`\n📦 [Step 3] Ensuring Dependencies & Playwright Browsers...`);
  const workDirNodeModules = path.join(workDir, "node_modules");
  const rootNodeModules = path.join(process.cwd(), "../node_modules");
  const clientNodeModules = path.join(process.cwd(), "node_modules");

  if (!existsSync(workDirNodeModules)) {
    mkdirSync(workDirNodeModules, { recursive: true });
  }

  // Link @playwright and @types from parent if missing
  const workDirPlaywright = path.join(workDirNodeModules, "@playwright");
  const rootPlaywright = existsSync(path.join(rootNodeModules, "@playwright"))
    ? path.join(rootNodeModules, "@playwright")
    : path.join(clientNodeModules, "@playwright");

  if (!existsSync(workDirPlaywright) && existsSync(rootPlaywright)) {
    try {
      const { symlinkSync } = await import("fs");
      symlinkSync(rootPlaywright, workDirPlaywright, "dir");
      console.log(`[Dependencies] 🔗 Linked @playwright from root workspace`);
    } catch (symErr) {
      console.log(`[NPM] Installing @playwright/test in workspace...`);
      runCommand(`npm install --force --no-audit @playwright/test playwright`, workDir, 180000);
    }
  } else if (!existsSync(workDirPlaywright)) {
    console.log(`[NPM] Installing @playwright/test in workspace...`);
    runCommand(`npm install --force --no-audit @playwright/test playwright`, workDir, 180000);
  }

  // 4. Test Execution & Self-Healing Loop
  let currentRound = 1;
  let allPassed = false;
  const history: Array<{ round: number; passed: boolean; output: string; fixes: string[] }> = [];

  while (currentRound <= maxHealingRounds && !allPassed) {
    console.log(`\n================================================================================`);
    console.log(`▶️ [Step 4 - Round ${currentRound}/${maxHealingRounds}] Executing Playwright Test Suite...`);
    console.log(`================================================================================`);

    const testCmd = `npx playwright test --reporter=list`;
    console.log(`[Command] ${testCmd}`);
    const result = runCommand(testCmd, workDir, 300000);

    console.log(`\n--- PLAYWRIGHT OUTPUT (Round ${currentRound}) ---`);
    console.log(result.stdout || result.stderr);
    console.log(`--- END OUTPUT (Exit Code: ${result.exitCode}) ---\n`);

    if (result.exitCode === 0) {
      allPassed = true;
      console.log(`🎉 [SUCCESS] All ${specFiles.length} Playwright test suite(s) passed successfully!`);
      history.push({
        round: currentRound,
        passed: true,
        output: result.stdout,
        fixes: [],
      });
      break;
    }

    console.log(`⚠️ [FAILURE] Test suite had failures on Round ${currentRound}. Initiating Anthropic Claude AI Self-Healing...`);

    const roundFixes: string[] = [];

    // Analyze which specs failed
    for (const spec of specFiles) {
      if (result.stdout.includes(spec.relativePath) || result.stderr.includes(spec.relativePath) || specFiles.length === 1) {
        console.log(`\n🧠 [Anthropic Claude] Diagnosing and healing failing test: ${spec.relativePath}...`);
        const originalContent = readFileSync(spec.path, "utf8");

        try {
          const healResult = await healFailingSpecWithAnthropic({
            specPath: spec.relativePath,
            specContent: originalContent,
            errorOutput: result.stdout + "\n" + result.stderr,
            repo: repoUrl,
            branch: branchName,
            attempt: currentRound,
          });

          console.log(`💡 [Diagnosis] ${healResult.explanation}`);
          console.log(`🛠️ [Auto-Patch] Applying healed Playwright code to ${spec.relativePath}...`);
          writeFileSync(spec.path, healResult.fixedCode, "utf8");
          roundFixes.push(`${spec.relativePath}: ${healResult.explanation}`);
        } catch (healErr) {
          console.error(`❌ [Heal Error] Failed to auto-heal ${spec.relativePath}:`, healErr);
        }
      }
    }

    history.push({
      round: currentRound,
      passed: false,
      output: result.stdout || result.stderr,
      fixes: roundFixes,
    });

    currentRound++;
  }

  // 5. Commit Healed Files to GitHub & Index to Qdrant
  const totalFixes = history.reduce((acc, h) => acc + h.fixes.length, 0);
  const filesCommitted: string[] = [];

  const rawRepo = repoUrl.trim().replace(/^https?:\/\/github\.com\//, "").replace(/\.git$/, "").replace(/\/$/, "");
  const [owner, repoName] = rawRepo.split("/");

  if (token && owner && repoName && (allPassed || totalFixes > 0)) {
    console.log(`\n📤 [Step 5] Committing healed Playwright test files to GitHub branch "${branchName}"...`);
    const octokit = new Octokit({ auth: token, userAgent: "QA-Studio" });

    for (const spec of specFiles) {
      try {
        const content = readFileSync(spec.path, "utf8");
        const existingSha = await octokit.rest.repos
          .getContent({ owner, repo: repoName, path: spec.relativePath, ref: branchName })
          .then((res) => (Array.isArray(res.data) ? undefined : res.data.sha))
          .catch(() => undefined);

        await octokit.rest.repos.createOrUpdateFileContents({
          owner,
          repo: repoName,
          path: spec.relativePath,
          branch: branchName,
          message: `fix(qa): auto-heal Playwright test ${spec.relativePath} via Anthropic Claude [QA Studio]`,
          content: Buffer.from(content, "utf8").toString("base64"),
          sha: existingSha,
        });

        filesCommitted.push(spec.relativePath);
        console.log(`[GitHub Commit] ✅ Successfully pushed healed "${spec.relativePath}" to "${branchName}"`);
      } catch (commitErr: any) {
        console.warn(`[GitHub Commit] ⚠️ Failed to commit ${spec.relativePath}:`, commitErr?.message || commitErr);
      }
    }

    // Index healed test specs into Qdrant generated_tests collection
    try {
      const generatedFileObjects = specFiles.map((s) => ({
        path: s.relativePath,
        content: readFileSync(s.path, "utf8"),
      }));

      await indexGeneratedTestFilesToQdrant({
        owner,
        repo: repoName,
        branch: branchName,
        files: generatedFileObjects,
      });
      console.log(`[Qdrant] 🧪 Re-indexed ${generatedFileObjects.length} healed spec files to Qdrant collection`);
    } catch (qdrantErr) {
      console.warn("[Qdrant] ⚠️ Could not re-index healed tests to Qdrant:", qdrantErr);
    }
  }

  console.log("\n================================================================================");
  console.log(`🏁 [FINAL SUMMARY] Test Execution Pipeline Complete`);
  console.log(`Status:            ${allPassed ? "✅ ALL TESTS PASSED" : "❌ TESTS FAILED AFTER RETRIES"}`);
  console.log(`Rounds Executed:   ${currentRound - 1}`);
  console.log(`Spec Files:        ${specFiles.length}`);
  console.log(`Files Committed:   ${filesCommitted.length}`);
  console.log("================================================================================\n");

  return {
    ok: allPassed,
    repo: repoUrl,
    branch: branchName,
    allPassed,
    roundsExecuted: currentRound - 1,
    specFilesCount: specFiles.length,
    specs: specFiles.map((s) => s.relativePath),
    filesCommitted,
    history,
  };
}

export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as {
    repo?: string;
    branch?: string;
    maxRetries?: number;
  };

  const repo = body.repo?.trim() || "https://github.com/nischalm023/client.git";
  const branch = body.branch?.trim() || "qa-studio/playwright-setup";
  const maxRetries = body.maxRetries || 3;

  const cookieStore = await cookies();
  const rawToken = cookieStore.get(GITHUB_ACCESS_COOKIE)?.value;
  const token = (rawToken ? readGithubAccessToken(rawToken) : null) || process.env.GITHUB_TOKEN;

  try {
    const result = await executeRunAllTests(repo, branch, maxRetries, token || undefined);
    return NextResponse.json(result);
  } catch (err: any) {
    console.error("[RunAllTests] Fatal error:", err);
    return NextResponse.json({ ok: false, error: err?.message || String(err) }, { status: 500 });
  }
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const repo = searchParams.get("repo")?.trim() || "https://github.com/nischalm023/client.git";
  const branch = searchParams.get("branch")?.trim() || "qa-studio/playwright-setup";
  const maxRetries = Number(searchParams.get("maxRetries")) || 3;

  const cookieStore = await cookies();
  const rawToken = cookieStore.get(GITHUB_ACCESS_COOKIE)?.value;
  const token = (rawToken ? readGithubAccessToken(rawToken) : null) || process.env.GITHUB_TOKEN;

  try {
    const result = await executeRunAllTests(repo, branch, maxRetries, token || undefined);
    return NextResponse.json(result);
  } catch (err: any) {
    console.error("[RunAllTests] Fatal error:", err);
    return NextResponse.json({ ok: false, error: err?.message || String(err) }, { status: 500 });
  }
}
