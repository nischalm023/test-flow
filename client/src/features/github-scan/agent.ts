import { ChatAnthropic } from "@langchain/anthropic";
import { ChatOpenRouter } from "@langchain/openrouter";
import { InMemoryChatMessageHistory } from "@langchain/core/chat_history";
import { createAgent, modelFallbackMiddleware, tool } from "langchain";
import { Octokit } from "octokit";
import { z } from "zod";
import {
  formatDocumentPoint,
  loadDocumentCollection,
  qdrantCollection,
  retrieveSimilarChunks,
  type ScrolledPoint,
} from "@/lib/qdrant";

const SKIP_PATH = /(^|\/)(node_modules|\.git|\.next|dist|build|coverage|\.turbo)(\/|$)/;
const MAX_FILES = 180;
const MAX_FILE_CHARS = 12_000;

const repoScanMessageHistories = new Map<string, InMemoryChatMessageHistory>();

/** In-memory conversation history keyed by repo scan session. */
export function getRepoScanMessageHistory(sessionId: string): InMemoryChatMessageHistory {
  let history = repoScanMessageHistories.get(sessionId);
  if (!history) {
    history = new InMemoryChatMessageHistory();
    repoScanMessageHistories.set(sessionId, history);
  }
  return history;
}

/** Stable session id for multi-turn scans on the same repo/mode. */
export function repoScanSessionId(
  owner: string,
  repo: string,
  mode?: "report" | "structure-flow" | "suggest-prompts",
): string {
  return `${owner}/${repo}${mode ? `:${mode}` : ""}`;
}

/** Merge persisted history with the next user turn for agent.invoke/stream input. */
export async function buildRepoScanInput(sessionId: string, userContent: string) {
  const history = await getRepoScanMessageHistory(sessionId).getMessages();
  return {
    messages: [...history, { role: "user" as const, content: userContent }],
  };
}

/** Persist a completed user/assistant turn after a scan finishes. */
export async function appendRepoScanTurn(
  sessionId: string,
  userContent: string,
  assistantContent: string,
): Promise<void> {
  const history = getRepoScanMessageHistory(sessionId);
  await history.addUserMessage(userContent);
  const trimmed = assistantContent.trim();
  if (trimmed) {
    await history.addAIMessage(trimmed);
  }
}

export async function clearRepoScanHistory(sessionId: string): Promise<void> {
  await getRepoScanMessageHistory(sessionId).clear();
}

export const REPO_TEST_GENERATION_PROMPT = `# Senior QA Engineer — Repository Test Case Generator & Validator

Act as a Senior QA Engineer with 10+ years of experience.

The user will select a GitHub repository. Use the QA branch that was generated with the name qa-studio/playwright-setup for all testing activities. Never modify the repository's default or main branch.

Run and validate the test cases against the selected repository, identify failing or incorrect test cases, and fix the test cases or testing code as needed. Do not change the application's production source code; all QA-related changes must remain isolated in the qa-studio/playwright-setup branch.

## Your Workflow:
1. **Target Branch Isolation**: Use the \`qa-studio/playwright-setup\` branch for all QA work. Never commit changes to the repository's default or main branch.
2. **Execute Existing Test Suite**: Execute the existing test suite and validate test cases against the selected repository.
3. **Failure Analysis & Root Cause Diagnosis**: Analyze test failures and determine their exact root cause.
4. **Fix Test Cases**: Fix broken or incorrect test cases without modifying the application's production code.
5. **Re-Run & Verification**: Re-run the tests to verify the fixes.
6. **Final QA Report**: Provide a final QA report summarizing passed tests, failed tests (if any), fixes made, and any remaining issues or recommendations.

## Step 1 — Repository Understanding
Before writing or modifying any tests, inspect the repo and report:
* Primary language(s) and framework(s)
* Existing test framework(s) in use (e.g. Playwright, Jest, Vitest, Cypress).
* Existing test file naming convention and folder structure (e.g. \`tests/\`, \`src/pages/\`, \`*.spec.ts\`)
* Package manager and how tests are run (check package.json scripts, CI config, etc.)
* Existing test coverage: which modules/files already have tests, which do not

## Step 2 — Test Plan & Generation
Produce a clear test plan covering:
* **Critical user flows**: Auth, core CRUD, API integrations, and edge cases
* **Strict Playwright locator priority**: \`getByRole\`, \`getByLabel\`, \`getByPlaceholder\`, \`getByTestId\`, \`getByText\`
* **Mocking**: Mock external backend API calls with \`page.route()\` for deterministic UI testing
* **Page Object Model**: Use clean Page Objects extending \`BasePage\`

## Step 3 — Output Format
For every generated/fixed test file, output:
1. **File path** (following repo convention e.g. \`tests/auth/login.spec.ts\`)
2. **Full test code**, ready to run — real imports, real mocks, no placeholders
3. **One-line description** of what the test validates

## Final QA Summary
End with:
* Total test files generated/verified, broken down by unit / integration / e2e
* Summary of passed tests, failed tests (if any), fixes made, and recommendations
* Commands to run the tests in the \`qa-studio/playwright-setup\` branch
`;
export const REPO_SECURITY_SCAN_PROMPT = REPO_TEST_GENERATION_PROMPT;

