import { NextResponse } from 'next/server';
import {
  GITHUB_STATE_COOKIE,
  callbackUrl,
  cookieOptions,
  createOAuthState,
  githubCredentials,
} from '@/lib/github-oauth';

export async function GET(request: Request) {
  const origin = new URL(request.url).origin;
  const { clientId } = githubCredentials();
  const state = createOAuthState();

  const authorize = new URL('https://github.com/login/oauth/authorize');
  authorize.searchParams.set('client_id', clientId);
  authorize.searchParams.set('redirect_uri', callbackUrl(origin));
  authorize.searchParams.set('scope', 'read:user user:email repo');
  authorize.searchParams.set('state', state);

  const response = NextResponse.redirect(authorize);
  response.cookies.set(GITHUB_STATE_COOKIE, state, cookieOptions(600));
  return response;
}
