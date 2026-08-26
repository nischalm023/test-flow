import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { Octokit } from "octokit";
import {
  GITHUB_ACCESS_COOKIE,
  readGithubAccessToken,
} from "@/lib/github-oauth";

function parseRepo(input: string | null): { owner: string; repo: string } | null {
  if (!input) return null;
  const parts = input
    .trim()
    .replace(/^https?:\/\/github\.com\//, "")
    .replace(/\.git$/, "")
    .split("/");
  if (parts.length < 2 || !parts[0] || !parts[1]) return null;
  return { owner: parts[0], repo: parts[1] };
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const repoParam = searchParams.get("repo");
  const ownerParam = searchParams.get("owner");
  
  let owner = ownerParam ?? "";
  let repo = "";
  
  if (repoParam?.includes("/")) {
    const parsed = parseRepo(repoParam);
    if (parsed) {
      owner = parsed.owner;
      repo = parsed.repo;
    }
  } else {
    repo = repoParam ?? "";
  }

  if (!owner || !repo) {
    return NextResponse.json({ error: "Owner and repo are required" }, { status: 400 });
  }

  const cookieStore = await cookies();
  const raw = cookieStore.get(GITHUB_ACCESS_COOKIE)?.value;
  const token = (raw ? readGithubAccessToken(raw) : null) || process.env.GITHUB_TOKEN;

  if (!token) {
    return NextResponse.json({ error: "GitHub auth required" }, { status: 401 });
  }

  try {
    const octokit = new Octokit({ auth: token, userAgent: "QA-Studio" });
    
    // Fetch repo details to get default branch
    const repoInfo = await octokit.rest.repos.get({ owner, repo }).catch(() => null);
    const defaultBranch = repoInfo?.data?.default_branch || "main";

    const branchList = await octokit.paginate(
      octokit.rest.repos.listBranches,
      { owner, repo, per_page: 100 }
    );
    const branchNames = branchList.map((b) => b.name);

    // Make sure default branch is first in the list
    const sortedBranches = [
      defaultBranch,
      ...branchNames.filter((b) => b !== defaultBranch),
    ];

    return NextResponse.json({
      branches: sortedBranches,
      defaultBranch,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to fetch branches";
    return NextResponse.json({ error: message, branches: ["main"] }, { status: 502 });
  }
}