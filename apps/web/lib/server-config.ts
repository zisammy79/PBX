const API_URL = process.env.PUBLIC_API_URL ?? process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';
export const TOKEN_COOKIE = 'pbx_token';

export function backendUrl(path: string): string {
  const base = API_URL.replace(/\/$/, '');
  const normalized = path.startsWith('/') ? path : `/${path}`;
  return `${base}/api/v1${normalized}`;
}
