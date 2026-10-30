import { NextResponse, type NextRequest } from 'next/server';
import { ACCESS_COOKIE, GATE_PATH, decideAccess, safeNextPath } from '@/lib/access';

export function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  const decision = decideAccess({
    pathname,
    cookie: request.cookies.get(ACCESS_COOKIE)?.value,
    password: process.env.ACCESS_PASSWORD,
    isProduction: process.env.NODE_ENV === 'production',
  });

  switch (decision) {
    case 'allow':
      return NextResponse.next();
    case 'to_gate': {
      const url = new URL(GATE_PATH, request.url);
      // Keep the target (and any ?as= / ?asOf= deep link) across the password page.
      if (pathname !== '/' || search) url.searchParams.set('next', pathname + search);
      return NextResponse.redirect(url);
    }
    case 'to_next':
      return NextResponse.redirect(
        new URL(safeNextPath(request.nextUrl.searchParams.get('next')), request.url),
      );
    case 'unconfigured':
      return new NextResponse('Access is not configured.', { status: 503 });
  }
}

// API routes stay behind the gate; only build assets and the favicon are public.
export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
