import { describe, expect, it } from 'vitest';
import { validationError } from '@pbx/contracts';

describe('TwilioNumbersService destination validation contract', () => {
  it('returns DESTINATION_NOT_FOUND_FOR_TENANT for invalid cross-tenant extension assignment', () => {
    const error = validationError({
      code: 'DESTINATION_NOT_FOUND_FOR_TENANT',
      tenantId: 'tenant-a-id',
      destinationType: 'extension',
      destinationValue: '100',
    });

    expect(error.details?.code).toBe('DESTINATION_NOT_FOUND_FOR_TENANT');
    expect(error.statusCode).toBe(400);
  });
});
