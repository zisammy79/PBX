import { describe, expect, it } from 'vitest';
import type { DependencyHealth } from '@pbx/contracts';

const REQUIRED = ['postgresql', 'redis', 'nats'] as const;

function isReady(dependencies: DependencyHealth[]): boolean {
  const required = dependencies.filter((d) =>
    (REQUIRED as readonly string[]).includes(d.name),
  );
  return required.every((d) => d.status === 'healthy');
}

function aggregateStatus(
  dependencies: DependencyHealth[],
): 'healthy' | 'degraded' | 'unhealthy' {
  const required = dependencies.filter((d) =>
    (REQUIRED as readonly string[]).includes(d.name),
  );
  if (required.some((d) => d.status === 'unhealthy')) {
    return 'unhealthy';
  }
  if (dependencies.some((d) => d.status === 'degraded')) {
    return 'degraded';
  }
  return 'healthy';
}

describe('health readiness logic', () => {
  it('ready only when all required dependencies are healthy', () => {
    const deps: DependencyHealth[] = [
      { name: 'postgresql', status: 'healthy' },
      { name: 'redis', status: 'healthy' },
      { name: 'nats', status: 'healthy' },
      { name: 'asterisk', status: 'degraded' },
    ];
    expect(isReady(deps)).toBe(true);
    expect(aggregateStatus(deps)).toBe('degraded');
  });

  it('not ready when redis is unhealthy', () => {
    const deps: DependencyHealth[] = [
      { name: 'postgresql', status: 'healthy' },
      { name: 'redis', status: 'unhealthy', message: 'connection refused' },
      { name: 'nats', status: 'healthy' },
    ];
    expect(isReady(deps)).toBe(false);
    expect(aggregateStatus(deps)).toBe('unhealthy');
  });

  it('not ready when nats is unhealthy', () => {
    const deps: DependencyHealth[] = [
      { name: 'postgresql', status: 'healthy' },
      { name: 'redis', status: 'healthy' },
      { name: 'nats', status: 'unhealthy', message: 'timeout' },
    ];
    expect(isReady(deps)).toBe(false);
  });
});
