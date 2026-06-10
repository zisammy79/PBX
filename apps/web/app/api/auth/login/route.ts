import { NextResponse } from 'next/server';
import { backendUrl, TOKEN_COOKIE } from '@/lib/server-config';

export async function POST(request: Request) {
  const body = await request.json();
  const res = await fetch(backendUrl('/auth/login'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const payload = await res.json().catch(() => ({}));
  if (!res.ok) {
    return NextResponse.json(payload, { status: res.status });
  }

  const response = NextResponse.json({
    user: payload.user,
    mustChangePassword: payload.mustChangePassword,
  });
  response.cookies.set(TOKEN_COOKIE, payload.accessToken, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: payload.expiresIn ?? 900,
  });
  return response;
}
