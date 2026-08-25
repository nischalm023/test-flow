import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

const GITHUB_ACCESS_COOKIE = '';
const GITHUB_SESSION_COOKIE = '';

function hasGithubAuth(request: NextRequest) {
  return Boolean(
    request.cookies.get(GITHUB_ACCESS_COOKIE)?.value ||
      request.cookies.get(GITHUB_SESSION_COOKIE)?.value,
  );
}

export function proxy(request: NextRequest) {
  if (hasGithubAuth(request)) {
    return NextResponse.next();
  }

  if (request.nextUrl.pathname.startsWith('/api/')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const loginUrl = new URL('/login', request.url);
  const from = `${request.nextUrl.pathname}${request.nextUrl.search}`;
  if (from && from !== '/') {
    loginUrl.searchParams.set('from', from);
  }
  return NextResponse.redirect(loginUrl);
}

export const config = {
  matcher: ['/scan', '/scan/:path*', '/api/github/:path*'],
};
