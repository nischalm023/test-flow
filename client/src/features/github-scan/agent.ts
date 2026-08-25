import { ChatAnthropic } from "@langchain/anthropic";
import { ChatOpenRouter } from "@langchain/openrouter";
import { createAgent, modelFallbackMiddleware, tool } from "langchain";
import { Octokit } from "octokit";
import { z } from "zod";

const SKIP_PATH = /(^|\/)(node_modules|\.git|\.next|dist|build|coverage|\.turbo)(\/|$)/;
const MAX_FILES = 180;
const MAX_FILE_CHARS = 12_000;

function claudeModel() {
  return new ChatAnthropic({
    model: process.env.CHAT_MODEL || "claude-sonnet-4-20250514",
    apiKey: process.env.ANTHROPIC_API_KEY,
    maxTokens: 2048,
  });
}

function openRouterModel() {
  return new ChatOpenRouter({
    model: process.env.OPENROUTER_MODEL || "anthropic/claude-sonnet-4",
    apiKey: process.env.OPENROUTER_API_KEY,
    siteName: "TestFlow AI",
    // ponytail: OpenRouter reserves max_tokens against remaining credits (402 at 2048).
    maxTokens: 1024,
  });
}

function decodeContent(encoded: string, encoding?: string) {
  if (encoding === "base64") {
    return Buffer.from(encoded, "base64").toString("utf8");
  }
  return encoded;
}

export function createRepoScanAgent(token: string, owner: string, repo: string) {
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

  const hasClaude = Boolean(process.env.ANTHROPIC_API_KEY);
  const hasOpenRouter = Boolean(process.env.OPENROUTER_API_KEY);

  const model = hasClaude ? claudeModel() : openRouterModel();
  const middleware =
    hasClaude && hasOpenRouter ? [modelFallbackMiddleware(openRouterModel())] : [];

  return createAgent({
    model,
    tools: [getRepo, getLanguages, listFiles, readFile],
    middleware,
    systemPrompt: `You are a GitHub repository analyst.
Use the tools to inspect ${owner}/${repo}, then write a detailed markdown report covering:
- What the project is and who it is for
- Tech stack and languages
- Directory layout and important files
- How it looks like it runs / is configured
- Notable implementation details

Prefer README, package manifests, and a few representative source files over dumping the whole tree.
Write the final answer as readable markdown. Do not invent files you did not read.`,
  });
}
