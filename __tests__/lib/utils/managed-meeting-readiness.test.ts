import { describe, expect, it } from 'vitest';
import {
  managedMeetingIsReady,
  managedMeetingIsUnavailable,
  STARTABLE_MANAGED_MEETING_STATUSES,
  UNAVAILABLE_MANAGED_MEETING_STATUSES,
} from '../../../lib/utils/managed-meeting-readiness';

describe('managed meeting readiness', () => {
  it('accepts only public states that prove a usable meeting exists', () => {
    expect(STARTABLE_MANAGED_MEETING_STATUSES).toEqual(['scheduled', 'live']);
    expect(managedMeetingIsReady('scheduled')).toBe(true);
    expect(managedMeetingIsReady('live')).toBe(true);
  });

  it.each([null, undefined, 'ended', 'cancelled', 'pending', ''])(
    'fails closed for %s',
    (status) => {
      expect(managedMeetingIsReady(status)).toBe(false);
    }
  );

  it('distinguishes terminal meetings from meetings that may still be provisioning', () => {
    expect(UNAVAILABLE_MANAGED_MEETING_STATUSES).toEqual(['ended', 'cancelled']);
    expect(managedMeetingIsUnavailable('ended')).toBe(true);
    expect(managedMeetingIsUnavailable('cancelled')).toBe(true);
    expect(managedMeetingIsUnavailable('scheduled')).toBe(false);
    expect(managedMeetingIsUnavailable(null)).toBe(false);
  });
});
