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
    join_url: 'https://genera.test/meet/session/22222222-2222-4222-8222-222222222222',
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

  it('omits ATTENDEE entries by default — the fail-closed case', () => {
    // ATTENDEE is an e-mail channel (`ATTENDEE;…;CN="…":MAILTO:…`) and an .ics
    // travels outside the platform, so a caller that does not explicitly claim
    // the privilege gets a calendar with no attendees at all. A mailto-less
    // ATTENDEE is not useful iCal, so the entries are omitted, not stripped.
    const cal = createSessionCalendar([mockSession1]);
    const icalString = cal.toString();

    expect(icalString).not.toContain('ATTENDEE');
    expect(icalString).not.toContain('juan.gonzalez@ejemplo.cl');
    // The event itself is still there — only the attendee channel is gone
    expect(icalString).toContain('BEGIN:VEVENT');
    expect(icalString).toContain('SUMMARY:');
  });

  it('includes facilitators as ATTENDEE entries with email when privileged', () => {
    const cal = createSessionCalendar([mockSession1], 'Sesiones de Consultoría', {
      includeAttendees: true,
    });
    const icalString = cal.toString();

    expect(icalString).toContain('ATTENDEE');
    expect(icalString).toContain('juan.gonzalez@ejemplo.cl');
  });

  it('includes the platform meeting link in description for online sessions', () => {
    const cal = createSessionCalendar([mockSession2]);
    const icalString = cal.toString();

    // Platform link (not the raw provider link) travels in the .ics
    expect(icalString.replace(/\r\n /g, '')).toContain(
      'https://genera.test/meet/session/22222222-2222-4222-8222-222222222222'
    );
  });

  it('emits a VTIMEZONE component for America/Santiago', () => {
    const cal = createSessionCalendar([mockSession1]);
    const icalString = cal.toString();

    // Without the component, strict clients have to guess Chile's offset
    expect(icalString).toContain('BEGIN:VTIMEZONE');
    expect(icalString).toContain('TZID:America/Santiago');
    expect(icalString).toContain('END:VTIMEZONE');
    // DST rules present, so the offset resolves on both sides of a transition
    expect(icalString).toContain('BEGIN:STANDARD');
    expect(icalString).toContain('BEGIN:DAYLIGHT');
  });

  it('exposes the platform link as the event URL property', () => {
    const cal = createSessionCalendar([mockSession2]);
    const icalString = cal.toString().replace(/\r\n /g, '');

    expect(icalString).toContain(
      'URL;VALUE=URI:https://genera.test/meet/session/22222222-2222-4222-8222-222222222222'
    );
  });

  it('has no URL property when the session has no meeting', () => {
    const cal = createSessionCalendar([mockSession1]);
    // Anchored to a line start: VTIMEZONE carries a TZURL line of its own
    expect(cal.toString()).not.toMatch(/\r\nURL[;:]/);
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
      join_url: 'https://genera.test/meet/session/cccccccc-cccc-4ccc-8ccc-cccccccccccc',
      status: 'programada',
    };

    const cal = createSessionCalendar([hybridSession]);
    const icalString = cal.toString();

    // Both location and the platform meeting link should be included somewhere
    const unfolded = icalString.replace(/\r\n /g, '');
    expect(unfolded).toContain('Sala 202');
    expect(unfolded).toContain(
      'https://genera.test/meet/session/cccccccc-cccc-4ccc-8ccc-cccccccccccc'
    );
  });

  /**
   * SEQUENCE (Z2-4b). RFC 5545 §3.8.7.4: a client replaces an event it already
   * holds only when the incoming VEVENT carries the same UID and a strictly
   * greater SEQUENCE. Assertions read the serialized .ics text, never an
   * intermediate object, because the .ics is what the client actually sees.
   */
  describe('SEQUENCE — revision tracking', () => {
    const SEQ_ID = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';

    /** Pull SEQUENCE out of the serialized calendar; null when absent. */
    function readSequence(ics: string): number | null {
      const match = ics.replace(/\r\n /g, '').match(/^SEQUENCE:(-?\d+)$/m);
      return match ? Number(match[1]) : null;
    }

    const baseSeqSession: ICalSessionInput = {
      id: SEQ_ID,
      title: 'Sesion con Revisiones',
      session_date: '2026-05-04',
      start_time: '11:00:00',
      end_time: '12:00:00',
      status: 'programada',
      created_at: '2026-05-01T10:00:00.000Z',
      updated_at: '2026-05-01T10:00:00.000Z',
    };

    const render = (session: ICalSessionInput) => createSessionCalendar([session]).toString();

    it('emits SEQUENCE:0 for a session that was never updated', () => {
      const ics = render(baseSeqSession);

      expect(ics.replace(/\r\n /g, '')).toContain('SEQUENCE:0');
      expect(readSequence(ics)).toBe(0);
    });

    it('emits a SEQUENCE above zero once the session has been updated', () => {
      const ics = render({
        ...baseSeqSession,
        updated_at: '2026-05-01T10:01:30.000Z', // 90 s after creation
      });

      expect(readSequence(ics)).toBe(90);
    });

    it('keeps the UID stable and raises SEQUENCE across two exports of the same session', () => {
      // The property the whole chunk exists for: the second export must be
      // recognisable as a revision of the first, not as a different event.
      const firstIcs = render({
        ...baseSeqSession,
        updated_at: '2026-05-01T10:00:10.000Z',
      });
      const secondIcs = render({
        ...baseSeqSession,
        start_time: '15:00:00', // rescheduled
        end_time: '16:00:00',
        updated_at: '2026-05-02T10:00:00.000Z',
      });

      const uidOf = (ics: string) => ics.replace(/\r\n /g, '').match(/^UID:(.+)$/m)?.[1];

      expect(uidOf(firstIcs)).toBe(`${SEQ_ID}@genera.fne.cl`);
      expect(uidOf(secondIcs)).toBe(uidOf(firstIcs));
      expect(readSequence(secondIcs)!).toBeGreaterThan(readSequence(firstIcs)!);
    });

    it('raises SEQUENCE when the session is cancelled, alongside STATUS:CANCELLED', () => {
      // A tombstone whose SEQUENCE did not move is a tombstone the client ignores.
      const beforeIcs = render({
        ...baseSeqSession,
        updated_at: '2026-05-01T10:00:20.000Z',
      });
      const cancelledIcs = render({
        ...baseSeqSession,
        status: 'cancelada',
        updated_at: '2026-05-03T09:00:00.000Z',
      });

      expect(cancelledIcs.replace(/\r\n /g, '')).toContain('STATUS:CANCELLED');
      expect(readSequence(cancelledIcs)!).toBeGreaterThan(readSequence(beforeIcs)!);
    });

    it.each([
      ['both timestamps missing', {}],
      ['created_at missing', { updated_at: '2026-05-02T10:00:00.000Z' }],
      ['updated_at missing', { created_at: '2026-05-01T10:00:00.000Z' }],
      ['null timestamps', { created_at: null, updated_at: null }],
      ['unparseable timestamps', { created_at: 'no-es-fecha', updated_at: 'tampoco' }],
      ['empty strings', { created_at: '', updated_at: '' }],
      [
        'updated_at before created_at',
        { created_at: '2026-05-05T10:00:00.000Z', updated_at: '2026-05-01T10:00:00.000Z' },
      ],
    ])('degrades to SEQUENCE:0 when %s, and still generates', (_label, overrides) => {
      const withoutTimestamps = { ...baseSeqSession };
      delete withoutTimestamps.created_at;
      delete withoutTimestamps.updated_at;
      const ics = render({ ...withoutTimestamps, ...overrides } as ICalSessionInput);

      expect(readSequence(ics)).toBe(0);
      expect(ics).toContain('BEGIN:VEVENT');
      expect(ics).toContain('END:VCALENDAR');
      expect(ics).not.toMatch(/SEQUENCE:(-|NaN)/);
    });

    it('sub-second updates floor to 0 rather than to a fraction', () => {
      const ics = render({
        ...baseSeqSession,
        updated_at: '2026-05-01T10:00:00.400Z',
      });

      expect(readSequence(ics)).toBe(0);
    });
  });
});
