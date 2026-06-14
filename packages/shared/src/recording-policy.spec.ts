import { describe, expect, it } from 'vitest';
import { effectiveExtensionRecording, resolveCallRecordingPolicy } from './recording-policy.js';

describe('recording policy', () => {
  it('organization off + inherit => off', () => {
    expect(effectiveExtensionRecording(false, 'inherit')).toBe(false);
    expect(
      resolveCallRecordingPolicy({
        orgRecordByDefault: false,
        callAnswered: true,
        participants: [{ extensionId: 'a', mode: 'inherit', active: true }],
      }).shouldRecord,
    ).toBe(false);
  });

  it('organization on + inherit => on', () => {
    expect(effectiveExtensionRecording(true, 'inherit')).toBe(true);
  });

  it('organization on + extension off => off for that extension', () => {
    expect(
      resolveCallRecordingPolicy({
        orgRecordByDefault: true,
        callAnswered: true,
        participants: [{ extensionId: 'a', mode: 'off', active: true }],
      }).shouldRecord,
    ).toBe(false);
  });

  it('organization off + extension on => on', () => {
    expect(
      resolveCallRecordingPolicy({
        orgRecordByDefault: false,
        callAnswered: true,
        participants: [{ extensionId: 'a', mode: 'on', active: true }],
      }).shouldRecord,
    ).toBe(true);
  });

  it('internal call with one participant on => record', () => {
    const decision = resolveCallRecordingPolicy({
      orgRecordByDefault: false,
      callAnswered: true,
      participants: [
        { extensionId: '1003', mode: 'on', active: true },
        { extensionId: '1004', mode: 'inherit', active: true },
      ],
    });
    expect(decision.shouldRecord).toBe(true);
    expect(decision.participantExtensionIds).toContain('1003');
  });

  it('internal call with both off => no record', () => {
    expect(
      resolveCallRecordingPolicy({
        orgRecordByDefault: true,
        callAnswered: true,
        participants: [
          { extensionId: '1003', mode: 'off', active: true },
          { extensionId: '1004', mode: 'off', active: true },
        ],
      }).shouldRecord,
    ).toBe(false);
  });

  it('unanswered call => no record', () => {
    expect(
      resolveCallRecordingPolicy({
        orgRecordByDefault: true,
        callAnswered: false,
        participants: [{ extensionId: 'a', mode: 'on', active: true }],
      }).reason,
    ).toBe('call_not_answered');
  });

  it('inactive extension excluded', () => {
    expect(
      resolveCallRecordingPolicy({
        orgRecordByDefault: false,
        callAnswered: true,
        participants: [{ extensionId: 'a', mode: 'on', active: false }],
      }).shouldRecord,
    ).toBe(false);
  });
});
