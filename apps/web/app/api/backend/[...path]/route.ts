import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { backendUrl, TOKEN_COOKIE } from '@/lib/server-config';

function isRecordingContentPath(pathSegments: string[]): boolean {
  const last = pathSegments.length - 1;
  return last >= 1 && pathSegments[last] === 'content' && pathSegments[last - 1] === 'recordings';
}

function isBinaryContentType(contentType: string | null): boolean {
  if (!contentType) return false;
  return contentType.startsWith('audio/') || contentType === 'application/octet-stream';
}

function passthroughHeaders(source: Headers): Headers {
  const headers = new Headers();
  for (const name of ['content-type', 'content-length', 'accept-ranges', 'content-range'] as const) {
    const value = source.get(name);
    if (value) headers.set(name, value);
  }
  return headers;
}

async function proxy(request: Request, pathSegments: string[]) {
  const token = (await cookies()).get(TOKEN_COOKIE)?.value;
  if (!token) {
    return NextResponse.json({ code: 'UNAUTHORIZED', message: 'Authentication required' }, { status: 401 });
  }

  const path = pathSegments.join('/');
  const url = new URL(request.url);
  const target = `${backendUrl(`/${path}`)}${url.search}`;

  const headers = new Headers();
  headers.set('Authorization', `Bearer ${token}`);
  headers.set('Accept', request.headers.get('accept') ?? 'application/json');
  const tenantId = request.headers.get('x-tenant-id');
  if (tenantId) headers.set('X-Tenant-Id', tenantId);
  const contentType = request.headers.get('content-type');
  if (contentType) headers.set('Content-Type', contentType);
  const idempotencyKey = request.headers.get('idempotency-key');
  if (idempotencyKey) headers.set('Idempotency-Key', idempotencyKey);
  const range = request.headers.get('range');
  if (range) headers.set('Range', range);

  const init: RequestInit = {
    method: request.method,
    headers,
    cache: 'no-store',
  };
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    init.body = await request.text();
  }

  const res = await fetch(target, init);
  const responseContentType = res.headers.get('content-type');
  const binary =
    isRecordingContentPath(pathSegments) || isBinaryContentType(responseContentType);

  if (binary) {
    const buffer = await res.arrayBuffer();
    return new NextResponse(buffer, {
      status: res.status,
      headers: passthroughHeaders(res.headers),
    });
  }

  const text = await res.text();
  return new NextResponse(text, {
    status: res.status,
    headers: { 'Content-Type': responseContentType ?? 'application/json' },
  });
}

export async function GET(request: Request, ctx: { params: Promise<{ path: string[] }> }) {
  const { path } = await ctx.params;
  return proxy(request, path);
}

export async function POST(request: Request, ctx: { params: Promise<{ path: string[] }> }) {
  const { path } = await ctx.params;
  return proxy(request, path);
}

export async function PATCH(request: Request, ctx: { params: Promise<{ path: string[] }> }) {
  const { path } = await ctx.params;
  return proxy(request, path);
}

export async function DELETE(request: Request, ctx: { params: Promise<{ path: string[] }> }) {
  const { path } = await ctx.params;
  return proxy(request, path);
}
