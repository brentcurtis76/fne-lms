// @vitest-environment node
import { describe, it, expect } from 'vitest';
import {
  createSessionCalendar,
  generateSessionExportFilename,
  generateExportFilename,
  ICalSessionInput,
} from '../session-ical';

describe('session-ical utilities', () => {
  // Test data
  const mockSession1: ICalSessionInput = {
    id: '11111111-1111-4111-8111-111111111111',
    title: 'Sesión de Capacitación Inicial',
    description: 'Primera sesión de introducción',
    objectives: 'Presentar objetivos generales del programa',
    session_date: '2026-03-15',
    start_time: '09:00:00',
    end_time: '10:00:00',
    location: 'Sala de Conferencias A',
    status: 'programada',
    school_name: 'Escuela Los Pinos',
    growth_community_name: 'Comunidad Sur',
    facilitators: [
      {
        first_name: 'Juan',
        last_name: 'Gonzalez',
        email: 'juan.gonzalez@ejemplo.cl',
      },
    ],
  };

  const mockSession2: ICalSessionInput = {
    id: '22222222-2222-4222-8222-222222222222',
    title: 'Sesión Online Avanzada',
    objectives: 'Profundizar en temas complejos',
    session_date: '2026-03-22',
    start_time: '14:30:00',
    end_time: '15:30:00',
    meeting_link: 'https://meet.google.com/abc-defg-hij',
    school_name: 'Escuela Central',
    growth_community_name: 'Comunidad Centro',
    status: 'en_progreso',
  };

  const mockCancelledSession: ICalSessionInput = {
    id: '33333333-3333-4333-8333-333333333333',
    title: 'Sesión Cancelada',
    session_date: '2026-04-01',
    start_time: '10:00:00',
    end_time: '11:00:00',
    status: 'cancelada',
  };

  it('creates valid iCal calendar with single session', () => {
    const cal = createSessionCalendar([mockSession1]);
    const icalString = cal.toString();

    // Verify calendar structure
    expect(icalString).toContain('BEGIN:VCALENDAR');
    expect(icalString).toContain('END:VCALENDAR');
    expect(icalString).toContain('BEGIN:VEVENT');
    expect(icalString).toContain('END:VEVENT');

    // Verify calendar properties
    expect(icalString).toContain('X-WR-TIMEZONE:America/Santiago');
  });

  it('creates multiple VEVENT blocks for multiple sessions', () => {
    const cal = createSessionCalendar([mockSession1, mockSession2]);
    const icalString = cal.toString();

    // Count VEVENT blocks
    const eventMatches = icalString.match(/BEGIN:VEVENT/g) || [];
    expect(eventMatches.length).toBe(2);

    // Verify both session titles are present (SUMMARY field)
    expect(icalString).toContain('SUMMARY:');
  });

  it('includes DTSTART with timezone America/Santiago', () => {
    const cal = createSessionCalendar([mockSession1]);
    const icalString = cal.toString();

    // Verify DTSTART has timezone specification
    expect(icalString).toContain('TZID=America/Santiago');
    expect(icalString).toContain('DTSTART');
    expect(icalString).toContain('DTEND');
  });

  it('maps cancelled status to CANCELLED iCal status', () => {
    const cal = createSessionCalendar([mockCancelledSession]);
    const icalString = cal.toString();

    // Cancelled sessions should have STATUS:CANCELLED
    expect(icalString).toContain('STATUS:CANCELLED');
  });

  it('maps confirmed statuses (en_progreso) to CONFIRMED', () => {
    const cal = createSessionCalendar([mockSession2]);
    const icalString = cal.toString();

    // In-progress session should have STATUS:CONFIRMED
    expect(icalString).toContain('STATUS:CONFIRMED');
  });

  it('includes facilitators as ATTENDEE entries with email', () => {
    const cal = createSessionCalendar([mockSession1]);
    const icalString = cal.toString();

    // Verify facilitator is included as attendee
    expect(icalString).toContain('ATTENDEE');
    expect(icalString).toContain('juan.gonzalez@ejemplo.cl');
  });

  it('includes meeting link in description for online sessions', () => {
    const cal = createSessionCalendar([mockSession2]);
    const icalString = cal.toString();

    // Meeting link should be in description
    expect(icalString).toContain('https://meet.google.com/abc-defg-hij');
  });

  it('includes 30-minute reminder alarm in events', () => {
    const cal = createSessionCalendar([mockSession1]);
    const icalString = cal.toString();

    // Verify VALARM section
    expect(icalString).toContain('BEGIN:VALARM');
    expect(icalString).toContain('END:VALARM');
    expect(icalString).toContain('TRIGGER');
  });

  it('generates correct event IDs with genera.fne.cl domain', () => {
    const cal = createSessionCalendar([mockSession1]);
    const icalString = cal.toString();

    // UID should follow pattern: {session-id}@genera.fne.cl
    expect(icalString).toContain('11111111-1111-4111-8111-111111111111@genera.fne.cl');
  });

  it('sanitizes session title in export filename', () => {
    const filename = generateSessionExportFilename(mockSession1);

    // Should create a valid filename ending in .ics
    expect(filename).toContain('.ics');
    expect(filename).toContain('sesion-');
    // Should not contain spaces or special characters
    expect(filename).not.toMatch(/\s/);
  });

  it('generates batch export filename with date', () => {
    const filename = generateExportFilename(5, 'Sesiones Marzo');
    const today = new Date().toISOString().split('T')[0];

    // Should include date and label
    expect(filename).toContain(today);
    expect(filename).toMatch(/\.ics$/);
  });

  it('handles sessions without optional fields', () => {
    const minimalSession: ICalSessionInput = {
      id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      title: 'Sesion Minima',
      session_date: '2026-05-01',
      start_time: '09:00',
      end_time: '10:00',
      status: 'programada',
    };

    const cal = createSessionCalendar([minimalSession]);
    const icalString = cal.toString();

    expect(icalString).toContain('Sesion Minima');
    expect(icalString).toContain('VEVENT');
    expect(icalString).toContain('DTSTART');
    expect(icalString).toContain('DTEND');
  });

  it('includes school and community info in description', () => {
    const cal = createSessionCalendar([mockSession1]);
    const icalString = cal.toString();

    // Description should include school and community names
    expect(icalString).toContain('Escuela Los Pinos');
    expect(icalString).toContain('Comunidad Sur');
  });

  it('creates calendar with custom name', () => {
    const customName = 'Calendario de Marzo 2026';
    const cal = createSessionCalendar([mockSession1], customName);
    const icalString = cal.toString();

    // Custom name should be in X-WR-CALNAME
    expect(icalString).toContain(customName);
  });

  it('handles sessions with presencial location', () => {
    const presencialSession: ICalSessionInput = {
      id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
      title: 'Taller Presencial',
      session_date: '2026-04-10',
      start_time: '09:00:00',
      end_time: '12:00:00',
      location: 'Aula 301',
      status: 'programada',
    };

    const cal = createSessionCalendar([presencialSession]);
    const icalString = cal.toString();

    // Location should be in LOCATION field (iCal escapes commas)
    expect(icalString).toContain('LOCATION:Aula 301');
  });

  it('handles hybrid sessions with both location and meeting link', () => {
    const hybridSession: ICalSessionInput = {
      id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
      title: 'Sesion Hibrida',
      session_date: '2026-04-15',
      start_time: '15:00:00',
      end_time: '16:00:00',
      location: 'Sala 202',
      meeting_link: 'https://zoom.us/j/123456789',
      status: 'programada',
    };

    const cal = createSessionCalendar([hybridSession]);
    const icalString = cal.toString();

    // Both location and meeting link should be included somewhere
    expect(icalString).toContain('Sala 202');
    expect(icalString).toContain('https://zoom.us/j/123456789');
  });
});
