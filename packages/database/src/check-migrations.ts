import { readdir } from 'node:fs/promises';
import { join } from 'node:path';

async function main() {
  const migrationsDir = join(import.meta.dirname, '..', 'drizzle');
  let files: string[];
  try {
    files = await readdir(migrationsDir);
  } catch {
    console.error('No migrations directory found. Run: pnpm db:generate');
    process.exit(1);
  }

  const sqlFiles = files.filter((f) => f.endsWith('.sql'));
  if (sqlFiles.length === 0) {
    console.error('No migration SQL files found. Run: pnpm db:generate');
    process.exit(1);
  }

  console.log(`Found ${sqlFiles.length} migration file(s).`);
}

main();
