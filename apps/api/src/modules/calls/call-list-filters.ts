import { resolveCallListQuery, type CallListQuery } from '@pbx/contracts';
import { and, eq, gte, lte, or, sql, type SQL } from 'drizzle-orm';
import { calls } from '@pbx/database';

export function buildCallListFilterClauses(tenantId: string, query: CallListQuery): SQL | undefined {
  const resolved = resolveCallListQuery(query);
  const clauses: SQL[] = [eq(calls.tenantId, tenantId)];

  if (resolved.direction) {
    clauses.push(eq(calls.direction, resolved.direction));
  }
  if (resolved.status) {
    clauses.push(eq(calls.status, resolved.status as typeof calls.$inferSelect.status));
  }
  if (resolved.from) {
    clauses.push(gte(calls.startedAt, resolved.from));
  }
  if (resolved.to) {
    clauses.push(lte(calls.startedAt, resolved.to));
  }
  if (resolved.callerPattern) {
    const needle = `%${resolved.callerPattern}%`;
    clauses.push(sql`${calls.callerNumber} ilike ${needle}`);
  }
  if (resolved.calleePattern) {
    const needle = `%${resolved.calleePattern}%`;
    clauses.push(sql`${calls.calleeNumber} ilike ${needle}`);
  }
  if (resolved.extensionId) {
    clauses.push(
      or(
        eq(calls.fromExtensionId, resolved.extensionId),
        eq(calls.toExtensionId, resolved.extensionId),
      )!,
    );
  }
  if (resolved.didPattern) {
    const needle = `%${resolved.didPattern}%`;
    clauses.push(
      or(
        sql`${calls.metadata}->>'did' ilike ${needle}`,
        sql`${calls.calleeNumber} ilike ${needle}`,
        sql`${calls.callerNumber} ilike ${needle}`,
      )!,
    );
  }
  if (resolved.minDurationSeconds !== undefined) {
    clauses.push(gte(calls.durationSeconds, resolved.minDurationSeconds));
  }
  if (resolved.maxDurationSeconds !== undefined) {
    clauses.push(lte(calls.durationSeconds, resolved.maxDurationSeconds));
  }

  return and(...clauses);
}