export function claudeModel(maxTokens = 4096) {
  return new ChatAnthropic({
    model: process.env.CHAT_MODEL || "claude-sonnet-4-20250514",
    apiKey: process.env.ANTHROPIC_API_KEY,
    maxTokens,
  });
}

export function openRouterModel(maxTokens = 4096) {
  return new ChatOpenRouter({
    model: process.env.OPENROUTER_MODEL || "anthropic/claude-sonnet-4",
    apiKey: process.env.OPENROUTER_API_KEY,
    siteName: "TestFlow AI",
    maxTokens,
  });
}

export function nvidiaModel(maxTokens = 4096) {
  // NVIDIA API is OpenAI-compatible; ChatOpenRouter with custom baseURL routes to NVIDIA NIM
  return new ChatOpenRouter({
    model: process.env.NVIDIA_MODEL || "nvidia/nemotron-3.5-lightning-30b-a3b",
    apiKey: process.env.NVIDIA_API_KEY || process.env.OPENROUTER_API_KEY,
    baseURL: process.env.NVIDIA_BASE_URL || (process.env.NVIDIA_API_KEY ? "https://integrate.api.nvidia.com/v1" : undefined),
    siteName: "TestFlow AI",
    maxTokens,
  });
}

function decodeContent(encoded: string, encoding?: string) {
  if (encoding === "base64") {
    return Buffer.from(encoded, "base64").toString("utf8");
  }
  return encoded;
}

function documentsToPromptBlock(points: ScrolledPoint[]): string {
  if (points.length === 0) return "(documents collection is empty)";
  return points
    .map((point, i) => {
      const payload = point.payload ?? {};
      const fields = Object.entries(payload)
        .map(([key, value]) => {
          const rendered =
            typeof value === "string" ? value : JSON.stringify(value, null, 2);
          return `${key}: ${rendered}`;
        })
        .join("\n");
      return `--- document ${i + 1} (id: ${point.id}) ---\n${fields}`;
    })
    .join("\n\n");
}

