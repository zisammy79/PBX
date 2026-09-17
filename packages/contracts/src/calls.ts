import { z } from 'zod';
import { PaginationQuerySchema } from './pagination.js';

export const CallDirectionSchema = z.enum(['inbound', 'outbound', 'internal']);
export type CallDirection = z.infer<typeof CallDirectionSchema>;

const isoDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

export const CallListQuerySchema = PaginationQuerySchema.extend({
  direction: CallDirectionSchema.optional(),
  status: z.string().max(32).optional(),
  /** Inclusive range start (ISO datetime). Backward compatible. */
  from: z.string().datetime().optional(),
  /** Inclusive range end (ISO datetime). Backward compatible. */
  to: z.string().datetime().optional(),
  /** Inclusive range start (ISO date, UTC day boundary). 1com-style alias. */
  startDate: isoDateSchema.optional(),
  /** Inclusive range end (ISO date, UTC day boundary). 1com-style alias. */
  endDate: isoDateSchema.optional(),
  callerNumber: z.string().max(32).optional(),
  calleeNumber: z.string().max(32).optional(),
  /** Partial match on caller (1com "source"). Falls back to callerNumber when both set uses callerNumber. */
  source: z.string().max(32).optional(),
  /** Partial match on callee (1com "destination"). Falls back to calleeNumber when both set uses calleeNumber. */
  destination: z.string().max(32).optional(),
  extensionId: z.string().uuid().optional(),
  /** Partial match on metadata.did or callee/caller for inbound/outbound DID routing. */
  did: z.string().max(32).optional(),
  minDurationSeconds: z.coerce.number().int().min(0).optional(),
  maxDurationSeconds: z.coerce.number().int().min(0).optional(),
});

export type CallListQuery = z.infer<typeof CallListQuerySchema>;

export interface ResolvedCallListQuery {
  direction?: CallDirection;
  status?: string;
  from?: Date;
  to?: Date;
  callerPattern?: string;
  calleePattern?: string;
  extensionId?: string;
  didPattern?: string;
  minDurationSeconds?: number;
  maxDurationSeconds?: number;
}

export function resolveCallListQuery(query: CallListQuery): ResolvedCallListQuery {
  const resolved: ResolvedCallListQuery = {};

  if (query.direction) resolved.direction = query.direction;
  if (query.status) resolved.status = query.status;

  const from =
    query.from ??
    (query.startDate ? `${query.startDate}T00:00:00.000Z` : undefined);
  const to =
    query.to ??
    (query.endDate ? `${query.endDate}T23:59:59.999Z` : undefined);
  if (from) resolved.from = new Date(from);
  if (to) resolved.to = new Date(to);

  const callerPattern = query.callerNumber ?? query.source;
  const calleePattern = query.calleeNumber ?? query.destination;
  if (callerPattern) resolved.callerPattern = callerPattern;
  if (calleePattern) resolved.calleePattern = calleePattern;

  if (query.extensionId) resolved.extensionId = query.extensionId;
  if (query.did) resolved.didPattern = query.did;
  if (query.minDurationSeconds !== undefined) {
    resolved.minDurationSeconds = query.minDurationSeconds;
  }
  if (query.maxDurationSeconds !== undefined) {
    resolved.maxDurationSeconds = query.maxDurationSeconds;
  }

  return resolved;
}
