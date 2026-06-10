import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { backendUrl, TOKEN_COOKIE } from '@/lib/server-config';

export async function GET() {
  const token = (await cookies()).get(TOKEN_COOKIE)?.value;
  if (!token) {
    return NextResponse.json({ message: 'Not authenticated' }, { status: 401 });
  }
  const res = await fetch(backendUrl('/auth/me'), {
    headers: { Authorization: `Bearer ${token}` },
    cache: 'no-store',
  });
  const payload = await res.json().catch(() => ({}));
  return NextResponse.json(payload, { status: res.status });
}