export function createRepoTools(octokit: Octokit, owner: string, repo: string) {
  const getRepo = tool(
    async () => {
      const { data } = await octokit.rest.repos.get({ owner, repo });
      return JSON.stringify({
        full_name: data.full_name,
        description: data.description,
        html_url: data.html_url,
        homepage: data.homepage,
        language: data.language,
        default_branch: data.default_branch,
        stars: data.stargazers_count,
        forks: data.forks_count,
        open_issues: data.open_issues_count,
        license: data.license?.spdx_id ?? null,
        topics: data.topics,
        private: data.private,
        created_at: data.created_at,
        updated_at: data.updated_at,
        pushed_at: data.pushed_at,
        size_kb: data.size,
      });
    },
    {
      name: "get_repo",
      description: "Get repository metadata: description, stars, language, license, default branch, dates.",
      schema: z.object({
        _: z.boolean().optional(),
      }),
    },
  );

  const getLanguages = tool(
    async () => {
      const { data } = await octokit.rest.repos.listLanguages({ owner, repo });
      return JSON.stringify(data);
    },
    {
      name: "get_languages",
      description: "Get language bytes breakdown for the repository.",
      schema: z.object({
        _: z.boolean().optional(),
      }),
    },
  );

  const listFiles = tool(
    async ({ branch }) => {
      const { data } = await octokit.rest.git.getTree({
        owner,
        repo,
        tree_sha: branch || "HEAD",
        recursive: "true",
      });
      const paths = (data.tree ?? [])
        .filter((item) => item.type === "blob" && item.path && !SKIP_PATH.test(item.path))
        .slice(0, MAX_FILES)
        .map((item) => item.path);
      return JSON.stringify({
        truncated: Boolean(data.truncated) || (data.tree?.length ?? 0) > MAX_FILES,
        files: paths,
      });
    },
    {
      name: "list_files",
      description: "List source file paths in the repo (skips node_modules, .git, build output).",
      schema: z.object({
        branch: z.string().optional().describe("Branch or tree SHA. Defaults to HEAD."),
      }),
    },
  );

  const readFile = tool(
    async ({ path }) => {
      const { data } = await octokit.rest.repos.getContent({ owner, repo, path });
      if (Array.isArray(data)) {
        return JSON.stringify({
          type: "dir",
          entries: data.map((entry) => ({ name: entry.name, type: entry.type, path: entry.path })),
        });
      }
      if (data.type !== "file" || typeof data.content !== "string") {
        return JSON.stringify({ type: data.type, path, note: "Not a readable file." });
      }
      if (data.size > 200_000) {
        return JSON.stringify({ path, size: data.size, note: "File too large to read." });
      }
      const text = decodeContent(data.content, data.encoding);
      return text.length > MAX_FILE_CHARS
        ? `${text.slice(0, MAX_FILE_CHARS)}\n\n[truncated ${text.length - MAX_FILE_CHARS} chars]`
        : text;
    },
    {
      name: "read_file",
      description: "Read a file (or list a directory) from the repository. Use for README, package.json, and key source files.",
      schema: z.object({
        path: z.string().describe("Path relative to the repository root."),
      }),
    },
  );

  const listIndexedDocuments = tool(
    async ({ githubRepo }) => {
      const repoKey = githubRepo?.trim() || `${owner}/${repo}`;
      const points = await loadDocumentCollection(repoKey);
      return JSON.stringify({
        collection: qdrantCollection(),
        githubRepo: repoKey,
        total: points.length,
        documents: points.map(formatDocumentPoint),
      });
    },
    {
      name: "list_indexed_documents",
      description:
        "List every point in the Qdrant documents collection (README/code chunks) for this repo. Use before generating Playwright tests so scenarios match indexed product docs.",
      schema: z.object({
        githubRepo: z.string().optional().describe("owner/name. Defaults to the target repository."),
      }),
    },
  );

  const searchIndexedDocuments = tool(
    async ({ query, limit }) => {
      const results = await retrieveSimilarChunks(query, {
        githubRepo: `${owner}/${repo}`,
        limit: limit ?? 8,
      });
      return JSON.stringify({
        collection: qdrantCollection(),
        query,
        count: results.length,
        results: results.map((r) => ({
          id: r.id,
          score: r.score,
          payload: r.payload ?? {},
        })),
      });
    },
    {
      name: "search_indexed_documents",
      description:
        "Semantic search over the Qdrant documents collection. Prefer this when the user prompt is specific.",
      schema: z.object({
        query: z.string().describe("Natural-language query against indexed README/code chunks."),
        limit: z.number().optional().describe("Max hits. Defaults to 8."),
      }),
    },
  );

  return { getRepo, getLanguages, listFiles, readFile, listIndexedDocuments, searchIndexedDocuments };
}

/**
 * NVIDIA Subagent: Dedicated to scanning the repository for architecture,
 * security vulnerabilities, dependency risks, code quality, and performance.
 */
