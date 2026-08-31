import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { ChatAnthropic } from "@langchain/anthropic";
import { ChatOpenRouter } from "@langchain/openrouter";
import { z } from "zod";
import type { TestCase } from "@/lib/types";
import { applyLiveAppUrl } from "@/lib/playwrightCodegen";
import { getRunStatus } from "@/lib/repoRunner";
import { indexTestCasesToQdrant } from "@/lib/indexTestCases";
import {
  GITHUB_ACCESS_COOKIE,
  readGithubAccessToken,
  resolveDbUserFromGithubToken,
} from "@/lib/github-oauth";

export const runtime = "nodejs";
export const maxDuration = 60;

const STEP_ACTIONS = [
  "click",
  "type",
  "select",
  "assert_visible",
  "assert_text",
  "assert_value",
  "wait",
  "hover",
  "scroll",
  "screenshot",
  "navigate",
] as const;

const stepSchema = z.object({
  action: z.enum(STEP_ACTIONS),
  targetSelector: z.string().describe("Best-effort CSS selector or description of the target element"),
  targetDescription: z.string(),
  value: z.string().optional(),
  expectedValue: z.string().optional(),
});

const testCaseSchema = z.object({
  title: z.string(),
  description: z.string(),
  priority: z.enum(["critical", "high", "medium", "low"]),
  category: z.enum([
    "Functional",
    "Smoke",
    "E2E",
    "Negative / Edge Case",
    "Accessibility",
    "Security",
    "Performance",
  ]),
  steps: z.array(stepSchema).min(2),
});

const responseSchema = z.object({
  testCases: z.array(testCaseSchema).min(3).max(20),
});

function claudeModel() {
  return new ChatAnthropic({
    model: process.env.CHAT_MODEL || "claude-sonnet-4-20250514",
    apiKey: process.env.ANTHROPIC_API_KEY,
  });
}

function openRouterModel() {
  return new ChatOpenRouter({
    model: process.env.OPENROUTER_MODEL || "anthropic/claude-sonnet-4",
    apiKey: process.env.OPENROUTER_API_KEY,
    siteName: "TestFlow AI",
  });
}

function nvidiaModel() {
  return new ChatOpenRouter({
    model: process.env.NVIDIA_MODEL || "nvidia/nemotron-3.5-lightning-30b-a3b",
    apiKey: process.env.NVIDIA_API_KEY,
    baseURL: "https://integrate.api.nvidia.com/v1",
    siteName: "TestFlow AI",
    maxTokens: 4096,
  });
}

