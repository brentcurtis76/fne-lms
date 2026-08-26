import { describe, expect, it } from 'vitest';
import {
  managedMeetingIsReady,
  managedMeetingNeedsPolling,
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

  it.each(['programada', 'en_progreso'])(
    'polls an unresolved managed meeting while the source session is %s',
    (sessionStatus) => {
      expect(managedMeetingNeedsPolling(sessionStatus, true, null)).toBe(true);
    }
  );

  it.each([
    ['programada', false, null],
    ['en_progreso', false, null],
    ['completada', true, null],
    ['en_progreso', true, 'scheduled'],
    ['en_progreso', true, 'live'],
    ['en_progreso', true, 'ended'],
    ['en_progreso', true, 'cancelled'],
  ] as const)(
    'does not poll when session=%s managed=%s meeting=%s is already conclusive',
    (sessionStatus, isManagedZoom, meetingStatus) => {
      expect(
        managedMeetingNeedsPolling(sessionStatus, isManagedZoom, meetingStatus)
      ).toBe(false);
    }
  );
});