export function createScanSubagent(
  token: string,
  owner: string,
  repo: string,
) {
  const octokit = new Octokit({ auth: token, userAgent: "TestFlow-AI" });
  const { getRepo, getLanguages, listFiles, readFile } = createRepoTools(octokit, owner, repo);

  const primaryModel = process.env.NVIDIA_API_KEY
    ? nvidiaModel()
    : process.env.ANTHROPIC_API_KEY
      ? claudeModel()
      : openRouterModel();

  const fallbacks = [
    process.env.ANTHROPIC_API_KEY ? claudeModel() : null,
    process.env.OPENROUTER_API_KEY ? openRouterModel() : null,
    process.env.NVIDIA_API_KEY ? nvidiaModel() : null,
  ].filter((model): model is ReturnType<typeof openRouterModel> => model != null && model !== primaryModel);

  return createAgent({
    model: primaryModel,
    tools: [getRepo, getLanguages, listFiles, readFile],
    middleware: fallbacks.length ? [modelFallbackMiddleware(...fallbacks)] : [],
    systemPrompt: `${REPO_SECURITY_SCAN_PROMPT}

Target Repository: ${owner}/${repo}
Inspect the repository using the provided tools (get_repo, get_languages, list_files, read_file).
Be thorough, precise, and follow all scan instructions and output requirements.`,
  });
}

/**
 * Claude Subagent / Agent: Dedicated to generating Playwright TypeScript test cases,
 * test suites, and page object models based on the repository structure and scan findings.
 */
export function createClaudeTestGeneratorAgent(
  token: string,
  owner: string,
  repo: string,
  mode: "report" | "structure-flow" | "suggest-prompts" = "suggest-prompts",
) {
  const octokit = new Octokit({ auth: token, userAgent: "TestFlow-AI" });
  const {
    getRepo,
    getLanguages,
    listFiles,
    readFile,
    listIndexedDocuments,
    searchIndexedDocuments,
  } = createRepoTools(octokit, owner, repo);

  // Subagent tool: Allows Claude to call the NVIDIA Security & Code Scan subagent directly
  const scanRepoSecurityAndQuality = tool(
    async ({ focus, branch }) => {
      const nvidiaScanner = createScanSubagent(token, owner, repo);
      const query = `Perform a comprehensive Security & Code Quality Scan on ${owner}/${repo}${branch ? ` (branch: ${branch})` : ""}.${focus ? ` Special focus area: ${focus}` : ""}`;
      const result = await nvidiaScanner.invoke({
        messages: [{ role: "user", content: query }],
      });
      const lastMsg = result.messages[result.messages.length - 1];
      return typeof lastMsg?.content === "string" ? lastMsg.content : JSON.stringify(lastMsg?.content ?? "");
    },
    {
      name: "scan_repo_security_and_quality",
      description: "Subagent tool (powered by  model) to execute a deep security, architecture, dependency, and code quality audit on the repository.",
      schema: z.object({
        focus: z.string().optional().describe("Optional focus area for the scan, e.g. 'auth', 'api-endpoints', 'payment'."),
        branch: z.string().optional().describe("Optional branch name or SHA."),
      }),
    },
  );

  const primaryModel = process.env.ANTHROPIC_API_KEY
    ? claudeModel()
    : process.env.OPENROUTER_API_KEY
      ? openRouterModel()
      : nvidiaModel();

  const fallbacks = [
    process.env.OPENROUTER_API_KEY ? openRouterModel() : null,
    process.env.NVIDIA_API_KEY ? nvidiaModel() : null,
    process.env.ANTHROPIC_API_KEY ? claudeModel() : null,
  ].filter((model): model is ReturnType<typeof openRouterModel> => model != null && model !== primaryModel);

  const systemPrompt =
    mode === "suggest-prompts"
      ? `You are a Principal QA Automation Architect and Playwright Test Specialist.
You collaborate with a specialized  Security & Code Quality Scan subagent (via the scan_repo_security_and_quality tool), repository inspection tools (get_repo, get_languages, list_files, read_file), and the Qdrant documents collection (list_indexed_documents, search_indexed_documents) to analyze ${owner}/${repo}.

Based on the actual project files, routes, components, APIs, and security/quality scan results found in ${owner}/${repo}, generate 5 to 7 specific, actionable Playwright test prompt templates tailored directly to what actually exists in ${owner}/${repo}.

Navigation & baseURL:
- Use routes and baseURL corresponding to the actual detected routes/pages in ${owner}/${repo} (e.g. \`await page.goto('/')\`, \`await page.goto('/login')\`, \`await page.goto('/dashboard')\`).

Follow Playwright best practices:
- Page Object Model architecture
- Strict locator priorities (getByRole, getByLabel, getByPlaceholder, getByTestId, getByText)
- API mocking using page.route()
- Web-first assertions (expect(locator).toBeVisible())
- Covering auth, critical user flows, edge cases, and security boundaries

Output ONLY a raw JSON array (no markdown fences, no surrounding text) with this schema:
[
  {
    "id": "case-id",
    "title": "Concise Scenario Title",
    "category": "Domain Category (e.g. Auth & Security, Checkout, Dashboard, API Mocking, Navigation)",
    "badge": "Badge (e.g. Core Flow, High Value, Detected, Auth)",
    "icon": "shield" | "sparkles" | "layers" | "workflow" | "zap" | "fileCode",
    "description": "1-2 sentence description referencing specific routes/features found in this repo",
    "prompt": "Detailed multi-step test instructions referencing real repo routes/pages/actions (e.g. starting with navigating to the relevant route)"
  }
]`
      : mode === "structure-flow"
        ? `You are a GitHub repository analyst and QA Architect.
Use the tools (and the  security scan subagent when appropriate) to inspect ${owner}/${repo}. The user will describe what they care about.

After inspecting, output ONLY these two blocks, in this order, with the exact markers:

<<<STRUCTURE>>>
An ASCII folder/page tree: directories, routes/pages, and important files.

<<<FLOW>>>
The product/user flows that match the user's prompt. Numbered steps. If the prompt is vague, cover the main happy paths.

Do not invent files you did not see via tools. No preamble, no closing commentary.`
        : `You are a Principal Software Architect and Lead QA Engineer working with a multi-model subagent system.
Use the  scan subagent (scan_repo_security_and_quality) and repository tools to audit ${owner}/${repo}.

Write a comprehensive, beautifully structured markdown report covering:
1. Executive Summary & Repository Overview (from  scan)
2. Security Vulnerabilities & Risk Analysis
3. Architecture, Directory Structure & Quality Review
4. Test Strategy & Playwright Test Case Recommendations:
   - Specific end-to-end test scenarios for critical user flows in this repository
   - Security & boundary test cases
   - Page Object Model structure suggestions
5. Prioritized Action Plan & Health Scores

Write the final answer as clean, readable markdown. Do not invent files you did not inspect.`;

  return createAgent({
    model: primaryModel,
    tools: [
      getRepo,
      getLanguages,
      listFiles,
      readFile,
      listIndexedDocuments,
      searchIndexedDocuments,
      scanRepoSecurityAndQuality,
    ],
    middleware: fallbacks.length ? [modelFallbackMiddleware(...fallbacks)] : [],
    systemPrompt,
  });
}

