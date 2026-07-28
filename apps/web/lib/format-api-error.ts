import { ApiError } from './api-client';

export function formatApiError(err: unknown): string {
  if (err instanceof ApiError) {
    if (err.details?.oauth) {
      const hint = err.details.hint ? ` ${String(err.details.hint)}` : '';
      return `${String(err.details.oauth)}.${hint}`;
    }
    if (err.details && typeof err.details === 'object') {
      const parts = Object.entries(err.details)
        .filter(([, v]) => v != null && String(v).trim() !== '')
        .map(([k, v]) => `${k}: ${String(v)}`);
      if (parts.length > 0) {
        return `${err.message} (${parts.join('; ')})`;
      }
    }
    return err.message;
  }
  return err instanceof Error ? err.message : 'Request failed';
}
