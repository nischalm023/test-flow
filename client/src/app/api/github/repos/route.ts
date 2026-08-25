import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import {
  GITHUB_ACCESS_COOKIE,
  fetchGithubRepos,
  readGithubAccessToken,
} from '@/lib/github-oauth';

export async function GET() {
  const cookieStore = await cookies();
  const raw = cookieStore.get(GITHUB_ACCESS_COOKIE)?.value;
  const token = raw ? readGithubAccessToken(raw) : null;

  if (!token) {
    return NextResponse.json({ repos: [] }, { status: 401 });
  }

  try {
    const repos = await fetchGithubRepos(token);
    return NextResponse.json({ repos });
  } catch {
    return NextResponse.json({ repos: [] }, { status: 502 });
  }
}
