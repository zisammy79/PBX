import { z } from 'zod';

export const ErrorCodeSchema = z.enum([
  'UNAUTHORIZED',
  'FORBIDDEN',
  'NOT_FOUND',
  'VALIDATION_ERROR',
  'CONFLICT',
  'RATE_LIMITED',
  'TENANT_SUSPENDED',
  'QUOTA_EXCEEDED',
  'ENTITLEMENT_LIMIT_REACHED',
  'INTERNAL_ERROR',
  'SERVICE_UNAVAILABLE',
]);

export type ErrorCode = z.infer<typeof ErrorCodeSchema>;

export const ApiErrorSchema = z.object({
  code: ErrorCodeSchema,
  message: z.string(),
  correlationId: z.string().uuid(),
  details: z.record(z.unknown()).optional(),
});

export type ApiError = z.infer<typeof ApiErrorSchema>;

export class AppError extends Error {
  constructor(
    public readonly code: ErrorCode,
    message: string,
    public readonly statusCode: number = 500,
    public readonly details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = 'AppError';
  }
}

export function tenantAccessDenied(): AppError {
  return new AppError('FORBIDDEN', 'Access to this tenant resource is denied', 403);
}

export function unauthorized(message = 'Authentication required'): AppError {
  return new AppError('UNAUTHORIZED', message, 401);
}

export function notFound(resource: string): AppError {
  return new AppError('NOT_FOUND', `${resource} not found`, 404);
}

export function conflict(message: string, details?: Record<string, unknown>): AppError {
  return new AppError('CONFLICT', message, 409, details);
}

export function rateLimited(retryAfterSeconds?: number): AppError {
  return new AppError(
    'RATE_LIMITED',
    'Rate limit exceeded',
    429,
    retryAfterSeconds !== undefined ? { retryAfterSeconds } : undefined,
  );
}

export function quotaExceeded(resource: string): AppError {
  return new AppError('QUOTA_EXCEEDED', `Quota exceeded for ${resource}`, 429);
}

export function entitlementLimitReached(
  dimension: string,
  used: number,
  limit: number,
): AppError {
  return new AppError('ENTITLEMENT_LIMIT_REACHED', `Limit reached for ${dimension}`, 409, {
    code: 'ENTITLEMENT_LIMIT_REACHED',
    dimension,
    used,
    limit,
  });
}

export function validationError(details: Record<string, unknown>): AppError {
  return new AppError('VALIDATION_ERROR', 'Request validation failed', 400, details);
}
