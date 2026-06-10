type HeaderSource = {
  headers: Record<string, string | string[] | undefined>;
};

export function readIdempotencyKey(
  request: HeaderSource,
  bodyKey?: string,
): string | undefined {
  if (bodyKey) {
    return bodyKey;
  }

  const raw =
    request.headers['idempotency-key'] ??
    request.headers['Idempotency-Key'] ??
    request.headers['IDEMPOTENCY-KEY'];

  if (typeof raw === 'string' && raw.length > 0) {
    return raw;
  }

  if (Array.isArray(raw) && typeof raw[0] === 'string' && raw[0].length > 0) {
    return raw[0];
  }

  return undefined;
}
