import { describe, expect, it } from 'vitest';
import {
  recordingApiContentPath,
  recordingBrowserContentPath,
  recordingContentDisposition,
} from './recording-urls.js';

describe('recording URLs', () => {
  const tenantId = '2433f849-3b43-405c-83a4-47d4ff492955';
  const recordingId = 'b5acd325-c34d-44e5-8a80-13e7e9b837c8';

  it('uses same-origin BFF path for browser playback', () => {
    expect(recordingBrowserContentPath(tenantId, recordingId)).toBe(
      `/api/backend/tenants/${tenantId}/recordings/${recordingId}/content`,
    );
    expect(recordingBrowserContentPath(tenantId, recordingId)).not.toContain('127.0.0.1');
    expect(recordingBrowserContentPath(tenantId, recordingId)).not.toContain('minio');
  });

  it('uses canonical API path for server references', () => {
    expect(recordingApiContentPath(tenantId, recordingId)).toBe(
      `/api/v1/tenants/${tenantId}/recordings/${recordingId}/content`,
    );
  });

  it('builds inline content disposition', () => {
    expect(recordingContentDisposition(recordingId, 'wav')).toBe(
      `inline; filename="call-recording-${recordingId}.wav"`,
    );
  });
});
