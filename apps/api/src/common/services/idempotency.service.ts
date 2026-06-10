import { Inject, Injectable } from '@nestjs/common';
import { conflict } from '@pbx/contracts';
import { sha256Hex } from '@pbx/shared';
import { and, eq, gt } from 'drizzle-orm';
import { idempotencyRecords, withTenantContext } from '@pbx/database';
import { DATABASE } from '../tokens.js';

const DEFAULT_TTL_MS = 24 * 60 * 60 * 1000;

@Injectable()
export class IdempotencyService {
  constructor(
    @Inject(DATABASE) private readonly database: ReturnType<typeof import('@pbx/database').createDatabase>,
  ) {}

  async execute<T extends Record<string, unknown>>(
    tenantId: string,
    routeKey: string,
    idempotencyKey: string | undefined,
    requestBody: unknown,
    handler: () => Promise<{ status: number; body: T }>,
  ): Promise<{ status: number; body: T; replayed: boolean }> {
    if (!idempotencyKey) {
      const fresh = await handler();
      return { ...fresh, replayed: false };
    }

    const requestHash = sha256Hex(JSON.stringify(requestBody ?? {}));
    const expiresAt = new Date(Date.now() + DEFAULT_TTL_MS);

    return withTenantContext(this.database.db, tenantId, async (db) => {
      const [existing] = await db
        .select()
        .from(idempotencyRecords)
        .where(
          and(
            eq(idempotencyRecords.tenantId, tenantId),
            eq(idempotencyRecords.routeKey, routeKey),
            eq(idempotencyRecords.idempotencyKey, idempotencyKey),
            gt(idempotencyRecords.expiresAt, new Date()),
          ),
        )
        .limit(1);

      if (existing) {
        if (existing.requestHash !== requestHash) {
          throw conflict('Idempotency key reused with different request payload');
        }
        return {
          status: existing.responseStatus,
          body: existing.responseBody as T,
          replayed: true,
        };
      }

      const result = await handler();
      await db.insert(idempotencyRecords).values({
        tenantId,
        routeKey,
        idempotencyKey,
        requestHash,
        responseStatus: result.status,
        responseBody: result.body,
        expiresAt,
      });
      return { ...result, replayed: false };
    });
  }
}
