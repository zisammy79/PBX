import { describe, expect, it } from 'vitest';
import { resolveCallListQuery } from './calls.js';

describe('resolveCallListQuery', () => {
  it('maps startDate/endDate to UTC day boundaries', () => {
    const resolved = resolveCallListQuery({
      page: 1,
      pageSize: 20,
      sortOrder: 'desc',
      startDate: '2026-09-01',
      endDate: '2026-09-17',
    });
    expect(resolved.from?.toISOString()).toBe('2026-09-01T00:00:00.000Z');
    expect(resolved.to?.toISOString()).toBe('2026-09-17T23:59:59.999Z');
  });

  it('prefers explicit from/to over date-only aliases', () => {
    const resolved = resolveCallListQuery({
      page: 1,
      pageSize: 20,
      sortOrder: 'desc',
      from: '2026-09-01T08:00:00.000Z',
      to: '2026-09-01T09:00:00.000Z',
      startDate: '2026-08-01',
      endDate: '2026-08-31',
    });
    expect(resolved.from?.toISOString()).toBe('2026-09-01T08:00:00.000Z');
    expect(resolved.to?.toISOString()).toBe('2026-09-01T09:00:00.000Z');
  });

  it('maps source/destination to caller/callee patterns', () => {
    const resolved = resolveCallListQuery({
      page: 1,
      pageSize: 20,
      sortOrder: 'desc',
      source: '050',
      destination: '972',
    });
    expect(resolved.callerPattern).toBe('050');
    expect(resolved.calleePattern).toBe('972');
  });

  it('prefers callerNumber/calleeNumber over source/destination', () => {
    const resolved = resolveCallListQuery({
      page: 1,
      pageSize: 20,
      sortOrder: 'desc',
      callerNumber: '111',
      calleeNumber: '222',
      source: '050',
      destination: '972',
    });
    expect(resolved.callerPattern).toBe('111');
    expect(resolved.calleePattern).toBe('222');
  });

  it('passes through extension, did, and duration filters', () => {
    const resolved = resolveCallListQuery({
      page: 1,
      pageSize: 20,
      sortOrder: 'desc',
      extensionId: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
      did: '+9723',
      minDurationSeconds: 10,
      maxDurationSeconds: 300,
      direction: 'inbound',
      status: 'completed',
    });
    expect(resolved.extensionId).toBe('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa');
    expect(resolved.didPattern).toBe('+9723');
    expect(resolved.minDurationSeconds).toBe(10);
    expect(resolved.maxDurationSeconds).toBe(300);
    expect(resolved.direction).toBe('inbound');
    expect(resolved.status).toBe('completed');
  });
});
