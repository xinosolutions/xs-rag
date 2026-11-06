import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export function middleware(request: NextRequest) {
  const { pathname, search } = request.nextUrl;

  // Protect /w and /w/**
  if (pathname === '/w' || pathname.startsWith('/w/')) {
    const accessToken = request.cookies.get('xs_access')?.value;
    if (!accessToken) {
      const loginUrl = new URL('/login', request.url);
      loginUrl.searchParams.set('next', `${pathname}${search}`);
      return NextResponse.redirect(loginUrl);
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/w', '/w/:path*'],
};
