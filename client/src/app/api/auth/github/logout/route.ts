import { NextResponse } from 'next/server';
import { GITHUB_ACCESS_COOKIE, cookieOptions } from '@/lib/github-oauth';

export async function POST() {
  const response = NextResponse.json({ ok: true });
  response.cookies.set(GITHUB_ACCESS_COOKIE, '', { ...cookieOptions(0), maxAge: 0 });
  return response;
}
