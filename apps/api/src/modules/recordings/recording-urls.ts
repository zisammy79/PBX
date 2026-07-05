/** Same-origin authenticated BFF path for browser audio playback over HTTPS. */
export function recordingBrowserContentPath(tenantId: string, recordingId: string): string {
  return `/api/backend/tenants/${tenantId}/recordings/${recordingId}/content`;
}

/** Canonical API path (for server-side references and OpenAPI). */
export function recordingApiContentPath(tenantId: string, recordingId: string): string {
  return `/api/v1/tenants/${tenantId}/recordings/${recordingId}/content`;
}

export function recordingContentDisposition(recordingId: string, format: string | null | undefined): string {
  const ext = (format ?? 'wav').toLowerCase();
  return `inline; filename="call-recording-${recordingId}.${ext}"`;
}
