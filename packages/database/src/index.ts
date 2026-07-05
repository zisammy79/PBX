import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema/index.js';

export type Database = ReturnType<typeof createDatabase>['db'];

export interface DatabaseConfig {
  url: string;
  maxConnections?: number;
}

export function createDatabase(config: DatabaseConfig) {
  const client = postgres(config.url, {
    max: config.maxConnections ?? 10,
    prepare: false,
  });

  const db = drizzle(client, { schema });

  return {
    db,
    client,
    async close() {
      await client.end();
    },
  };
}

export * from './tenant-context.js';
export * from './seed-guards.js';
export * from './schema/index.js';