function parseOwnerRepo(input: string): { owner: string; repo: string } | null {
  const [owner, repo] = input
    .trim()
    .replace(/^https?:\/\/github\.com\//, "")
    .replace(/\.git$/, "")
    .split("/");
  if (!owner || !repo) return null;
  return { owner, repo };
}

/** The repo runner boots the target app (preferring client/) on a local port.
 * Tests must navigate to that live host, never to the repo's GitHub page. */
function resolveLocalAppUrl(repo: string, explicitUrl?: string): string {
  const trimmed = explicitUrl?.trim();
  if (trimmed) return trimmed.replace(/\/$/, "");
  const run = getRunStatus();
  if (run.status !== "running" || !run.url) return "";
  const parsed = parseOwnerRepo(repo);
  if (!parsed) return run.url;
  if (run.owner === parsed.owner && run.repo === parsed.repo) return run.url;
  return run.url;
}

function candidateModels() {
  return [
    process.env.ANTHROPIC_API_KEY ? claudeModel() : null,
    process.env.OPENROUTER_API_KEY ? openRouterModel() : null,
    process.env.NVIDIA_API_KEY ? nvidiaModel() : null,
  ].filter((model): model is ReturnType<typeof claudeModel> => model != null);
}

export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as {
    repo?: string;
    structure?: string;
    flow?: string;
    prompt?: string;
    targetUrl?: string;
  };
  const repo = typeof body.repo === "string" ? body.repo.trim() : "";
  const structure = typeof body.structure === "string" ? body.structure.trim() : "";
  const flow = typeof body.flow === "string" ? body.flow.trim() : "";
  const prompt = typeof body.prompt === "string" ? body.prompt.trim() : "";
  const liveAppUrl = resolveLocalAppUrl(repo, typeof body.targetUrl === "string" ? body.targetUrl : "");

  if (!flow && !structure) {
    return NextResponse.json({ error: "Provide structure and/or flow to generate test cases from" }, { status: 400 });
  }

  const candidates = candidateModels();
  if (candidates.length === 0) {
    return NextResponse.json(
      { error: "No LLM provider configured (set ANTHROPIC_API_KEY, OPENROUTER_API_KEY, or NVIDIA_API_KEY)" },
      { status: 500 },
    );
  }

  const messages = [
    {
      role: "system" as const,
      content:
        "Act as a Senior QA Engineer with 10+ years of experience.\n\n" +
        "The user will select a GitHub repository. Use the QA branch that was generated with the name qa-studio/playwright-setup for all testing activities. Never modify the repository's default or main branch.\n\n" +
        "Run and validate the test cases against the selected repository, identify failing or incorrect test cases, and fix the test cases or testing code as needed. Do not change the application's production source code; all QA-related changes must remain isolated in the qa-studio/playwright-setup branch.\n\n" +
        "Your workflow should:\n" +
        "1. Use the qa-studio/playwright-setup branch for all QA work.\n" +
        "2. Execute the existing test suite and validate flows.\n" +
        "3. Analyze test failures and determine their root cause.\n" +
        "4. Fix broken or incorrect test cases without modifying the application's production code.\n" +
        "5. Re-run the tests to verify the fixes.\n" +
        "6. Provide a final QA report summarizing passed tests, failed tests (if any), fixes made, and any remaining issues or recommendations.\n\n" +
        "Produce comprehensive, runnable Playwright test cases (3 to 20) covering ALL major flows described: every happy path, key negative/edge case, and any auth or validation steps mentioned. " +
        "Steps must be concrete and ordered. Selectors are best-effort, preferring role/label/text based guesses over brittle CSS. " +
        "The first step of every test case MUST be action \"navigate\" with the target path (e.g. /login, /dashboard). Never leave navigate.value empty.",
    },
    {
      role: "user" as const,
      content: `Repository: ${repo || "(unspecified)"}
Live app URL (use this for every navigate step — this is the running client, not GitHub): ${liveAppUrl || "(unknown — still emit navigate with a path like /login, never an empty string)"}

User's testing goal:
"""
${prompt || "(none provided — cover the main flows below)"}
"""

Repository structure:
"""
${structure || "(not available)"}
"""

Extracted product/user flows:
"""
${flow || "(not available)"}
"""`,
    },
  ];

  let result: z.infer<typeof responseSchema> | null = null;
  let lastError: unknown = null;
  for (const candidate of candidates) {
    try {
      const model = candidate.withStructuredOutput(responseSchema, { name: "test_cases" });
      result = await model.invoke(messages);
      break;
    } catch (err) {
      lastError = err;
    }
  }

  if (!result) {
    const message = lastError instanceof Error ? lastError.message : "Failed to generate test cases";
    return NextResponse.json({ error: message }, { status: 502 });
  }

  try {
    const parsed = responseSchema.parse(result);
    const stamp = Date.now();
    const testCases: TestCase[] = parsed.testCases.map((tc, i) =>
      applyLiveAppUrl(
        {
          id: `tc-flow-${stamp}-${i}`,
          title: tc.title,
          description: tc.description,
          priority: tc.priority,
          category: tc.category,
          status: "draft",
          targetUrl: liveAppUrl,
          createdAt: new Date(stamp).toISOString(),
          steps: tc.steps.map((step, idx) => ({
            id: `step-flow-${stamp}-${i}-${idx}`,
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
      ),
    );

    const cookieStore = await cookies();
    const raw = cookieStore.get(GITHUB_ACCESS_COOKIE)?.value;
    const token = (raw ? readGithubAccessToken(raw) : null) || process.env.GITHUB_TOKEN;
    const dbUser = token ? await resolveDbUserFromGithubToken(token) : null;
    const parsedRepo = parseOwnerRepo(repo);

    let qdrant: Awaited<ReturnType<typeof indexTestCasesToQdrant>> | { saved: false; error: string };
    try {
      qdrant = await indexTestCasesToQdrant(testCases, {
        userId: dbUser?.id,
        githubRepo: repo,
        owner: parsedRepo?.owner,
        repo: parsedRepo?.repo,
      });
    } catch (err) {
      qdrant = {
        saved: false,
        error: err instanceof Error ? err.message : "Failed to save to Qdrant",
      };
    }

    return NextResponse.json({ testCases, qdrant });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to generate test cases";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
