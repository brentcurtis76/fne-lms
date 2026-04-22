// @vitest-environment node

/**
 * Unit tests for the meetingSummary email template.
 * Pure string rendering — no DB or network calls.
 */

import { describe, it, expect } from 'vitest';
import {
  meetingSummaryTemplate,
  type MeetingSummaryData,
  dailyDigestTemplate,
  weeklyDigestTemplate,
  immediateNotificationTemplate,
  testEmailTemplate,
} from '../../lib/emailTemplates';

function baseData(overrides: Partial<MeetingSummaryData> = {}): MeetingSummaryData {
  return {
    title: 'Reunión de Coordinación',
    meetingDates: [new Date('2026-04-10T15:00:00Z')],
    facilitatorName: 'Ana Facilitadora',
    finalizerName: 'Luis Cierre',
    audience: 'Comunidad Piloto 2026',
    attendees: ['María Pérez', 'Juan Soto'],
    summaryHtml: '<p>Se revisaron los avances del piloto.</p>',
    notesHtml: '<p>Notas tomadas durante la sesión.</p>',
    agreementsHtml: '<li>Aprobar plan anual</li><li>Revisar presupuesto</li>',
    commitmentsHtml:
      '<tr><td>Enviar acta</td><td>Ana</td><td>2026-04-20</td></tr>' +
      '<tr><td>Agendar próxima</td><td>Luis</td><td>2026-04-22</td></tr>',
    ...overrides,
  };
}

describe('meetingSummaryTemplate.generateHTML', () => {
  it('renders core sections with meeting metadata', () => {
    const html = meetingSummaryTemplate.generateHTML(baseData());

    expect(html).toContain('Reunión de Coordinación');
    expect(html).toContain('Comunidad Piloto 2026');
    expect(html).toContain('Ana Facilitadora');
    expect(html).toContain('Luis Cierre');

    expect(html).toContain('Resumen');
    expect(html).toContain('Se revisaron los avances del piloto.');
    expect(html).toContain('Acuerdos');
    expect(html).toContain('Aprobar plan anual');
    expect(html).toContain('Compromisos');
    expect(html).toContain('Enviar acta');
    expect(html).toContain('Asistentes');
    expect(html).toContain('María Pérez');
  });

  it('renders multi-session header text when meetingDates.length > 1', () => {
    const html = meetingSummaryTemplate.generateHTML(
      baseData({
        meetingDates: [
          new Date('2026-04-01T15:00:00Z'),
          new Date('2026-04-08T15:00:00Z'),
          new Date('2026-04-15T15:00:00Z'),
        ],
      }),
    );

    expect(html).toContain('Realizada en 3 sesiones entre');
  });

  it('does NOT include multi-session text when only a single date', () => {
    const html = meetingSummaryTemplate.generateHTML(baseData());
    expect(html).not.toContain('Realizada en ');
  });

  it('hides Notes section when notesHtml is empty or blank', () => {
    const htmlEmpty = meetingSummaryTemplate.generateHTML(baseData({ notesHtml: '' }));
    expect(htmlEmpty).not.toMatch(/<h3[^>]*>\s*Notas\s*<\/h3>/);

    const htmlBlank = meetingSummaryTemplate.generateHTML(
      baseData({ notesHtml: '<p>&nbsp;</p>' }),
    );
    expect(htmlBlank).not.toMatch(/<h3[^>]*>\s*Notas\s*<\/h3>/);

    const htmlWithNotes = meetingSummaryTemplate.generateHTML(baseData());
    expect(htmlWithNotes).toMatch(/<h3[^>]*>\s*Notas\s*<\/h3>/);
  });

  it('includes optional facilitator message at the top when provided', () => {
    const html = meetingSummaryTemplate.generateHTML(
      baseData({ facilitatorMessageHtml: '<p>Gracias por participar.</p>' }),
    );

    expect(html).toContain('Mensaje del facilitador');
    expect(html).toContain('Gracias por participar.');

    const facilitatorIdx = html.indexOf('Mensaje del facilitador');
    const summaryIdx = html.search(/<h3[^>]*>\s*Resumen\s*<\/h3>/);
    expect(facilitatorIdx).toBeGreaterThan(-1);
    expect(summaryIdx).toBeGreaterThan(-1);
    expect(facilitatorIdx).toBeLessThan(summaryIdx);
  });

  it('omits facilitator message block when not provided', () => {
    const html = meetingSummaryTemplate.generateHTML(baseData());
    expect(html).not.toContain('Mensaje del facilitador');
  });

  it('wraps agreements in an ordered list and commitments in a table with headers', () => {
    const html = meetingSummaryTemplate.generateHTML(baseData());
    expect(html).toContain('<ol');
    expect(html).toContain('Aprobar plan anual');
    expect(html).toContain('<table');
    expect(html).toContain('Compromiso');
    expect(html).toContain('Responsable');
    expect(html).toContain('Fecha límite');
  });

  it('shows fallback text when attendees list is empty', () => {
    const html = meetingSummaryTemplate.generateHTML(baseData({ attendees: [] }));
    expect(html).toContain('Sin asistentes registrados');
  });

  it('uses the shared email layout footer', () => {
    const html = meetingSummaryTemplate.generateHTML(baseData());
    expect(html).toContain('Fundación Nueva Educación');
    expect(html).toContain('Administrar preferencias de notificación');
  });
});

