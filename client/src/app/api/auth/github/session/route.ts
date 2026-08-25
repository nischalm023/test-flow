import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import {
  GITHUB_SESSION_COOKIE,
  cookieOptions,
  readSessionToken,
} from '@/lib/github-oauth';

export async function GET() {
  const cookieStore = await cookies();
  const token = cookieStore.get(GITHUB_SESSION_COOKIE)?.value;

  const user = token ? readSessionToken(token) : null;
  const response = NextResponse.json(
    user && token ? { user, accessToken: token } : { user: null },
  );
  response.cookies.set(GITHUB_SESSION_COOKIE, '', { ...cookieOptions(0), maxAge: 0 });
  return response;
}
