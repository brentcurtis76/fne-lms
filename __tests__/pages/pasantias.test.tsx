/**
 * PASANT-DESIGN-POLISH-01 — focused render checks for the `/pasantias` polish.
 *
 * The page is rendered once, server-side, against the real public cohort
 * module. That the page is *wired* to the module (no fact typed into it) is
 * `pasantias-hardcoded-cohort.test.ts`'s job; this file pins the polish itself:
 * the two hosts in their order, the same-page shortcuts and their anchors, the
 * short CTA labels, the hero's routes, the weekend printed once and the note
 * beside the form. Layout, scrolling and keyboard behaviour in a real browser
 * are `tests/e2e/pasantias-page.spec.ts` and `tests/e2e/pasantias-form.spec.ts`.
 *
 * The addendum's strings (`docs/plan/pasantias-polish-addendum-20261022.md`) are
 * typed here rather than read from the module, for the same reason the e2e
 * specs type theirs: an expectation read from what is rendered is corrupted
 * together with it.
 */
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

import PasantiasPage, { getServerSideProps } from '../../pages/pasantias';

async function renderPasantias(): Promise<string> {
  const result = (await getServerSideProps({
    req: { headers: { host: 'localhost:3000' } },
  } as never)) as { props: Record<string, unknown> };

  return renderToStaticMarkup(React.createElement(PasantiasPage as never, result.props));
}

/** The markup of the element carrying `data-testid="<testId>"`, up to the next hook. */
function opening(html: string, testId: string): string {
  const start = html.indexOf(`data-testid="${testId}"`);
  if (start === -1) throw new Error(`no element with data-testid="${testId}"`);
  return html.slice(html.lastIndexOf('<', start), html.indexOf('>', start) + 1);
}

/**
 * Text from the inside of the `fromTestId` element up to the `toTestId` hook,
 * tags removed — what a reader sees in that stretch.
 */
function textBetween(html: string, fromTestId: string, toTestId: string): string {
  const start = html.indexOf(`data-testid="${fromTestId}"`);
  const end = html.indexOf(`data-testid="${toTestId}"`, start + 1);
  if (start === -1 || end === -1) throw new Error(`section ${fromTestId} → ${toTestId} not found`);
  return html
    .slice(html.indexOf('>', start) + 1, html.lastIndexOf('<', end))
    .replace(/<[^>]*>/g, ' ')
    .replace(/&#x27;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ');
}

/** A link's own text: from the end of its opening tag to its `</a>`. */
function linkText(html: string, testId: string): string {
  const at = html.indexOf(`data-testid="${testId}"`);
  if (at === -1) throw new Error(`no element with data-testid="${testId}"`);
  return html.slice(html.indexOf('>', at) + 1, html.indexOf('</a>', at));
}

/** An element's `class` attribute, read off the tag that carries `marker`. */
function classOf(html: string, marker: string): string {
  const at = html.indexOf(marker);
  if (at === -1) throw new Error(`no ${marker}`);
  const tag = html.slice(html.lastIndexOf('<', at), html.indexOf('>', at) + 1);
  return /class="([^"]*)"/.exec(tag)?.[1] ?? '';
}

