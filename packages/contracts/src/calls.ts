import { z } from 'zod';
import { PaginationQuerySchema } from './pagination.js';

export const CallDirectionSchema = z.enum(['inbound', 'outbound', 'internal']);
export type CallDirection = z.infer<typeof CallDirectionSchema>;

export const CallListQuerySchema = PaginationQuerySchema.extend({
  direction: CallDirectionSchema.optional(),
  status: z.string().max(32).optional(),
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
  callerNumber: z.string().max(32).optional(),
  calleeNumber: z.string().max(32).optional(),
});

export type CallListQuery = z.infer<typeof CallListQuerySchema>;
