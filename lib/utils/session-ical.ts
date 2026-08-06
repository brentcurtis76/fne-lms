/**
 * iCal generation utilities for Consultor Sessions
 * Exports sessions in RFC 5545 compliant .ics format for calendar applications
 */

import ical, { ICalAlarmType, ICalAttendeeRole, ICalAttendeeStatus, ICalEventStatus } from 'ical-generator';
import type { ICalCalendar, ICalEventData } from 'ical-generator';
import { getVtimezoneComponent } from '@touch4it/ical-timezones';
import { SessionStatus } from '../types/consultor-sessions.types';
import { SESSION_TIMEZONE } from './session-timezone';

/**
 * Input data for iCal event generation
 * Subset of ConsultorSession + related fields needed for calendar export
 *
 * Note there is no `meeting_link` field, deliberately: an .ics file is a
 * plain-text artifact that travels outside the platform (mail attachments,
 * calendar sync, shared calendars), so it never carries the raw meeting link.
 * Callers pass `join_url` — the absolute `/meet/session/{id}` platform URL —
 * and authorization happens when that page is opened.
 */
export interface ICalSessionInput {
  id: string;
  title: string;
  description?: string | null;
  objectives?: string | null;
  session_date: string; // YYYY-MM-DD
  start_time: string; // HH:MM:SS or HH:MM
  end_time: string; // HH:MM:SS or HH:MM
  location?: string | null;
  /** Absolute platform URL for the meeting, or omitted when there is none */
  join_url?: string | null;
  status: SessionStatus;
  /**
   * The session row's `created_at` / `updated_at`, verbatim. They exist here
   * only to derive SEQUENCE — see {@link deriveSequence}. Both are
   * `timestamptz NOT NULL` on `consultor_sessions`, so a caller reading the
   * row always has them; they are optional on this interface so an unparseable
   * or absent pair degrades to `SEQUENCE:0` instead of throwing mid-export.
   */
  created_at?: string | null;
  updated_at?: string | null;
  school_name?: string | null;
  growth_community_name?: string | null;
  facilitators?: Array<{
    first_name?: string | null;
    last_name?: string | null;
    email?: string | null;
  }>;
}

/**
 * Map session status to iCal STATUS property
 * programada/pendiente_aprobacion → TENTATIVE
 * en_progreso/pendiente_informe/completada → CONFIRMED
 * cancelada → CANCELLED
 */
function mapStatusToICalStatus(status: SessionStatus): ICalEventStatus {
  if (status === 'cancelada') return ICalEventStatus.CANCELLED;
  if (status === 'en_progreso' || status === 'pendiente_informe' || status === 'completada') {
    return ICalEventStatus.CONFIRMED;
  }
  return ICalEventStatus.TENTATIVE;
}

/**
 * Derive the RFC 5545 §3.8.7.4 SEQUENCE for a session's VEVENT.
 *
 * Without it every .ics we emit is, to a calendar client, the first and final
 * revision of its event: the client matches the incoming VEVENT to one it
 * already holds by UID, compares SEQUENCE, and ignores anything that is not
 * strictly greater. So a rescheduled session would notify the participant
 * while their calendar kept the old time — the whole reason this exists.
 *
 * The value is whole seconds between the row's `created_at` and `updated_at`.
 * `updated_at` is maintained by a database trigger
 * (`trg_consultor_sessions_updated_at` → `set_updated_at()`), so it rises on
 * every write to the row — reschedule, cancel, anything — with no code having
 * to remember to bump a counter. Seconds-since-creation is monotonic per
 * session, is 0 for a never-updated row, and stays far below the int32 ceiling
 * some clients enforce (raw epoch seconds would not).
 *
 * Degrades to 0 — never negative, never NaN — when either timestamp is absent
 * or unparseable, since a malformed SEQUENCE would break the export outright.
 */
function deriveSequence(session: ICalSessionInput): number {
  const createdMs = Date.parse(session.created_at ?? '');
  const updatedMs = Date.parse(session.updated_at ?? '');

  if (!Number.isFinite(createdMs) || !Number.isFinite(updatedMs)) return 0;

  const seconds = Math.floor((updatedMs - createdMs) / 1000);
  return seconds > 0 ? seconds : 0;
}

/**
 * Sanitize a string for use in filename (Content-Disposition header)
 * Replaces non-alphanumeric characters with hyphens, lowercases, and truncates
 */
function sanitizeFilename(text: string): string {
  return (
    text
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .substring(0, 50)
  );
}

/**
 * Parse time string (HH:MM or HH:MM:SS) into [hours, minutes]
 */
function parseTime(timeStr: string): { hours: number; minutes: number } {
  const parts = timeStr.split(':');
  return {
    hours: parseInt(parts[0], 10),
    minutes: parseInt(parts[1], 10),
  };
}

/**
 * Create a timezone-aware ISO string for iCal
 * ical-generator expects ISO strings with timezone info
 */
function buildISODateTime(sessionDate: string, timeString: string): string {
  const { hours, minutes } = parseTime(timeString);
  // Combine date and time into ISO format (no Z suffix — let ical-generator handle timezone)
  return `${sessionDate}T${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:00`;
}

/**
 * Build description text for iCal event from session details
 */