describe('/pasantias polish (PASANT-DESIGN-POLISH-01)', () => {
  let html = '';

  beforeAll(async () => {
    html = await renderPasantias();
  });

  describe('P2 — Quién te recibe shows both hosts, Jordi Musons first', () => {
    it('renders exactly two host cards, in the addendum order', () => {
      expect(html.match(/data-testid="pasantias-host-\d+"/g)).toEqual([
        'data-testid="pasantias-host-0"',
        'data-testid="pasantias-host-1"',
      ]);

      const first = textBetween(html, 'pasantias-host-0', 'pasantias-host-1');
      expect(first).toContain('Jordi Musons');
      expect(first).toContain('Director, Escola Sadako —');
      expect(first).toContain('Anfitrión');

      const second = textBetween(html, 'pasantias-host-1', 'pasantias-incluye');
      expect(second).toContain('Sandra Entrena');
      expect(second).toContain('Encargada de Innovación, Escola Virolai —');
      expect(second).toContain('Anfitriona');
    });

    it('gives both hosts their real portrait in the same square box', () => {
      const jordi = opening(html, 'pasantias-host-portrait-0');
      const sandra = opening(html, 'pasantias-host-portrait-1');

      expect(jordi).toContain('src="/images/pasantias/equipo/jordi-musons.png"');
      expect(sandra).toContain('src="/images/pasantias/equipo/sandra-entrena.jpg"');
      expect(classOf(html, 'data-testid="pasantias-host-portrait-0"')).toBe(
        classOf(html, 'data-testid="pasantias-host-portrait-1"')
      );
      expect(classOf(html, 'data-testid="pasantias-host-portrait-0"')).toContain('aspect-square');
      expect(html).not.toContain('data-testid="pasantias-host-initials-');
    });

    it('keeps the brochure spelling and the October placeholder out', () => {
      const equipo = textBetween(html, 'pasantias-equipo', 'pasantias-incluye');
      expect(equipo).not.toContain('Mussons');
      expect(equipo).not.toContain('Experto invitado');
    });
  });

  describe('P7 — the same-page shortcuts', () => {
    const SHORTCUTS = [
      ['pasantias-shortcut-programas', 'Programas', 'programas'],
      ['pasantias-shortcut-calendario', 'Calendario', 'calendario'],
      ['pasantias-shortcut-incluye', 'Qué incluye', 'incluye'],
      ['pasantias-shortcut-inscripcion', 'Inscripción', 'programa'],
    ] as const;

    it('lists the four shortcuts in order, in a labelled, non-sticky nav before the hero', () => {
      const nav = opening(html, 'pasantias-shortcuts');
      expect(nav).toMatch(/^<nav /);
      expect(nav).toContain('aria-label="En esta página"');
      expect(classOf(html, 'data-testid="pasantias-shortcuts"')).not.toMatch(/\b(?:sticky|fixed)\b/);

      // Outside the sticky header, ahead of the hero.
      const headerEnd = html.indexOf('</header>');
      const navAt = html.indexOf('data-testid="pasantias-shortcuts"');
      expect(navAt).toBeGreaterThan(headerEnd);
      expect(navAt).toBeLessThan(html.indexOf('data-testid="pasantias-hero"'));

      const positions = SHORTCUTS.map(([testId]) => html.indexOf(`data-testid="${testId}"`));
      expect(positions.every((at) => at > -1)).toBe(true);
      expect([...positions].sort((a, b) => a - b)).toEqual(positions);
    });

    const shortcutCases: [string, string, string][] = SHORTCUTS.map(
      ([testId, label, id]) => [testId, label, id]
    );

    it.each(shortcutCases)('%s reads "%s" and points at a section that exists', (testId, label, id) => {
      const link = opening(html, testId);
      expect(link).toContain(`href="#${id}"`);
      expect(linkText(html, testId)).toBe(label);
      expect(html).toContain(`id="${id}"`);
    });

    it('offsets every target by at least the sticky header (h-20 plus its border)', () => {
      for (const id of ['programas', 'calendario', 'incluye', 'programa']) {
        expect([id, classOf(html, `id="${id}"`)]).toEqual([
          id,
          expect.stringMatching(/\bscroll-mt-(?:20|24)\b/),
        ]);
      }
    });
  });

  describe('P3/P6 — the hero routes and the program CTAs', () => {
    it('names both routes in the hero, offers "Ver los programas" and keeps both hero CTAs', () => {
      // `pasantias-cta-programa` (the registration CTA) is matched with its
      // closing quote, so it is never the `pasantias-cta-programas` link.
      const routes = textBetween(html, 'pasantias-hero-routes', 'pasantias-cta-programa');
      expect(routes).toContain('¿Primera vez? Pasantía INSPIRA');
      expect(routes).toContain('¿Ya viajaste? Mirada Profunda');

      expect(opening(html, 'pasantias-cta-programas')).toContain('href="#programas"');
      expect(linkText(html, 'pasantias-cta-programas')).toBe('Ver los programas');
      expect(opening(html, 'pasantias-cta-programa')).toContain('href="#programa"');
      expect(opening(html, 'pasantias-cta-ficha')).toContain('href="/api/pasantias/ficha"');
    });

    it('labels each program CTA with its short name and sends it to the form', () => {
      for (const [id, label] of [
        ['inspira', 'Me interesa INSPIRA'],
        ['mirada-profunda', 'Me interesa Mirada Profunda'],
      ] as const) {
        const testId = `pasantias-cta-program-${id}`;
        expect([id, linkText(html, testId)]).toEqual([id, label]);
        expect(opening(html, testId)).toContain('href="#programa"');
        // Room to wrap rather than spill on a 375 px card, and centred.
        expect(classOf(html, `data-testid="${testId}"`)).toMatch(/\bmin-h-\[52px\]/);
        expect(classOf(html, `data-testid="${testId}"`)).toMatch(/\btext-center\b/);
        expect(classOf(html, `data-testid="${testId}"`)).not.toMatch(/(?:^|\s)h-\[52px\]/);
      }
    });
  });

  describe('P5/P8 — the shared weekend and the note beside the form', () => {
    it('prints the weekend once, as a range below both calendars, and its wording in the FAQ', () => {
      expect(
        textBetween(html, 'pasantias-free-weekend-dates', 'pasantias-dia-tipo').trim()
      ).toBe('23 de enero al 24 de enero');

      const inspiraAt = html.indexOf('data-testid="pasantias-calendar-inspira"');
      const miradaAt = html.indexOf('data-testid="pasantias-calendar-mirada-profunda"');
      const findeAt = html.indexOf('data-testid="pasantias-finde"');
      expect(inspiraAt).toBeLessThan(miradaAt);
      expect(miradaAt).toBeLessThan(findeAt);

      const calendario = textBetween(html, 'pasantias-calendario', 'pasantias-dia-tipo');
      expect(calendario.match(/23 de enero/g)).toHaveLength(1);
      expect(calendario).not.toContain('Sábado 23 y domingo 24 de enero');
      expect(textBetween(html, 'pasantias-faq', 'pasantias-cierre')).toContain(
        'Sábado 23 y domingo 24 de enero'
      );
    });

    it('says beside the form that registering does not reserve a place, without a mail promise', () => {
      const note = textBetween(html, 'pasantias-registration-note', 'pasantias-cta-ficha-programa');
      expect(note).toContain('Registrar tu interés no reserva un cupo.');
      expect(note).toContain('descargar la ficha y el programa completo');
      expect(note).not.toMatch(/correo|te enviamos|te enviaremos|recibirás/i);

      const placesAt = html.indexOf('data-testid="pasantias-places"');
      const noteAt = html.indexOf('data-testid="pasantias-registration-note"');
      expect(noteAt).toBeGreaterThan(placesAt);
      expect(noteAt).toBeLessThan(html.indexOf('data-testid="pasantias-lead-form"'));
    });
  });
});
