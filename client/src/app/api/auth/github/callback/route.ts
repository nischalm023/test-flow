import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import {
  GITHUB_ACCESS_COOKIE,
  GITHUB_SESSION_COOKIE,
  GITHUB_STATE_COOKIE,
  cookieOptions,
  equalValue,
  exchangeGithubCode,
  fetchGithubUser,
  signGithubAccessToken,
  signSessionToken,
} from '@/lib/github-oauth';

export async function GET(request: Request) {
  const url = new URL(request.url);
  const origin = url.origin;
  const fail = () => NextResponse.redirect(`${origin}/login?error=github`);

  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');
  const cookieStore = await cookies();
  const expectedState = cookieStore.get(GITHUB_STATE_COOKIE)?.value;

  if (!code || !state || !expectedState || !equalValue(state, expectedState)) {
    return fail();
  }

  try {
    const githubToken = await exchangeGithubCode(code, origin);
    const user = await fetchGithubUser(githubToken);
    const sessionToken = signSessionToken(user);

    const response = NextResponse.redirect(`${origin}/login/github`);
    response.cookies.set(GITHUB_STATE_COOKIE, '', { ...cookieOptions(0), maxAge: 0 });
    response.cookies.set(
      GITHUB_SESSION_COOKIE,
      sessionToken,
      cookieOptions(120),
    );
    response.cookies.set(
      GITHUB_ACCESS_COOKIE,
      signGithubAccessToken(githubToken),
      cookieOptions(60 * 60 * 24 * 7),
    );
    return response;
  } catch {
    return fail();
  }
}
