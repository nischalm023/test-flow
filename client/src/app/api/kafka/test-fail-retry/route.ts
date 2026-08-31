import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { Octokit } from "octokit";
import { sendKafkaMessage } from "@/lib/kafka/producer";
import { KAFKA_TOPICS } from "@/lib/kafka/topics";
import { GITHUB_ACCESS_COOKIE, readGithubAccessToken, resolveDbUserFromGithubToken } from "@/lib/github-oauth";
import { healFailingTestCaseWithClaude } from "@/features/github-scan/agent";
import { indexTestCasesToQdrant } from "@/lib/indexTestCases";
import { applyLiveAppUrl, buildTestFiles } from "@/lib/playwrightCodegen";
import type { TestCase } from "@/lib/types";
import type { TestFailRetryPayload } from "@/types/kafka";

export const runtime = "nodejs";
export const maxDuration = 60;

const MAX_RETRY_LIMIT = 3;

export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as {
    testCase?: TestCase;
    failedStepIndex?: number;
    errorMessage?: string;
    errorLogs?: string[];
    owner?: string;
    repo?: string;
    branch?: string;
    scanId?: string;
    retryCount?: number;
  };

  const {
    testCase,
    failedStepIndex = 0,
    errorMessage = "Assertion or locator timeout failure",
    errorLogs = [],
    owner = "",
    repo = "",
    branch = "",
    scanId,
    retryCount = 1,
  } = body;

  if (!testCase) {
    return NextResponse.json({ error: "Provide a testCase object" }, { status: 400 });
  }

  const cookieStore = await cookies();
  const rawAccess = cookieStore.get(GITHUB_ACCESS_COOKIE)?.value;
  const token = (rawAccess ? readGithubAccessToken(rawAccess) : null) || process.env.GITHUB_TOKEN;

  const dbUser = token ? await resolveDbUserFromGithubToken(token) : null;
  const userId = dbUser?.id;

  const currentRetry = Math.min(Math.max(1, retryCount), MAX_RETRY_LIMIT);
  const runId = `retry-${Date.now()}-${testCase.id}`;

  const kafkaPayload: TestFailRetryPayload = {
    runId,
    testCaseId: testCase.id,
    testCaseTitle: testCase.title,
    testCase,
    owner,
    repo,
    branch,
    scanId,
    userId,
    failedStepIndex,
    failedStepAction: testCase.steps?.[failedStepIndex]?.action,
    failedStepSelector: testCase.steps?.[failedStepIndex]?.targetSelector,
    errorMessage,
    errorLogs,
    retryCount: currentRetry,
    maxRetries: MAX_RETRY_LIMIT,
    playwrightCommand: "npx playwright test --headed --project=chromium --workers=1",
    status: "PENDING_HEALING",
  };

  // 1. Publish event to Kafka topic test-fail-retry (non-blocking if broker is not connected)
  try {
    await sendKafkaMessage(KAFKA_TOPICS.TEST_FAIL_RETRY, kafkaPayload, runId);
  } catch (kafkaErr) {
    console.warn("[Kafka Producer] Could not dispatch to Kafka broker:", kafkaErr);
  }

  // 2. Perform Claude healing
  let healedData;
  try {
    healedData = await healFailingTestCaseWithClaude({
      testCase,
      failedStepIndex,
      errorMessage,
      errorLogs,
      retryCount: currentRetry,
      repo: owner && repo ? `${owner}/${repo}` : repo,
      branch,
      token: token || undefined,
    });
  } catch (healErr) {
    console.error("[Claude Healer] Error healing test:", healErr);
    return NextResponse.json(
      {
        error: healErr instanceof Error ? healErr.message : "Failed to heal test case with Claude",
        retryCount: currentRetry,
        maxRetries: MAX_RETRY_LIMIT,
      },
      { status: 502 },
    );
  }

  // 3. Construct updated test case with healed steps
  const updatedSteps = (healedData.healedSteps && healedData.healedSteps.length > 0)
    ? healedData.healedSteps.map((s, idx) => ({
        id: s.id || `step-healed-${Date.now()}-${idx}`,
        order: idx + 1,
        action: s.action,
        targetSelector: s.targetSelector,
        targetDescription: s.targetDescription,
        value: s.value,
        expectedValue: s.expectedValue,
        timeoutMs: s.timeoutMs || 1000,
        status: "pending" as const,
      }))
    : testCase.steps;

  const repairedTestCase: TestCase = {
    ...testCase,
    steps: updatedSteps,
    status: "draft",
    lastRunAt: new Date().toISOString(),
  };

  // 4. Save repaired test case in Qdrant (with userId)
  try {
    await indexTestCasesToQdrant([repairedTestCase], {
      userId,
      githubRepo: owner && repo ? `${owner}/${repo}` : undefined,
      owner,
      repo,
    });
  } catch (qdrantErr) {
    console.warn("[Qdrant] Could not update healed test in Qdrant:", qdrantErr);
  }

  // 5. Commit fixed test to the generated GitHub branch if credentials and repo details are present
  let filesWritten: string[] = [];
  let filesFailed: { path: string; error: string }[] = [];

  if (token && owner && repo && branch) {
    try {
      const octokit = new Octokit({ auth: token, userAgent: "QA-Studio" });
      const liveUrl = repairedTestCase.targetUrl?.trim() || "";
      const stamped = [applyLiveAppUrl(repairedTestCase, liveUrl)];
      const files = buildTestFiles(stamped, liveUrl);

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
            message: `Fix test failure (Retry ${currentRetry}/${MAX_RETRY_LIMIT}) - ${repairedTestCase.title}`,
            content: Buffer.from(file.content, "utf8").toString("base64"),
            sha: existingSha,
          });
          filesWritten.push(file.path);
        } catch (fileErr) {
          filesFailed.push({
            path: file.path,
            error: fileErr instanceof Error ? fileErr.message : "Failed to write file",
          });
        }
      }
    } catch (gitErr) {
      console.warn("[GitHub Commit] Failed to commit healed test to branch:", gitErr);
    }
  }

  return NextResponse.json({
    success: true,
    runId,
    retryCount: currentRetry,
    maxRetries: MAX_RETRY_LIMIT,
    canRetry: currentRetry < MAX_RETRY_LIMIT,
    diagnosis: healedData.diagnosis,
    recommendedFix: healedData.recommendedFix,
    healedTestCase: repairedTestCase,
    playwrightTestCode: healedData.playwrightTestCode,
    playwrightCommand: "npx playwright test --headed --project=chromium --workers=1",
    filesWritten,
    filesFailed,
  });
}
