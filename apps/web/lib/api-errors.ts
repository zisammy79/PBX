import { formatZodIssues } from '@pbx/contracts';

export function apiErrorMessage(
  message: string,
  details?: Record<string, unknown>,
): string {
  const issues = details?.issues;
  if (Array.isArray(issues) && issues.length > 0) {
    return formatZodIssues(issues as Parameters<typeof formatZodIssues>[0]);
  }
  return message;
}
