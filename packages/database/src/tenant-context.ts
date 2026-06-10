import { sql } from 'drizzle-orm';
import type { Database } from './index.js';

/** Server-controlled PostgreSQL session variables for RLS — never from HTTP input alone. */
export const TENANT_SETTING = 'app.tenant_id';
export const BYPASS_RLS_SETTING = 'app.bypass_rls';

type TxDatabase = Parameters<Parameters<Database['transaction']>[0]>[0];

export async function withTenantContext<T>(
  db: Database,
  tenantId: string,
  fn: (txDb: TxDatabase) => Promise<T>,
): Promise<T> {
  return db.transaction(async (tx) => {
    await tx.execute(
      sql`SELECT set_config(${TENANT_SETTING}, ${tenantId}, true)`,
    );
    return fn(tx);
  });
}

export async function withBypassRls<T>(
  db: Database,
  fn: (txDb: TxDatabase) => Promise<T>,
): Promise<T> {
  return db.transaction(async (tx) => {
    await tx.execute(sql`SELECT set_config(${BYPASS_RLS_SETTING}, 'true', true)`);
    return fn(tx);
  });
}

export async function setTenantContext(db: Database, tenantId: string): Promise<void> {
  await db.execute(sql`SELECT set_config(${TENANT_SETTING}, ${tenantId}, false)`);
}

export async function clearTenantContext(db: Database): Promise<void> {
  await db.execute(sql`SELECT set_config(${TENANT_SETTING}, '', false)`);
}

export async function setBypassRls(db: Database, enabled: boolean): Promise<void> {
  await db.execute(
    sql`SELECT set_config(${BYPASS_RLS_SETTING}, ${enabled ? 'true' : 'false'}, false)`,
  );
}
