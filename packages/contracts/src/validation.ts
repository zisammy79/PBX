import type { ZodIssue } from 'zod';

/** Normalize tenant slug: lowercase, hyphens, no leading/trailing dashes. */
export function normalizeTenantSlug(raw: string): string {
  const normalized = raw
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/-{2,}/g, '-')
    .replace(/^-+|-+$/g, '');

  if (normalized.length <= 63) {
    return normalized;
  }

  const trimmed = normalized.slice(0, 63).replace(/-+$/g, '');
  return trimmed.length >= 2 ? trimmed : normalized.slice(0, 63);
}

export function formatZodIssues(issues: ZodIssue[]): string {
  if (issues.length === 0) {
    return 'Invalid request parameters';
  }

  const labels: Record<string, string> = {
    name: 'Name',
    slug: 'Slug',
    ownerEmail: 'Owner email',
    ownerDisplayName: 'Owner name',
    email: 'Email',
    password: 'Password',
  };

  return issues
    .map((issue) => {
      const field = issue.path[0];
      const label = typeof field === 'string' ? labels[field] ?? field : 'Field';
      const msg = issue.message === 'Required' ? 'is required' : issue.message;
      return `${label}: ${msg}`;
    })
    .join(' · ');
}
