import { Inject, Injectable } from '@nestjs/common';
import type { DependencyHealth } from '@pbx/contracts';
import { sql } from 'drizzle-orm';
import { connect, NatsConnection } from 'nats';
import Redis from 'ioredis';
import { CONFIG, DATABASE } from '../../common/tokens.js';
import type { AppConfig } from '../../config.js';

const REQUIRED_DEPENDENCIES = ['postgresql', 'redis', 'nats'] as const;

@Injectable()
export class HealthService {
  constructor(
    @Inject(CONFIG) private readonly config: AppConfig,
    @Inject(DATABASE) private readonly database: ReturnType<typeof import('@pbx/database').createDatabase>,
  ) {}

  async checkDependencies(): Promise<DependencyHealth[]> {
    const deps: DependencyHealth[] = [];

    deps.push(await this.checkPostgres());
    deps.push(await this.checkRedis());
    deps.push(await this.checkNats());
    deps.push(await this.checkAsterisk());

    return deps;
  }

  aggregateStatus(dependencies: DependencyHealth[]): 'healthy' | 'degraded' | 'unhealthy' {
    const requiredNames = this.requiredDependencyNames();
    const required = dependencies.filter((d) => requiredNames.includes(d.name));
    if (required.some((d) => d.status === 'unhealthy')) {
      return 'unhealthy';
    }
    if (dependencies.some((d) => d.status === 'degraded')) {
      return 'degraded';
    }
    return 'healthy';
  }

  isReady(dependencies: DependencyHealth[]): boolean {
    const requiredNames = this.requiredDependencyNames();
    const required = dependencies.filter((d) => requiredNames.includes(d.name));
    return required.every((d) => d.status === 'healthy');
  }

  private requiredDependencyNames(): string[] {
    const names: string[] = [...REQUIRED_DEPENDENCIES];
    if (this.config.telephonyEnabled) {
      names.push('asterisk');
    }
    return names;
  }

  private async checkAsterisk(): Promise<DependencyHealth> {
    if (!this.config.telephonyEnabled) {
      return {
        name: 'asterisk',
        status: 'degraded',
        message: 'Telephony disabled (TELEPHONY_ENABLED=false)',
      };
    }
    if (!this.config.asteriskAriUrl || !this.config.asteriskAriPassword) {
      return {
        name: 'asterisk',
        status: 'unhealthy',
        message: 'Asterisk ARI not configured',
      };
    }
    const start = Date.now();
    try {
      const base = this.config.asteriskAriUrl.replace(/\/$/, '');
      const auth = Buffer.from(
        `${this.config.asteriskAriUsername}:${this.config.asteriskAriPassword}`,
      ).toString('base64');
      const res = await fetch(`${base}/asterisk/info`, {
        headers: { Authorization: `Basic ${auth}` },
        signal: AbortSignal.timeout(3000),
      });
      if (!res.ok) {
        throw new Error(`ARI probe returned ${res.status}`);
      }
      return { name: 'asterisk', status: 'healthy', latencyMs: Date.now() - start };
    } catch (err) {
      return {
        name: 'asterisk',
        status: 'unhealthy',
        message: err instanceof Error ? err.message : 'Unknown error',
      };
    }
  }

  private async checkPostgres(): Promise<DependencyHealth> {
    const start = Date.now();
    try {
      await this.database.db.execute(sql`SELECT 1`);
      return { name: 'postgresql', status: 'healthy', latencyMs: Date.now() - start };
    } catch (err) {
      return {
        name: 'postgresql',
        status: 'unhealthy',
        message: err instanceof Error ? err.message : 'Unknown error',
      };
    }
  }

  private async checkRedis(): Promise<DependencyHealth> {
    const start = Date.now();
    const client = new Redis(this.config.redisUrl, {
      connectTimeout: 3000,
      maxRetriesPerRequest: 1,
      lazyConnect: true,
    });
    try {
      await client.connect();
      const pong = await client.ping();
      if (pong !== 'PONG') {
        throw new Error(`Unexpected Redis PING response: ${pong}`);
      }
      return { name: 'redis', status: 'healthy', latencyMs: Date.now() - start };
    } catch (err) {
      return {
        name: 'redis',
        status: 'unhealthy',
        message: err instanceof Error ? err.message : 'Unknown error',
      };
    } finally {
      client.disconnect();
    }
  }

  private async checkNats(): Promise<DependencyHealth> {
    const start = Date.now();
    let connection: NatsConnection | undefined;
    try {
      connection = await connect({
        servers: this.config.natsUrl,
        timeout: 3000,
      });
      return { name: 'nats', status: 'healthy', latencyMs: Date.now() - start };
    } catch (err) {
      return {
        name: 'nats',
        status: 'unhealthy',
        message: err instanceof Error ? err.message : 'Unknown error',
      };
    } finally {
      await connection?.close().catch(() => undefined);
    }
  }
}
