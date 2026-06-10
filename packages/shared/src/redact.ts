const SECRET_PATTERNS = [
  /password["']?\s*[:=]\s*["']?[^"'\s]+/gi,
  /api[_-]?key["']?\s*[:=]\s*["']?[^"'\s]+/gi,
  /authorization["']?\s*[:=]\s*["']?[^"'\s]+/gi,
  /bearer\s+[a-zA-Z0-9\-._~+/]+=*/gi,
  /secret["']?\s*[:=]\s*["']?[^"'\s]+/gi,
];

export function redactSecrets(input: string): string {
  let result = input;
  for (const pattern of SECRET_PATTERNS) {
    result = result.replace(pattern, '[REDACTED]');
  }
  return result;
}

export function redactObject<T extends Record<string, unknown>>(
  obj: T,
  keys: string[] = ['password', 'secret', 'apiKey', 'token', 'authorization'],
): T {
  const clone = { ...obj };
  for (const key of Object.keys(clone)) {
    if (keys.some((k) => key.toLowerCase().includes(k.toLowerCase()))) {
      (clone as Record<string, unknown>)[key] = '[REDACTED]';
    }
  }
  return clone;
}
