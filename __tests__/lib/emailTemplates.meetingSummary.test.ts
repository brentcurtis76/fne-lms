// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { meetingSummaryTemplate, type MeetingSummaryEmailData } from '../../lib/emailTemplates';

const baseData = (overrides: Partial<MeetingSummaryEmailData> = {}): MeetingSummaryEmailData => ({
  title: 'Retro Q2',
  communityName: 'Comunidad Alfa',
  meetingDates: [new Date('2026-04-20T16:00:00Z')],
  facilitatorName: 'Ana Pérez',
  finalizerName: 'Diego Torres',
  audience: 'community',
  attendees: [
    { name: 'Ana Pérez', attended: true, role: 'participant' },
  ],
  summaryHtml: '<p>Resumen</p>',
  notesHtml: '',
  agreementsHtml: '',
  commitmentsHtml: '',
  meetingUrl: 'https://app.genera.cl/meetings/1',
  ...overrides,
});

describe('meetingSummaryTemplate XSS hardening', () => {
  it('escapes malicious HTML in the title', () => {
    const html = meetingSummaryTemplate.generateHTML(
      baseData({ title: '<img src=x onerror=alert(1)>' })
    );
    expect(html).not.toContain('<img src=x onerror=alert(1)>');
    expect(html).toContain('&lt;img src=x onerror=alert(1)&gt;');
  });

  it('escapes malicious HTML in the subject', () => {
    const subjectFn = meetingSummaryTemplate.subject as (d: MeetingSummaryEmailData) => string;
    const subject = subjectFn(baseData({ title: '<script>alert(1)</script>' }));
    expect(subject).not.toContain('<script>');
    expect(subject).toContain('&lt;script&gt;');
  });

  it('escapes communityName, facilitatorName, and finalizerName', () => {
    const html = meetingSummaryTemplate.generateHTML(
      baseData({
        communityName: '<b>community</b>',
        facilitatorName: '<script>alert(1)</script>',
        finalizerName: '"><img src=x onerror=alert(1)>',
      })
    );
    expect(html).not.toContain('<script>alert(1)</script>');
    expect(html).not.toContain('<b>community</b>');
    expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
    expect(html).toContain('&lt;b&gt;community&lt;/b&gt;');
    expect(html).toContain('&quot;&gt;&lt;img src=x onerror=alert(1)&gt;');
  });

  it('escapes attendee name and role', () => {
    const html = meetingSummaryTemplate.generateHTML(
      baseData({
        attendees: [
          { name: '<script>alert(1)</script>', attended: true, role: '<b>admin</b>' },
        ],
      })
    );
    expect(html).not.toContain('<script>alert(1)</script>');
    expect(html).not.toContain('<b>admin</b>');
    expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
    expect(html).toContain('&lt;b&gt;admin&lt;/b&gt;');
  });

  it('omits href when meetingUrl is javascript: protocol', () => {
    const html = meetingSummaryTemplate.generateHTML(
      baseData({ meetingUrl: 'javascript:alert(1)' })
    );
    expect(html).not.toContain('javascript:alert(1)');
    expect(html).not.toContain('Ver reunión en Genera');
  });

  it('omits href when meetingUrl is data: protocol', () => {
    const html = meetingSummaryTemplate.generateHTML(
      baseData({ meetingUrl: 'data:text/html,<script>alert(1)</script>' })
    );
    expect(html).not.toContain('data:text/html');
    expect(html).not.toContain('Ver reunión en Genera');
  });

  it('omits href when meetingUrl is malformed', () => {
    const html = meetingSummaryTemplate.generateHTML(
      baseData({ meetingUrl: 'not a url' })
    );
    expect(html).not.toContain('Ver reunión en Genera');
  });

  it('keeps href when meetingUrl is a valid https URL', () => {
    const html = meetingSummaryTemplate.generateHTML(
      baseData({ meetingUrl: 'https://app.genera.cl/m/1' })
    );
    expect(html).toContain('href="https://app.genera.cl/m/1"');
  });

  it('does not double-escape already-safe ampersands in titles', () => {
    const html = meetingSummaryTemplate.generateHTML(
      baseData({ title: 'A & B' })
    );
    expect(html).toContain('A &amp; B');
  });
});
