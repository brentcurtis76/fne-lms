import type { SessionMeetingPublicStatus } from '../zoom/db-types';

/**
 * Projection states that prove a managed Zoom meeting exists and can support the
 * transition from `programada` to `en_progreso`.
 *
 * A missing projection means provisioning has not committed yet. Starting the
 * session in that window makes `meeting_provision` re-read an ineligible source
 * row and compensate the meeting it was creating, so both the API and the admin
 * UI must use this same readiness rule.
 */
export const STARTABLE_MANAGED_MEETING_STATUSES = [
  'scheduled',
  'live',
] as const satisfies readonly SessionMeetingPublicStatus[];

export const UNAVAILABLE_MANAGED_MEETING_STATUSES = [
  'ended',
  'cancelled',
] as const satisfies readonly SessionMeetingPublicStatus[];

export function managedMeetingIsReady(status: unknown): boolean {
  return (STARTABLE_MANAGED_MEETING_STATUSES as readonly unknown[]).includes(status);
}

export function managedMeetingIsUnavailable(status: unknown): boolean {
  return (UNAVAILABLE_MANAGED_MEETING_STATUSES as readonly unknown[]).includes(status);
}

export const MANAGED_MEETING_NOT_READY_MESSAGE =
  'La reunión Zoom todavía se está preparando. Espera a que esté disponible antes de iniciar la sesión.';

export const MANAGED_MEETING_UNAVAILABLE_MESSAGE =
  'La reunión Zoom ya no está disponible. Cancela o reprograma la sesión antes de continuar.';
