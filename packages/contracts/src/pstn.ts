import { z } from 'zod';

export const SipAuthModeSchema = z.enum(['registration', 'ip']);
export const SipTransportSchema = z.enum(['udp', 'tcp', 'tls']);
export const DtmfModeSchema = z.enum(['rfc4733', 'inband', 'info']);

export const CreateSipTrunkSchema = z.object({
  name: z.string().min(1).max(255),
  slug: z.string().regex(/^[a-z0-9-]{2,63}$/),
  authMode: SipAuthModeSchema.default('registration'),
  transport: SipTransportSchema.default('udp'),
  registrar: z.string().max(255).optional(),
  outboundProxy: z.string().max(255).optional(),
  credentials: z
    .object({
      username: z.string().min(1).max(128).optional(),
      password: z.string().min(1).max(256).optional(),
    })
    .optional(),
  config: z
    .object({
      allowedCodecs: z.array(z.string()).default(['ulaw']),
      dtmfMode: DtmfModeSchema.default('rfc4733'),
      assignedDid: z.string().regex(/^\+[1-9]\d{6,14}$/).optional(),
      allowedCallerId: z.string().regex(/^\+[1-9]\d{6,14}$/).optional(),
      maxConcurrentCalls: z.number().int().min(1).max(100).default(5),
      maxCallDurationSeconds: z.number().int().min(60).max(86400).default(3600),
      spendLimitCents: z.number().int().min(0).optional(),
      allowedDestinationCountries: z.array(z.string().length(2)).default(['US']),
      failureRoute: z.string().max(64).optional(),
      providerName: z.string().max(128).optional(),
    })
    .default({}),
});

export const UpdateSipTrunkSchema = CreateSipTrunkSchema.partial();

export const CreateInboundRouteSchema = z.object({
  name: z.string().min(1).max(255),
  didPattern: z.string().min(3).max(64),
  trunkId: z.string().uuid(),
  destinationType: z.enum(['extension', 'ai_agent']),
  destinationId: z.string().uuid(),
});

export const CreateOutboundRouteSchema = z.object({
  name: z.string().min(1).max(255),
  pattern: z.string().min(1).max(64),
  trunkId: z.string().uuid(),
  callerId: z.string().regex(/^\+[1-9]\d{6,14}$/),
  normalizePrefix: z.string().max(8).optional(),
});

export type CreateSipTrunk = z.infer<typeof CreateSipTrunkSchema>;
export type UpdateSipTrunk = z.infer<typeof UpdateSipTrunkSchema>;
export type CreateInboundRoute = z.infer<typeof CreateInboundRouteSchema>;
export type CreateOutboundRoute = z.infer<typeof CreateOutboundRouteSchema>;
