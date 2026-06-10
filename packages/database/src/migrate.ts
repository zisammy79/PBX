import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import postgres from 'postgres';

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error('DATABASE_URL is required');
    process.exit(1);
  }

  const migrationsFolder = join(import.meta.dirname, '..', 'drizzle');
  const journalPath = join(migrationsFolder, 'meta/_journal.json');
  const journal = JSON.parse(readFileSync(journalPath, 'utf8')) as {
    entries: Array<{ tag: string; when: number; breakpoints: boolean }>;
  };

  const sql = postgres(url, { max: 1 });

  await sql`CREATE SCHEMA IF NOT EXISTS drizzle`;
  await sql`
    CREATE TABLE IF NOT EXISTS drizzle.__drizzle_migrations (
      id SERIAL PRIMARY KEY,
      hash text NOT NULL,
      created_at bigint
    )
  `;

  const applied = await sql`
    SELECT hash, created_at FROM drizzle.__drizzle_migrations ORDER BY created_at
  `;
  const appliedHashes = new Set(applied.map((row) => row.hash));

  console.log('Running migrations...');

  for (const entry of journal.entries) {
    const migrationPath = join(migrationsFolder, `${entry.tag}.sql`);
    const query = readFileSync(migrationPath, 'utf8');
    const hash = createHash('sha256').update(query).digest('hex');
    if (appliedHashes.has(hash)) {
      continue;
    }

    const statements = query
      .split('--> statement-breakpoint')
      .map((stmt) => stmt.trim())
      .filter(Boolean);

    console.log(`Applying ${entry.tag} (${statements.length} statements)...`);

    await sql.begin(async (tx) => {
      for (const stmt of statements) {
        await tx.unsafe(stmt);
      }
      await tx`
        INSERT INTO drizzle.__drizzle_migrations (hash, created_at)
        VALUES (${hash}, ${entry.when})
      `;
    });
  }

  console.log('Migrations complete.');
  await sql.end();
}

main().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});
