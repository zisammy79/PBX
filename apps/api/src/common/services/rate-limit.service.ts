import { Inject, Injectable } from '@nestjs/common';
import Redis from 'ioredis';
import { rateLimited } from '@pbx/contracts';
import { CONFIG, REDIS } from '../tokens.js';
import type { AppConfig } from '../../config.js';

type LimitResult = { allowed: true } | { allowed: false; retryAfterSeconds: number };

@Injectable()
export class RateLimitService {
  private memory = new Map<string, { count: number; resetAt: number }>();

  constructor(
    @Inject(CONFIG) private readonly config: AppConfig,
    @Inject(REDIS) private readonly redis: Redis,
  ) {}

  async check(key: string, limit: number, windowSeconds: number): Promise<LimitResult> {
    try {
      if (this.redis.status !== 'ready') {
        await this.redis.connect();
      }
      const bucket = `rl:${key}:${Math.floor(Date.now() / (windowSeconds * 1000))}`;
      const count = await this.redis.incr(bucket);
      if (count === 1) {
        await this.redis.expire(bucket, windowSeconds);
      }
      if (count > limit) {
        const ttl = await this.redis.ttl(bucket);
        return { allowed: false, retryAfterSeconds: Math.max(ttl, 1) };
      }
      return { allowed: true };
    } catch {
      return this.checkMemory(key, limit, windowSeconds);
    }
  }

  async enforce(key: string, limit: number, windowSeconds: number): Promise<void> {
    const result = await this.check(key, limit, windowSeconds);
    if (!result.allowed) {
      throw rateLimited(result.retryAfterSeconds);
    }
  }

  private checkMemory(key: string, limit: number, windowSeconds: number): LimitResult {
    const now = Date.now();
    const entry = this.memory.get(key);
    const effectiveLimit =
      this.config.nodeEnv === 'production' ? Math.max(1, Math.floor(limit / 10)) : limit;

    if (!entry || entry.resetAt <= now) {
      this.memory.set(key, { count: 1, resetAt: now + windowSeconds * 1000 });
      return { allowed: true };
    }
    entry.count += 1;
    if (entry.count > effectiveLimit) {
      return {
        allowed: false,
        retryAfterSeconds: Math.max(Math.ceil((entry.resetAt - now) / 1000), 1),
      };
    }
    return { allowed: true };
  }
}