/**
 * Main export: Creates the multi-model repo scan agent with  scanner subagent
 * and Claude test case generator agent.
 */
export function createRepoScanAgent(
  token: string,
  owner: string,
  repo: string,
  mode: "report" | "structure-flow" | "suggest-prompts" = "report",
) {
  // If mode is "report", if  model is preferred for scanning, createScanSubagent can also be used directly,
  // or createClaudeTestGeneratorAgent with subagent access to  scanner.
  return createClaudeTestGeneratorAgent(token, owner, repo, mode);
}

const healResponseSchema = z.object({
  diagnosis: z.string().describe("Root cause explanation of the test failure"),
  recommendedFix: z.string().describe("What changes were made to fix the test"),
  healedSteps: z.array(
    z.object({
      id: z.string(),
      order: z.number(),
      action: z.enum([
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
      ]),
      targetSelector: z.string(),
      targetDescription: z.string(),
      value: z.string().optional(),
      expectedValue: z.string().optional(),
      timeoutMs: z.number().optional(),
    }),
  ),
  playwrightTestCode: z.string().describe("Complete, runnable fixed Playwright TypeScript spec"),
});

export type ClaudeHealResult = z.infer<typeof healResponseSchema>;

/**
 * Claude Test Healer: Analyzes Playwright test failure logs and repaired test case steps.
 * Follows Playwright best practices and strict locator priorities.
 */
