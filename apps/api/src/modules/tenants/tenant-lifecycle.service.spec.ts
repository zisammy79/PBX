import { describe, expect, it } from 'vitest';
import { ALLOWED_LIFECYCLE_TRANSITIONS, type TenantLifecycleStatus } from '@pbx/contracts';
import { TenantLifecycleService } from './tenant-lifecycle.service.js';

describe('TenantLifecycleService', () => {
  const service = new TenantLifecycleService();

  it('allows draft → provisioning', () => {
    expect(() => service.assertTransition('draft', 'provisioning')).not.toThrow();
  });

  it('allows active → suspended → active', () => {
    expect(() => service.assertTransition('active', 'suspended')).not.toThrow();
    expect(() => service.assertTransition('suspended', 'active')).not.toThrow();
  });

  it('rejects active → draft', () => {
    expect(() => service.assertTransition('active', 'draft')).toThrow();
  });

  it('rejects archived → active', () => {
    expect(() => service.assertTransition('archived', 'active')).toThrow();
  });

  it('documents all states', () => {
    const states: TenantLifecycleStatus[] = [
      'draft',
      'provisioning',
      'active',
      'suspended',
      'failed',
      'archived',
    ];
    for (const state of states) {
      expect(ALLOWED_LIFECYCLE_TRANSITIONS[state]).toBeDefined();
    }
  });
});
