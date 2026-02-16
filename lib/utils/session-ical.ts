/**
 * iCal generation utilities for Consultor Sessions
 * Exports sessions in RFC 5545 compliant .ics format for calendar applications
 */

import ical, { ICalAlarmType, ICalAttendeeRole, ICalAttendeeStatus, ICalEventStatus } from 'ical-generator';
import type { ICalCalendar, ICalEventData } from 'ical-generator';
import { SessionStatus } from '../types/consultor-sessions.types';
import { SESSION_TIMEZONE } from './session-timezone';

/**
 * Input data for iCal event generation
 * Subset of ConsultorSession + related fields needed for calendar export
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
  meeting_link?: string | null;
  status: SessionStatus;
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

  if (session.meeting_link) {
    parts.push(`Enlace de Reunión: ${session.meeting_link}`);
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

  if (session.meeting_link && session.location) {
    // If both exist, include both
    parts.push(`Reunión Online: ${session.meeting_link}`);
  } else if (session.meeting_link) {
    // If only online, use as location
    return session.meeting_link;
  }

  return parts.length > 0 ? parts.join(' / ') : undefined;
}

/**
 * Create an iCal calendar object from an array of sessions
 * Handles timezone setup, event generation, and alarm configuration
 *
 * @param sessions - Array of session data to include in calendar
 * @param calendarName - Optional calendar name (default: "Sesiones de Consultoría")
 * @returns ical-generator ICalCalendar object (call .toString() to get iCal string)
 */
export function createSessionCalendar(
  sessions: ICalSessionInput[],
  calendarName: string = 'Sesiones de Consultoría'
): ICalCalendar {
  const cal = ical({
    name: calendarName,
    description: 'Calendario de sesiones de capacitación y consultoría',
    timezone: SESSION_TIMEZONE,
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
      status: mapStatusToICalStatus(session.status),
      timezone: SESSION_TIMEZONE,
      alarms: [
        {
          type: ICalAlarmType.display,
          triggerBefore: 30 * 60, // 30-minute reminder (seconds)
          description: 'Recordatorio de sesión',
        },
      ],
    };

    // Add facilitators as attendees if provided
    if (session.facilitators && session.facilitators.length > 0) {
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