export async function healFailingTestCaseWithClaude({
  testCase,
  failedStepIndex = 0,
  errorMessage,
  errorLogs = [],
  retryCount = 1,
  repo = "",
  branch = "",
  token,
}: {
  testCase: any;
  failedStepIndex?: number;
  errorMessage: string;
  errorLogs?: string[];
  retryCount?: number;
  repo?: string;
  branch?: string;
  token?: string;
}): Promise<ClaudeHealResult> {
  const model = process.env.ANTHROPIC_API_KEY
    ? claudeModel(4096)
    : process.env.OPENROUTER_API_KEY
      ? openRouterModel(4096)
      : nvidiaModel(4096);

  const structuredModel = model.withStructuredOutput(healResponseSchema, {
    name: "healed_test_case",
  });

  const failedStep = testCase.steps?.[failedStepIndex] || testCase.steps?.[0];

  const systemPrompt = `You are a Principal QA Automation Architect and Playwright Self-Healing Agent.
A Playwright test failed during execution (retry attempt ${retryCount}/3).
Your job is to diagnose the failure, fix the broken selector/action/assertion in the test case steps, and generate the repaired, runnable Playwright test code.

Playwright Locator Priority (STRICT):
1. getByRole with accessible name
2. getByLabel for form inputs
3. getByPlaceholder when no label exists
4. getByTestId (data-test-id / data-testid)
5. getByText for static text
6. Avoid brittle CSS or XPath where possible

Ensure the repaired steps can run without timing out or failing assertions.`;

  const userPrompt = `Repository: ${repo || "unknown"} (Branch: ${branch || "setup"})
Test Case Title: "${testCase.title || "Untitled"}"
Target URL: ${testCase.targetUrl || "http://localhost:4000"}

Failed Step (#${failedStepIndex + 1}):
Action: ${failedStep?.action || "unknown"}
Target Selector: ${failedStep?.targetSelector || "unknown"}
Target Description: ${failedStep?.targetDescription || "unknown"}
Value: ${failedStep?.value || "none"}
Expected Value: ${failedStep?.expectedValue || "none"}

Error Message:
${errorMessage || "Assertion / timeout error"}

Execution Logs:
${errorLogs.join("\n") || "(No detailed logs provided)"}

Current Test Steps:
${JSON.stringify(testCase.steps, null, 2)}

Provide a diagnosis, the repaired steps list, and the full fixed Playwright spec code.`;

  return await structuredModel.invoke([
    { role: "system", content: systemPrompt },
    { role: "user", content: userPrompt },
  ]);
}

export const README_GENERATION_PROMPT = `# Production README.md Generator

You are generating a comprehensive, production-grade README.md based entirely on the selected repository's actual codebase and project structure.

## CRITICAL RULES:
1. The README must be written strictly as if it belongs to the repository itself.
2. Do NOT mention MCP, Qdrant, vector databases, semantic chunks, AI analysis, subagents, prompt engineering, QA Studio, or the scanning process anywhere.
3. Base every single section strictly on the actual files, folders, configurations, scripts, dependencies, routes, and implementation found in the repository.
4. Do NOT invent features, routes, or implementation details that do not exist in the codebase.

## Sections to Include (when applicable to this codebase):
# <Project Title>

<Project Overview and Purpose>

## Features
- <Feature 1>
- <Feature 2>

## Tech Stack
- <Languages, frameworks, libraries, database, tooling>

## Repository Structure
\`\`\`
<ASCII tree of actual folders and key files>
\`\`\`

## Getting Started

### Prerequisites
- <Runtime version requirements (e.g. Node.js 20+, Python 3.11+, Docker, etc.)>

### Installation
\`\`\`bash
<Install command based on actual package manager e.g. pnpm install / npm install>
\`\`\`

### Environment Variables
<Table or list of required/optional environment variables found in .env.example or configuration files>

### Running Locally
\`\`\`bash
<Command to run development server e.g. npm run dev>
\`\`\`

### Available Scripts
- \`npm run dev\`: ...
- \`npm run build\`: ...
- \`npm run test\`: ...

## Application Architecture
- **Routing & Pages**: <Actual routes detected in the repository>
- **Components & Modules**: <Key components and folder modules>
- **API Integration**: <API client, endpoints, and backend connectivity>
- **State Management**: <State management library used (e.g. Zustand, Redux, Context)>
- **Authentication Flow**: <Authentication architecture (e.g. JWT, OAuth, cookies, sessions)>
- **Validation**: <Schema validation library and rules (e.g. Zod, Joi)>

## Testing
<Only if testing frameworks or test files are present in the repository>

## Deployment
<Only if deployment configurations exist (e.g. Dockerfile, docker-compose, Vercel config, CI/CD)>

## Contributing & License
<Contributing guide and license if present in repository>
`;

