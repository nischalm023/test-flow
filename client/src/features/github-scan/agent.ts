import { ChatAnthropic } from "@langchain/anthropic";
import { ChatOpenRouter } from "@langchain/openrouter";
import { createAgent, modelFallbackMiddleware, tool } from "langchain";
import { Octokit } from "octokit";
import { z } from "zod";
const SKIP_PATH = /(^|\/)(node_modules|\.git|\.next|dist|build|coverage|\.turbo)(\/|$)/;
const MAX_FILES = 180;
const MAX_FILE_CHARS = 12_000;

function claudeModel(maxTokens = 2048) {
  return new ChatAnthropic({
    model: process.env.CHAT_MODEL || "claude-sonnet-4-20250514",
    apiKey: process.env.ANTHROPIC_API_KEY,
    maxTokens,
  });
}

function openRouterModel() {
  return new ChatOpenRouter({
    model: process.env.OPENROUTER_MODEL || "anthropic/claude-sonnet-4",
    apiKey: process.env.OPENROUTER_API_KEY,
    siteName: "TestFlow AI",
    // ponytail: OpenRouter reserves max_tokens against remaining credits (402 at 2048).
    maxTokens: 2048,
  });
}

function nvidiaModel() {
  // ponytail: NVIDIA's API is OpenAI-compatible; ChatOpenRouter already speaks that format.
  return new ChatOpenRouter({
    model: process.env.NVIDIA_MODEL || "nvidia/nemotron-3.5-lightning-30b-a3b",
    apiKey: process.env.NVIDIA_API_KEY,
    baseURL: "https://integrate.api.nvidia.com/v1",
    siteName: "TestFlow AI",
    maxTokens: 4096,
  });
}


function decodeContent(encoded: string, encoding?: string) {
  if (encoding === "base64") {
    return Buffer.from(encoded, "base64").toString("utf8");
  }
  return encoded;
}

export function createRepoScanAgent(
  token: string,
  owner: string,
  repo: string,
  mode: "report" | "structure-flow" | "suggest-prompts" = "report",
) {
  const octokit = new Octokit({ auth: token, userAgent: "TestFlow-AI" });

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

  const fallbacks = [
    process.env.OPENROUTER_API_KEY ? openRouterModel() : null,
    process.env.NVIDIA_API_KEY ? nvidiaModel() : null,
  ].filter((model): model is ReturnType<typeof openRouterModel> => model != null);

  const systemPrompt =
    mode === "suggest-prompts"
      ? `You are a GitHub QA architect and Playwright test specialist.
Inspect ${owner}/${repo} using the tools (getRepo, listFiles, readFile for package.json, README, router/pages/app directories, api routes).

Based on the actual project files, routes, components, and libraries found in this repository, generate 5 to 7 specific, actionable Playwright test prompt templates tailored directly to what actually exists in ${owner}/${repo}.

Output ONLY a raw JSON array (no markdown fences, no surrounding text) with this schema:
[
  {
    "id": "case-id",
    "title": "Concise Scenario Title",
    "category": "Domain Category (e.g. Auth & Security, Checkout, Dashboard, API Mocking, Navigation)",
    "badge": "Badge (e.g. Core Flow, High Value, Detected, Auth)",
    "icon": "shield" | "sparkles" | "layers" | "workflow" | "zap" | "fileCode",
    "description": "1-2 sentence description referencing specific routes/features found in this repo",
    "prompt": "Detailed multi-step test instructions referencing real repo routes/pages/actions"
  }
]`
      : mode === "structure-flow"
        ? `You are a GitHub repository analyst.
Use the tools to inspect ${owner}/${repo}. The user will describe what they care about.

After inspecting, output ONLY these two blocks, in this order, with the exact markers:

<<<STRUCTURE>>>
An ASCII folder/page tree: directories, routes/pages, and important files.

<<<FLOW>>>
The product/user flows that match the user's prompt. Numbered steps. If the prompt is vague, cover the main happy paths.

Do not invent files you did not see via tools. No preamble, no closing commentary.`
        : `You are a GitHub repository analyst.
Use the tools to inspect ${owner}/${repo}, then write a detailed markdown report covering:
- What the project is and who it is for
- Tech stack and languages
- Directory layout and important files
- How it looks like it runs / is configured
- Notable implementation details

Prefer README, package manifests, and a few representative source files over dumping the whole tree.
Write the final answer as readable markdown. Do not invent files you did not read.`;

  return createAgent({
    model: claudeModel(mode === "structure-flow" || mode === "suggest-prompts" ? 4096 : 2048),
    tools: [getRepo, getLanguages, listFiles, readFile],
    middleware: fallbacks.length ? [modelFallbackMiddleware(...fallbacks)] : [],
    systemPrompt,
  });
}
