import { describe, expect, it } from 'vitest';
import {
  DEFAULT_TENANT_CALLS_FEATURES,
  DEFAULT_TENANT_PHONE_NUMBERS_FEATURES,
  UpdateTenantFeatureSettingsSchema,
} from '@pbx/contracts';

describe('tenant feature settings contracts', () => {
  it('accepts partial tenant settings patch payload', () => {
    const parsed = UpdateTenantFeatureSettingsSchema.parse({
      telephony: {
        recording: { recordCallsByDefault: true },
      },
      phoneNumbers: {
        twilioSearch: true,
        twilioPurchase: true,
        twilioAssign: true,
        allowedRoutingTargets: ['extension', 'ai_agent', 'voicemail', 'reserve_only'],
      },
      calls: {
        showInbound: true,
        showOutbound: true,
        recordInbound: true,
        recordOutbound: true,
      },
    });
    expect(parsed.telephony?.recording?.recordCallsByDefault).toBe(true);
    expect(parsed.phoneNumbers?.twilioAssign).toBe(true);
  });

  it('exposes production defaults for phone numbers and calls', () => {
    expect(DEFAULT_TENANT_PHONE_NUMBERS_FEATURES.allowedRoutingTargets).toContain('extension');
    expect(DEFAULT_TENANT_CALLS_FEATURES.showOutbound).toBe(true);
  });
});
