import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { GITHUB_ACCESS_COOKIE, GITHUB_SESSION_COOKIE } from '@/lib/github-oauth-cookies';

function hasGithubAuth(request: NextRequest): boolean {
  return Boolean(
    request.cookies.get(GITHUB_ACCESS_COOKIE)?.value ||
    request.cookies.get(GITHUB_SESSION_COOKIE)?.value,
  );
}

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Allow public auth routes
  const publicPaths = ['/login', '/register', '/api/auth'];
  const isPublic = publicPaths.some(
    (path) => pathname === path || pathname.startsWith(`${path}/`),
  );

  if (isPublic) {
    return NextResponse.next();
  }

  // If user is authorized via GitHub, allow access to dashboard / protected routes
  if (hasGithubAuth(request)) {
    return NextResponse.next();
  }

  // For API routes, return 401 Unauthorized
  if (pathname.startsWith('/api/')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Redirect unauthorized users to login page
  const loginUrl = new URL('/login', request.url);
  const from = `${pathname}${request.nextUrl.search}`;
  if (from && from !== '/') {
    loginUrl.searchParams.set('from', from);
  }
  return NextResponse.redirect(loginUrl);
}

export const config = {
  matcher: [
    /*
     * Match all request paths except:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - public files with extensions (.svg, .png, etc.)
     */
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};

export default middleware;
