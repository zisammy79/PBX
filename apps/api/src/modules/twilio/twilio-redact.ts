export function redactSid(value: string | null | undefined): string | null {
  if (!value) return null;
  if (value.length <= 4) return '****';
  return `****${value.slice(-4)}`;
}

export function redactE164(value: string | null | undefined): string | null {
  if (!value) return null;
  if (value.length <= 6) return '****';
  return `${value.slice(0, 4)}****${value.slice(-2)}`;
}

export function redactUri(value: string | null | undefined): string | null {
  if (!value) return null;
  return value.replace(/:\/\/[^@]+@/, '://***@');
}