export interface CheckAndGenerateReadmeResult {
  exists: boolean;
  content: string;
  generated: boolean;
}

/**
 * Checks if README.md already exists on the selected repository.
 * - If README.md already exists: returns it as-is without modifying or generating.
 * - If README.md does NOT exist: inspects repo files and generates a comprehensive,
 *   native README.md without any mention of internal tools (MCP, Qdrant, etc.).
 */
export async function generateNativeRepoReadme({
  token,
  owner,
  repo,
  branch = "HEAD",
}: {
  token: string;
  owner: string;
  repo: string;
  branch?: string;
}): Promise<CheckAndGenerateReadmeResult> {
  const octokit = new Octokit({ auth: token, userAgent: "TestFlow-AI" });

  // 1. Check if README.md already exists on GitHub
  try {
    const { data } = await octokit.rest.repos.getReadme({
      owner,
      repo,
      ref: branch !== "HEAD" ? branch : undefined,
    });

    if (data && typeof data.content === "string") {
      const decoded = Buffer.from(data.content, "base64").toString("utf-8");
      if (decoded.trim().length > 20) {
        console.log(`[README] ℹ️ README.md already exists for ${owner}/${repo}. Preserving existing README.`);
        return {
          exists: true,
          content: decoded,
          generated: false,
        };
      }
    }
  } catch (err: unknown) {
    // If 404, README does not exist -> proceed to generate
    const status = (err as { status?: number })?.status;
    if (status && status !== 404) {
      console.warn(`[README] Notice checking readme for ${owner}/${repo}:`, err);
    }
  }

  console.log(`[README] 📄 README.md does not exist for ${owner}/${repo}. Generating comprehensive README from codebase...`);

  // 2. Gather actual codebase facts
  let repoMeta: Record<string, unknown> = {};
  try {
    const { data } = await octokit.rest.repos.get({ owner, repo });
    repoMeta = {
      name: data.name,
      description: data.description,
      language: data.language,
      default_branch: data.default_branch,
      topics: data.topics,
      homepage: data.homepage,
    };
  } catch { }

  // List actual source files
  let filePaths: string[] = [];
  try {
    const { data } = await octokit.rest.git.getTree({
      owner,
      repo,
      tree_sha: branch || "HEAD",
      recursive: "true",
    });
    filePaths = (data.tree ?? [])
      .filter((item) => item.type === "blob" && item.path && !SKIP_PATH.test(item.path))
      .slice(0, 100)
      .map((item) => item.path as string);
  } catch { }

  // Read key manifest files (e.g. package.json, requirements.txt, .env.example)
  const manifestSnippets: Record<string, string> = {};
  const manifestCandidates = [
    "package.json",
    ".env.example",
    "requirements.txt",
    "go.mod",
    "Cargo.toml",
    "docker-compose.yml",
    "docker-compose.yaml",
    "Dockerfile",
  ];

  for (const mf of manifestCandidates) {
    if (filePaths.includes(mf) || filePaths.some((p) => p.endsWith("/" + mf))) {
      try {
        const { data } = await octokit.rest.repos.getContent({ owner, repo, path: mf, ref: branch });
        if (!Array.isArray(data) && data.type === "file" && typeof data.content === "string") {
          manifestSnippets[mf] = Buffer.from(data.content, "base64").toString("utf-8").slice(0, 4000);
        }
      } catch { }
    }
  }

  const model = process.env.ANTHROPIC_API_KEY
    ? claudeModel(4096)
    : process.env.OPENROUTER_API_KEY
      ? openRouterModel(4096)
      : nvidiaModel(4096);

  const prompt = `${README_GENERATION_PROMPT}

Target Repository: ${owner}/${repo}
Branch: ${branch}

Repository Metadata:
${JSON.stringify(repoMeta, null, 2)}

Actual Source Files (${filePaths.length} files detected):
${filePaths.slice(0, 80).join("\n")}

Manifest and Configuration Files:
${Object.entries(manifestSnippets)
      .map(([path, content]) => `--- ${path} ---\n${content}`)
      .join("\n\n")}

Generate the complete, professional README.md for this repository now.`;

  const response = await model.invoke([
    { role: "user", content: prompt },
  ]);

  const generatedContent =
    typeof response.content === "string"
      ? response.content.replace(/^```markdown\n?/i, "").replace(/\n?```$/i, "").trim()
      : String(response.content || "").trim();

  return {
    exists: false,
    content: generatedContent,
    generated: true,
  };
}

