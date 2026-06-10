import { eq } from 'drizzle-orm';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { generateSecureToken, hashPassword } from '@pbx/shared';
import { createDatabase, plans, priceBooks, users } from './index.js';
import { assertDevSeedAllowed, resolveDevAdminPassword } from './seed-guards.js';

async function main() {
  assertDevSeedAllowed();

  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error('DATABASE_URL is required');
    process.exit(1);
  }

  const adminEmail = process.env.DEV_ADMIN_EMAIL ?? 'admin@pbx.local';
  const adminPassword = resolveDevAdminPassword();

  const { db, close } = createDatabase({ url });

  const [existingAdmin] = await db.select().from(users).where(eq(users.email, adminEmail)).limit(1);

  const explicitPassword = process.env.DEV_ADMIN_PASSWORD?.trim();
  let passwordForBootstrap: string | null = adminPassword;

  if (!existingAdmin) {
    await db.insert(users).values({
      email: adminEmail,
      displayName: 'Platform Administrator',
      passwordHash: hashPassword(adminPassword),
      platformRoles: ['platform_super_admin'],
      status: 'active',
      passwordMustChange: true,
    });
  } else if (explicitPassword && explicitPassword.length >= 12) {
    await db
      .update(users)
      .set({
        passwordHash: hashPassword(adminPassword),
        passwordMustChange: true,
        updatedAt: new Date(),
      })
      .where(eq(users.email, adminEmail));
    passwordForBootstrap = adminPassword;
  } else {
    passwordForBootstrap = null;
    console.log('Bootstrap admin already exists; skipping password rotation.');
    console.log('Set DEV_ADMIN_PASSWORD (min 12 chars) to rotate development admin credentials.');
  }

  const [existingPlan] = await db.select().from(plans).limit(1);
  if (!existingPlan) {
    const [priceBook] = await db
      .insert(priceBooks)
      .values({
        name: 'Default Price Book',
        currency: 'USD',
        effectiveFrom: new Date(),
        isActive: true,
      })
      .returning();

    if (priceBook) {
      await db.insert(plans).values({
        name: 'Starter',
        slug: 'starter',
        priceBookId: priceBook.id,
        monthlyAmount: '29.00',
        currency: 'USD',
        isPublic: true,
        trialDays: 14,
      });
    }
  }

  await close();

  const credentialsDir = join(process.cwd(), '.local');
  await mkdir(credentialsDir, { recursive: true });
  const credentialsPath = join(credentialsDir, 'bootstrap-admin.json');
  await writeFile(
    credentialsPath,
    JSON.stringify(
      {
        email: adminEmail,
        ...(passwordForBootstrap ? { password: passwordForBootstrap } : {}),
        passwordMustChange: true,
        generatedAt: new Date().toISOString(),
        note: passwordForBootstrap
          ? 'Development bootstrap only. Change password on first login. Do not commit this file.'
          : 'Admin already exists. Set DEV_ADMIN_PASSWORD and re-run db:seed to rotate credentials.',
      },
      null,
      2,
    ),
    { mode: 0o600 },
  );

  console.log('Seed complete.');
  console.log(`Bootstrap admin credentials written to: ${credentialsPath}`);
  console.log('Password was NOT written to application logs.');
}

main().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
