import { cookies } from "next/headers";
import {
  GITHUB_ACCESS_COOKIE,
  readGithubAccessToken,
  resolveDbUserFromGithubToken,
} from "@/lib/github-oauth";
import {
  appendRepoScanTurn,
  buildRepoScanInput,
  createRepoScanAgent,
  repoScanSessionId,
} from "@/features/github-scan/agent";
import { generateAndIndexRepoReadme } from "@/features/github-scan/readme-indexer";

export const runtime = "nodejs";
export const maxDuration = 60;

function parseRepo(input: unknown): { owner: string; repo: string } | null {
  if (typeof input !== "string") return null;
  const [owner, repo] = input.trim().replace(/^https?:\/\/github\.com\//, "").replace(/\.git$/, "").split("/");
  if (!owner || !repo) return null;
  return { owner, repo };
}

function messageType(msg: object): string {
  const typed = msg as { getType?: () => string; type?: string };
  if (typeof typed.getType === "function") return typed.getType();
  return typed.type || "";
}

function chunkText(chunk: unknown): string {
  const msg = Array.isArray(chunk) ? chunk[0] : chunk;
  const meta = Array.isArray(chunk) ? chunk[1] : undefined;
  if (!msg || typeof msg !== "object") return "";
  const node = meta && typeof meta === "object" ? (meta as { langgraph_node?: string }).langgraph_node : undefined;
  if (node === "tools") return "";
  const kind = messageType(msg);
  if (kind && kind !== "ai") return "";
  const record = msg as {
    content?: unknown;
    text?: unknown;
    tool_call_chunks?: unknown[];
    tool_calls?: unknown[];
  };
  if (record.tool_call_chunks?.length || record.tool_calls?.length) return "";
  if (typeof record.text === "string" && record.text) return record.text;
  if (typeof record.content === "string") return record.content;
  if (!Array.isArray(record.content)) return "";
  return record.content
    .map((part) => {
      if (typeof part === "string") return part;
      if (part && typeof part === "object" && "text" in part) {
        const text = (part as { text?: unknown }).text;
        return typeof text === "string" ? text : "";
      }
      return "";
    })
    .join("");
}

export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as {
    repo?: string;
    owner?: string;
    name?: string;
    branch?: string;
    prompt?: string;
    mode?: "report" | "structure-flow" | "suggest-prompts";
  };
  const parsed = parseRepo(body.repo) ?? (body.owner && body.name ? { owner: body.owner, repo: body.name } : null);
  const branchName = body.branch?.trim() || "";
  const mode =
    body.mode === "structure-flow"
      ? "structure-flow"
      : body.mode === "suggest-prompts"
        ? "suggest-prompts"
        : "report";
  const userPrompt = typeof body.prompt === "string" ? body.prompt.trim() : "";
  if (!parsed) {
    return new Response("Provide repo as owner/name", { status: 400 });
  }

  const cookieStore = await cookies();
  const raw = cookieStore.get(GITHUB_ACCESS_COOKIE)?.value;
  const token = (raw ? readGithubAccessToken(raw) : null) || process.env.GITHUB_TOKEN;
  if (!token) {
    return new Response("GitHub auth required", { status: 401 });
  }
  if (!process.env.ANTHROPIC_API_KEY && !process.env.OPENROUTER_API_KEY) {
    return new Response("ANTHROPIC_API_KEY or OPENROUTER_API_KEY must be set", { status: 500 });
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const write = (text: string) => controller.enqueue(encoder.encode(text));
      try {
        const branchContext = branchName ? ` (branch: ${branchName})` : "";
        if (mode === "report") write(`Scanning ${parsed.owner}/${parsed.repo}${branchContext}…\n\n`);
        const sessionId = repoScanSessionId(parsed.owner, parsed.repo, mode);
        const agent = createRepoScanAgent(token, parsed.owner, parsed.repo, mode);
        const userContent =
          mode === "suggest-prompts"
            ? `Scan GitHub repo ${parsed.owner}/${parsed.repo}${branchContext} and output 5 to 7 specific  QA test prompt templates based on its actual routes, pages, and components as raw JSON array.`
            : mode === "structure-flow"
              ? `Scan GitHub repo ${parsed.owner}/${parsed.repo}${branchContext}.
The user described the project as:
"""
${userPrompt || "(no extra prompt — cover the main layout and flows)"}
"""
Use their prompt to decide which flows matter.`
              : `Scan GitHub repo ${parsed.owner}/${parsed.repo}${branchContext} and describe it in detail.`;
        const input = await buildRepoScanInput(sessionId, userContent);
        let assistantContent = "";
        const events = await agent.stream(input, { streamMode: "messages" });
        for await (const chunk of events) {
          if (req.signal.aborted) break;
          const text = chunkText(chunk);
          if (text) {
            assistantContent += text;
            write(text);
          }
        }
        await appendRepoScanTurn(sessionId, userContent, assistantContent);

        // Asynchronously generate/chunk README & scan report and publish to Kafka topic
        const dbUser = token ? await resolveDbUserFromGithubToken(token).catch(() => null) : null;
        void generateAndIndexRepoReadme({
          token,
          owner: parsed.owner,
          repo: parsed.repo,
          branch: branchName || undefined,
          userId: dbUser?.id,
          existingReport: assistantContent || undefined,
        }).catch((e) => console.error("[Scan Route] Failed to index README chunks to Kafka:", e));
      } catch (err) {
        const message = err instanceof Error ? err.message : "Scan failed";
        write(`\n\nScan error: ${message}`);
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      "X-Accel-Buffering": "no",
    },
  });
}