export const PLAYWRIGHT_TEST_GENERATOR_PROMPT = `You are the Playwright Test Generator.

Take the indexed documents (README/code chunks from the Qdrant documents collection) plus the user's testing goal and produce ONE runnable Playwright TypeScript test case.

Framework rules:
- Import test and expect from src/fixtures/base.ts — never from @playwright/test
- Page Object Model: locators live in page objects extending BasePage; specs do not call page.getByRole directly when a page object exists
- Locator priority: getByRole, getByLabel, getByPlaceholder, getByTestId, getByText. Do not invent CSS/XPath unless nothing else exists
- Mock client API calls with page.route() — never hit a real backend
- Web-first assertions only. No waitForTimeout, no waitForSelector
- File path mirrors the app URL (kebab-case, ending in .spec.ts)
- Tag the test title with @smoke, @regression, or @critical
- First step MUST be action "navigate" with a real path (e.g. /login)
- Do not invent routes, pages, or features that are not in the documents or user prompt

playwrightTestCode must be a complete spec file, ready to run.`;

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

const generatedPlaywrightTestSchema = z.object({
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
  filePath: z.string().describe("Spec path, e.g. tests/auth/login.spec.ts"),
  steps: z.array(
    z.object({
      action: z.enum(STEP_ACTIONS),
      targetSelector: z.string(),
      targetDescription: z.string(),
      value: z.string().optional(),
      expectedValue: z.string().optional(),
    }),
  ).min(2),
  playwrightTestCode: z.string().describe("Complete Playwright TypeScript spec"),
});

export type GeneratedPlaywrightTest = z.infer<typeof generatedPlaywrightTestSchema>;

export async function generatePlaywrightTestFromDocuments({
  owner,
  repo,
  prompt,
  targetUrl = "",
}: {
  owner: string;
  repo: string;
  prompt?: string;
  targetUrl?: string;
}): Promise<{
  test: GeneratedPlaywrightTest;
  documents: Array<Record<string, unknown>>;
  collection: string;
}> {
  const githubRepo = `${owner}/${repo}`;
  const collection = qdrantCollection();
  const points = await loadDocumentCollection(githubRepo);
  const documents = points.map(formatDocumentPoint);

  const candidates = [
    process.env.ANTHROPIC_API_KEY ? claudeModel(4096) : null,
    process.env.OPENROUTER_API_KEY ? openRouterModel(4096) : null,
    process.env.NVIDIA_API_KEY ? nvidiaModel(4096) : null,
  ].filter((model): model is ReturnType<typeof claudeModel> => model != null);

  if (candidates.length === 0) {
    throw new Error("No LLM provider configured (set ANTHROPIC_API_KEY, OPENROUTER_API_KEY, or NVIDIA_API_KEY)");
  }

  const messages = [
    { role: "system" as const, content: PLAYWRIGHT_TEST_GENERATOR_PROMPT },
    {
      role: "user" as const,
      content: `Repository: ${githubRepo}
Live app URL: ${targetUrl || "(unknown — still emit navigate with a path like /login)"}

User testing goal:
"""
${prompt?.trim() || "Cover the primary user flow described in the indexed documents."}
"""

Qdrant collection "${collection}" (${points.length} points):
${documentsToPromptBlock(points)}

Generate one Playwright test case grounded in these documents.`,
    },
  ];

  let lastError: unknown = null;
  for (const candidate of candidates) {
    try {
      const model = candidate.withStructuredOutput(generatedPlaywrightTestSchema, {
        name: "playwright_test_case",
      });
      const test = await model.invoke(messages);
      return { test, documents, collection };
    } catch (err) {
      lastError = err;
    }
  }

  throw lastError instanceof Error
    ? lastError
    : new Error("Failed to generate Playwright test from documents");
}