function buildEventDescription(session: ICalSessionInput): string {
  const parts: string[] = [];

  if (session.objectives) {
    parts.push(`Objetivos:\n${session.objectives}`);
  }

  if (session.school_name) {
    parts.push(`Escuela: ${session.school_name}`);
  }

  if (session.growth_community_name) {
    parts.push(`Comunidad de Crecimiento: ${session.growth_community_name}`);
  }

  if (session.join_url) {
    parts.push(`Enlace de Reunión: ${session.join_url}`);
  }

  if (session.description) {
    parts.push(`Descripción:\n${session.description}`);
  }

  return parts.join('\n\n');
}

/**
 * Build location text for iCal event
 */
function buildEventLocation(session: ICalSessionInput): string | undefined {
  const parts: string[] = [];

  if (session.location) {
    parts.push(session.location);
  }

  if (session.join_url && session.location) {
    // If both exist, include both
    parts.push(`Reunión Online: ${session.join_url}`);
  } else if (session.join_url) {
    // If only online, use as location
    return session.join_url;
  }

  return parts.length > 0 ? parts.join(' / ') : undefined;
}

/**
 * Options for {@link createSessionCalendar}.
 */
export interface CreateSessionCalendarOptions {
  /**
   * Whether facilitator ATTENDEE entries may be serialized.
   *
   * ATTENDEE is an e-mail channel: `ical-generator` emits
   * `ATTENDEE;…;CN="Nombre":MAILTO:persona@colegio.cl`, and an .ics is a
   * plain-text artifact that travels outside the platform. So this follows the
   * same rule as every other participant e-mail (admins, the session's own
   * facilitators, and school-scoped or global consultors —
   * `canViewParticipantEmails`), and everyone else gets a calendar entry with
   * no attendees at all. A mailto-less ATTENDEE is not useful iCal, so the
   * entries are omitted rather than stripped down to a name.
   *
   * Defaults to FALSE: a caller that forgets to make a decision leaks nothing.
   */
  includeAttendees?: boolean;
}

/**
 * Create an iCal calendar object from an array of sessions
 * Handles timezone setup, event generation, and alarm configuration
 *
 * ATTENDEE is the only e-mail-bearing field this generator can emit: no
 * ORGANIZER, no CN parameters outside ATTENDEE, and no custom X- properties
 * are set. Keep it that way — anything new that carries an address has to go
 * behind `options.includeAttendees` too.
 *
 * @param sessions - Array of session data to include in calendar
 * @param calendarName - Optional calendar name (default: "Sesiones de Consultoría")
 * @param options - Disclosure options; see {@link CreateSessionCalendarOptions}
 * @returns ical-generator ICalCalendar object (call .toString() to get iCal string)
 */
export function createSessionCalendar(
  sessions: ICalSessionInput[],
  calendarName: string = 'Sesiones de Consultoría',
  options: CreateSessionCalendarOptions = {}
): ICalCalendar {
  const cal = ical({
    name: calendarName,
    description: 'Calendario de sesiones de capacitación y consultoría',
    // A VTIMEZONE generator, not just a TZID string: without the component,
    // strict clients have to guess Chile's UTC offset for the event date and
    // DST transitions land an hour off.
    timezone: {
      name: SESSION_TIMEZONE,
      generator: getVtimezoneComponent,
    },
    prodId: {
      company: 'FNE Genera',
      product: 'Consultor Sessions',
      language: 'ES',
    },
  });

  // Add each session as a VEVENT
  sessions.forEach((session) => {
    const eventData: ICalEventData = {
      id: `${session.id}@genera.fne.cl`,
      start: buildISODateTime(session.session_date, session.start_time),
      end: buildISODateTime(session.session_date, session.end_time),
      summary: session.title,
      description: buildEventDescription(session),
      location: buildEventLocation(session),
      url: session.join_url || undefined,
      status: mapStatusToICalStatus(session.status),
      sequence: deriveSequence(session),
      timezone: SESSION_TIMEZONE,
      alarms: [
        {
          type: ICalAlarmType.display,
          triggerBefore: 30 * 60, // 30-minute reminder (seconds)
          description: 'Recordatorio de sesión',
        },
      ],
    };

    // Add facilitators as attendees — privileged callers only (see
    // CreateSessionCalendarOptions.includeAttendees).
    if (options.includeAttendees && session.facilitators && session.facilitators.length > 0) {
      eventData.attendees = session.facilitators
        .filter((f) => f.email) // Only include facilitators with email
        .map((f) => ({
          name: f.first_name && f.last_name ? `${f.first_name} ${f.last_name}` : (f.email ?? ''),
          email: f.email!,
          role: ICalAttendeeRole.CHAIR,
          status: ICalAttendeeStatus.ACCEPTED,
          rsvp: false,
        }));
    }

    cal.createEvent(eventData);
  });

  return cal;
}

/**
 * Generate a filename for a batch export based on date range or count
 */
export function generateExportFilename(count: number, filterLabel?: string): string {
  const date = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
  const label = filterLabel ? sanitizeFilename(filterLabel) : `sesiones-${count}`;
  return `${label}_${date}.ics`;
}

/**
 * Generate a filename for a single session export
 */
export function generateSessionExportFilename(session: ICalSessionInput): string {
  const sanitized = sanitizeFilename(session.title);
  return `sesion-${sanitized}.ics`;
}
