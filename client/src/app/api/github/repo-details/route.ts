import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import {
  GITHUB_ACCESS_COOKIE,
  fetchRepositoryDetails,
  readGithubAccessToken,
} from '@/lib/github-oauth';

function parseRepo(input: string | null): { owner: string; repo: string } | null {
  if (!input) return null;
  const parts = input
    .trim()
    .replace(/^https?:\/\/github\.com\//, '')
    .replace(/\.git$/, '')
    .split('/');
  if (parts.length < 2 || !parts[0] || !parts[1]) return null;
  return { owner: parts[0], repo: parts[1] };
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const parsed = parseRepo(searchParams.get('repo'));

  if (!parsed) {
    return NextResponse.json({ error: 'A repo in owner/name format is required' }, { status: 400 });
  }

  const cookieStore = await cookies();
  const raw = cookieStore.get(GITHUB_ACCESS_COOKIE)?.value;
  const token = (raw ? readGithubAccessToken(raw) : null) || process.env.GITHUB_TOKEN;

  if (!token) {
    return NextResponse.json({ error: 'GitHub auth required' }, { status: 401 });
  }

  const result = await fetchRepositoryDetails(token, parsed.owner, parsed.repo);
  if (!result.success || !result.data) {
    return NextResponse.json({ error: result.error || 'Could not load repository details' }, { status: 502 });
  }

  // Return every field GitHub gives us, minus the boilerplate hypermedia
  // link templates (e.g. "issues_url": ".../issues{/number}") which are not
  // real details about the repo.
  const data = result.data as unknown as Record<string, unknown>;
  const details = Object.fromEntries(
    Object.entries(data).filter(([key]) => !key.endsWith('_url') || key === 'html_url'),
  );

  return NextResponse.json({ htmlUrl: data.html_url, details });
}
