import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import {
  GITHUB_ACCESS_COOKIE,
  readGithubAccessToken,
  resolveDbUserFromGithubToken,
} from "@/lib/github-oauth";
import { generateAndIndexRepoReadme } from "@/features/github-scan/readme-indexer";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as {
    repo?: string;
    branch?: string;
    report?: string;
  };

  const repoRaw = body.repo?.trim();
  if (!repoRaw || !repoRaw.includes("/")) {
    return NextResponse.json({ error: "Invalid repository format. Expected owner/repo." }, { status: 400 });
  }

  const [owner, repo] = repoRaw.replace(/^https?:\/\/github\.com\//, "").replace(/\.git$/, "").split("/");
  if (!owner || !repo) {
    return NextResponse.json({ error: "Invalid repo owner/name." }, { status: 400 });
  }

  const cookieStore = await cookies();
  const raw = cookieStore.get(GITHUB_ACCESS_COOKIE)?.value;
  const token = (raw ? readGithubAccessToken(raw) : null) || process.env.GITHUB_TOKEN;

  const dbUser = token ? await resolveDbUserFromGithubToken(token).catch(() => null) : null;

  try {
    const result = await generateAndIndexRepoReadme({
      token: token || undefined,
      owner,
      repo,
      branch: body.branch?.trim() || undefined,
      userId: dbUser?.id,
      existingReport: body.report?.trim() || undefined,
    });

    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to index README chunks";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
