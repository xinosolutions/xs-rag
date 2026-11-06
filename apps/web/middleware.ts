import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';

export async function middleware(request: NextRequest) {
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

  // Handle /embed/:key and CSP frame-ancestors
  if (pathname.startsWith('/embed/')) {
    const key = pathname.slice('/embed/'.length).split('/')[0];
    if (!key) {
      return NextResponse.rewrite(new URL('/not-found', request.url), { status: 404 });
    }

    try {
      const res = await fetch(`${API_BASE}/public/widget/${key}/config`, {
        cache: 'no-store',
      });

      if (!res.ok) {
        return NextResponse.rewrite(new URL('/not-found', request.url), { status: 404 });
      }

      const config = await res.json();
      const origins =
        config.allowedOrigins && config.allowedOrigins.length > 0
          ? config.allowedOrigins.join(' ')
          : "'none'";

      const response = NextResponse.next();
      response.headers.set('Content-Security-Policy', `frame-ancestors ${origins};`);
      return response;
    } catch {
      return NextResponse.rewrite(new URL('/not-found', request.url), { status: 404 });
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/w', '/w/:path*', '/embed/:path*'],
};