describe('meetingSummaryTemplate.subject', () => {
  it('produces a subject line that includes the meeting title', () => {
    const subjectFn = meetingSummaryTemplate.subject;
    expect(typeof subjectFn).toBe('function');
    const result = (subjectFn as (d: MeetingSummaryData) => string)(baseData());
    expect(result).toContain('Reunión de Coordinación');
    expect(result).toContain('Genera');
  });
});

describe('meetingSummaryTemplate.generateText', () => {
  it('produces a non-empty, structured plain-text fallback', () => {
    const text = meetingSummaryTemplate.generateText!(baseData());

    expect(text).toBeTruthy();
    expect(text.length).toBeGreaterThan(100);
    expect(text).toContain('Reunión de Coordinación');
    expect(text).toContain('Comunidad: Comunidad Piloto 2026');
    expect(text).toContain('RESUMEN');
    expect(text).toContain('NOTAS');
    expect(text).toContain('ACUERDOS');
    expect(text).toContain('COMPROMISOS');
    expect(text).toContain('ASISTENTES');
    expect(text).toContain('María Pérez');
    expect(text).not.toMatch(/<[a-z]/i);
  });

  it('includes multi-session header text in the plain-text version', () => {
    const text = meetingSummaryTemplate.generateText!(
      baseData({
        meetingDates: [
          new Date('2026-04-01T15:00:00Z'),
          new Date('2026-04-15T15:00:00Z'),
        ],
      }),
    );
    expect(text).toContain('Realizada en 2 sesiones entre');
  });

  it('omits the NOTAS section when notes are empty', () => {
    const text = meetingSummaryTemplate.generateText!(baseData({ notesHtml: '' }));
    expect(text).not.toContain('NOTAS');
  });

  it('includes the facilitator message heading when provided', () => {
    const text = meetingSummaryTemplate.generateText!(
      baseData({ facilitatorMessageHtml: '<p>Gracias.</p>' }),
    );
    expect(text).toContain('MENSAJE DEL FACILITADOR');
    expect(text).toContain('Gracias.');
  });
});

describe('existing template exports are not regressed', () => {
  it('still exports the other templates', () => {
    expect(dailyDigestTemplate).toBeDefined();
    expect(typeof dailyDigestTemplate.generateHTML).toBe('function');
    expect(weeklyDigestTemplate).toBeDefined();
    expect(typeof weeklyDigestTemplate.generateHTML).toBe('function');
    expect(immediateNotificationTemplate).toBeDefined();
    expect(typeof immediateNotificationTemplate.generateHTML).toBe('function');
    expect(testEmailTemplate).toBeDefined();
    expect(typeof testEmailTemplate.generateHTML).toBe('function');
  });
});
