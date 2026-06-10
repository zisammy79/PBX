import { spawn, spawnSync, type ChildProcess } from 'node:child_process';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { generateSecureToken } from '@pbx/shared';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../../../..');
const API_URL = process.env.PUBLIC_API_URL ?? 'http://localhost:3001';

let apiProcess: ChildProcess | undefined;
let apiPort = 3001;

function loadEnv(): Record<string, string> {
  const envPath = join(ROOT, '.env');
  const env: Record<string, string> = { ...process.env } as Record<string, string>;
  if (!existsSync(envPath)) {
    return env;
  }
  for (const line of readFileSync(envPath, 'utf8').split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq);
    const value = trimmed.slice(eq + 1);
    env[key] = value;
  }
  return env;
}

function resolveApiPort(env: Record<string, string>): number {
  const fromEnv = Number.parseInt(env.API_PORT ?? '3001', 10);
  if (Number.isFinite(fromEnv) && fromEnv > 0) {
    return fromEnv;
  }
  try {
    return new URL(API_URL).port ? Number.parseInt(new URL(API_URL).port, 10) : 3001;
  } catch {
    return 3001;
  }
}

function freeApiPort(port: number): void {
  spawnSync('fuser', ['-k', `${port}/tcp`], { stdio: 'ignore' });
  const byPort = spawnSync('lsof', ['-ti', `:${port}`], { encoding: 'utf8' });
  const pids = (byPort.stdout ?? '')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
  for (const pid of pids) {
    spawnSync('kill', ['-TERM', pid], { stdio: 'ignore' });
  }
}

async function waitForApi(maxAttempts = 40): Promise<void> {
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    try {
      const [live, authProbe] = await Promise.all([
        fetch(`${API_URL}/api/v1/health/live`),
        fetch(`${API_URL}/api/v1/auth/me`),
      ]);
      if (live.ok && authProbe.status === 401) {
        return;
      }
    } catch {
      // API still starting
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(`API did not become ready at ${API_URL}`);
}

export async function setup(): Promise<void> {
  process.chdir(ROOT);

  const env = loadEnv();
  apiPort = resolveApiPort(env);
  if (!env.DEV_ADMIN_PASSWORD || env.DEV_ADMIN_PASSWORD.length < 12) {
    env.DEV_ADMIN_PASSWORD = generateSecureToken(16);
  }
  env.ALLOW_DEV_SEED = 'true';
  freeApiPort(apiPort);
  await new Promise((resolve) => setTimeout(resolve, 500));

  const seed = spawnSync('npx', ['pnpm@9.15.0', 'db:seed'], {
    cwd: ROOT,
    env,
    stdio: 'inherit',
  });
  if (seed.status !== 0) {
    throw new Error('db:seed failed before integration tests');
  }

  const bootstrapPath = join(ROOT, 'packages/database/.local/bootstrap-admin.json');
  const { access } = await import('node:fs/promises');
  try {
    await access(bootstrapPath);
  } catch {
    throw new Error(
      `Missing ${bootstrapPath}. Run ALLOW_DEV_SEED=true pnpm db:seed before integration tests.`,
    );
  }

  apiProcess = spawn('npx', ['pnpm@9.15.0', '--filter', '@pbx/api', 'dev'], {
    cwd: ROOT,
    env,
    stdio: ['ignore', 'pipe', 'pipe'],
    detached: false,
  });

  let spawnFailed = false;
  apiProcess.stderr?.on('data', (chunk: Buffer) => {
    const line = chunk.toString();
    if (line.includes('EADDRINUSE') || line.includes('address already in use')) {
      spawnFailed = true;
    }
    if (line.includes('Error') || line.includes('error')) {
      process.stderr.write(`[api] ${line}`);
    }
  });
  apiProcess.on('exit', (code) => {
    if (code !== 0 && code !== null) {
      spawnFailed = true;
    }
  });

  await waitForApi();
  if (spawnFailed) {
    throw new Error(`API process failed to bind or exited before integration tests (${API_URL})`);
  }
}

export async function teardown(): Promise<void> {
  if (!apiProcess?.pid) {
    return;
  }
  apiProcess.kill('SIGTERM');
  await new Promise((resolve) => setTimeout(resolve, 500));
  if (!apiProcess.killed) {
    apiProcess.kill('SIGKILL');
  }
}
