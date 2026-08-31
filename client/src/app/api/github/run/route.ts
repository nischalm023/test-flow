import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import {
  GITHUB_ACCESS_COOKIE,
  readGithubAccessToken,
} from "@/lib/github-oauth";
import { startRun, getRunStatus } from "@/lib/repoRunner";

export const runtime = "nodejs";

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

export async function GET() {
  return NextResponse.json(getRunStatus());
}

export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as {
    repo?: string;
    branch?: string;
  };
  const parsed = parseRepo(body.repo);
  const branch = body.branch?.trim();
  if (!parsed || !branch) {
    return NextResponse.json({ error: "Provide repo as owner/name and a branch" }, { status: 400 });
  }

  const cookieStore = await cookies();
  const raw = cookieStore.get(GITHUB_ACCESS_COOKIE)?.value;
  const token = (raw ? readGithubAccessToken(raw) : null) || process.env.GITHUB_TOKEN;
  if (!token) {
    return NextResponse.json({ error: "GitHub auth required" }, { status: 401 });
  }

  try {
    const state = await startRun({ owner: parsed.owner, repo: parsed.repo, branch, token });
    return NextResponse.json(state);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to start run";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
