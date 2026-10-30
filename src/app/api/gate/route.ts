import { NextResponse, type NextRequest } from 'next/server';
import {
  ACCESS_COOKIE,
  ACCESS_COOKIE_MAX_AGE,
  GATE_PATH,
  accessToken,
  passwordMatches,
  safeNextPath,
} from '@/lib/access';

export async function POST(request: NextRequest) {
  const form = await request.formData();
  const submitted = form.get('password');
  const next = safeNextPath(form.get('next')?.toString());
  const expected = process.env.ACCESS_PASSWORD;

  if (!expected || typeof submitted !== 'string' || !passwordMatches(submitted, expected)) {
    const url = new URL(GATE_PATH, request.url);
    url.searchParams.set('error', '1');
    if (next !== '/') url.searchParams.set('next', next);
    return NextResponse.redirect(url, 303);
  }

  const response = NextResponse.redirect(new URL(next, request.url), 303);
  response.cookies.set(ACCESS_COOKIE, accessToken(expected), {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: ACCESS_COOKIE_MAX_AGE,
  });
  return response;
}
