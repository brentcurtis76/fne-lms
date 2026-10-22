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

/** The markup from the `fromTestId` hook up to the `toTestId` hook. */
function markupBetween(html: string, fromTestId: string, toTestId: string): string {
  const start = html.indexOf(`data-testid="${fromTestId}"`);
  const end = html.indexOf(`data-testid="${toTestId}"`, start + 1);
  if (start === -1 || end === -1) throw new Error(`section ${fromTestId} → ${toTestId} not found`);
  return html.slice(start, end);
}

/** What a reader sees in each `<li>` of that stretch, in document order. */
function itemsBetween(html: string, fromTestId: string, toTestId: string): string[] {
  return [...markupBetween(html, fromTestId, toTestId).matchAll(/<li\b[^>]*>([\s\S]*?)<\/li>/g)].map(
    ([, inner]) =>
      inner
        .replace(/<[^>]*>/g, ' ')
        .replace(/&#x27;/g, "'")
        .replace(/&quot;/g, '"')
        .replace(/&amp;/g, '&')
        .replace(/\s+/g, ' ')
        .trim()
  );
}

/** Heading levels, in document order, in that stretch. */
function headingLevels(html: string, fromTestId: string, toTestId: string): number[] {
  return [...markupBetween(html, fromTestId, toTestId).matchAll(/<h([1-6])\b/g)].map(([, level]) =>
    Number(level)
  );
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

/**
 * PASANT-SCHOOL-SECTION-01 — "Cómo es un día" and "Las escuelas"
 * (`docs/plan/pasantias-school-section-20261022.md`). Contract sentences are
 * typed from the January contract and the display copy from the plan doc, for
 * the reason this file's header gives.
 */
describe('/pasantias school section (PASANT-SCHOOL-SECTION-01)', () => {
  let html = '';

  beforeAll(async () => {
    html = await renderPasantias();
  });

  /** The text of the element carrying `testId`, when it holds text only. */
  function ownText(testId: string): string {
    const at = html.indexOf(`data-testid="${testId}"`);
    if (at === -1) throw new Error(`no element with data-testid="${testId}"`);
    return html.slice(html.indexOf('>', at) + 1, html.indexOf('<', at));
  }

  /** both.dayStructure (page 8), in order, beside its display numeral and heading. */
  const DAY = [
    ['01', 'Conocer', 'Presentación del proyecto educativo y entrevista con la dirección'],
    ['02', 'Observar y Preguntar', 'Visita guiada, entrevistas con estudiantes y educadores'],
    ['03', 'Profundizar', 'Talleres con expertos del movimiento de Nueva Educación'],
  ] as const;

  describe('Cómo es un día', () => {
    it('keeps the section, its eyebrow and its title, then sets the intro beside the still', () => {
      const section = opening(html, 'pasantias-dia-tipo');
      expect(section).toMatch(/^<section /);
      expect(section).toContain('id="un-dia"');

      const head = textBetween(html, 'pasantias-dia-tipo', 'pasantias-dia-lead');
      expect(head).toContain('Dentro de la escuela');
      expect(head).toContain('Cómo es un día');
      expect(textBetween(html, 'pasantias-dia-lead', 'pasantias-dia-photo').trim()).toBe(
        'La escuela, contada por quienes la hacen.'
      );
      // The heading comes first in reading order; the still follows it.
      expect(html.indexOf('id="dia-title"')).toBeLessThan(html.indexOf('data-testid="pasantias-dia-photo"'));
    });

    it('shows the unmasked video still at its own size, lazily, with an alt that names no school, place or person', () => {
      const img = opening(html, 'pasantias-dia-photo');
      expect(img).toMatch(/^<img /);
      expect(img).toContain('src="/images/pasantias/card-on-glass.webp"');
      expect(img).toContain('width="1280"');
      expect(img).toContain('height="720"');
      expect(img).toContain('loading="lazy"');
      expect(img).toContain('decoding="async"');

      const alt = /alt="([^"]*)"/.exec(img)?.[1] ?? '';
      expect(alt.trim().length).toBeGreaterThan(0);
      expect(alt).not.toMatch(/Escola|Institut|Virolai|Sadako|Barcelona|Catalu|INSPIRA|Mirada/i);

      // Not a link and not captioned: nothing on it claims where it was taken.
      const before = html.slice(0, html.indexOf('data-testid="pasantias-dia-photo"'));
      expect(before.lastIndexOf('<a ')).toBeLessThan(before.lastIndexOf('</a>'));
      expect(markupBetween(html, 'pasantias-dia-tipo', 'pasantias-escuelas')).not.toContain('<figcaption');
    });

    it('numbers the moments 01–03 in one ordered list, each with its heading and the contract sentence unchanged', () => {
      const section = markupBetween(html, 'pasantias-dia-tipo', 'pasantias-escuelas');
      expect(section.match(/<ol\b/g)).toHaveLength(1);
      expect(section.match(/<li\b/g)).toHaveLength(DAY.length);
      expect(headingLevels(html, 'pasantias-dia-tipo', 'pasantias-escuelas')).toEqual([2, 3, 3, 3]);

      DAY.forEach(([numeral, heading, sentence], index) => {
        expect(
          textBetween(html, `pasantias-day-block-${index}-numeral`, `pasantias-day-block-${index}-text`).trim()
        ).toBe(`${numeral} ${heading}`);
        expect(ownText(`pasantias-day-block-${index}-text`)).toBe(sentence);
      });
    });

    it('puts the gold numerals on black, never on the warm band (order r2 B4)', () => {
      for (const index of DAY.keys()) {
        const classes = classOf(html, `data-testid="pasantias-day-block-${index}-numeral"`).split(/\s+/);
        expect(classes).toContain('bg-brand_primary');
        expect(classes).toContain('text-brand_accent');
      }
    });
  });

  describe('Las escuelas', () => {
    it('opens the INSPIRA chapter with its name and its own overview sentence', () => {
      const intro = textBetween(html, 'pasantias-escuelas-inspira', 'pasantias-escuelas-inspira-semana-1');
      expect(intro).toContain('Pasantía INSPIRA');
      expect(intro).toContain(
        '6 escuelas: una semana de inmersión en dos escuelas y una semana de visitas a cuatro'
      );
    });

    it('labels week 1 by the module and shows the two immersion schools, 2,5 days each', () => {
      const week = textBetween(html, 'pasantias-escuelas-inspira-semana-1', 'pasantias-escuelas-inspira-semana-2');
      expect(week.trim()).toMatch(/^Semana 1 — inmersión /);
      expect(
        itemsBetween(html, 'pasantias-escuelas-inspira-semana-1', 'pasantias-escuelas-inspira-semana-2')
      ).toEqual(['Escola Virolai 2,5 días por pasante', 'Escola Sadako 2,5 días por pasante']);
    });

    it('labels week 2 by the module and shows all five candidates as name-only cards, unmarked', () => {
      const week = textBetween(html, 'pasantias-escuelas-inspira-semana-2', 'pasantias-escuelas-mirada-profunda');
      expect(week.trim()).toMatch(/^Semana 2 — visitas /);
      expect(ownText('pasantias-visit-count')).toBe('Cada cohorte visita 4 de estas 5 escuelas.');
      expect(
        itemsBetween(html, 'pasantias-escuelas-inspira-semana-2', 'pasantias-escuelas-mirada-profunda')
      ).toEqual([
        'Institut Escola El Puig',
        'Escola La Maquinista',
        'Escola Octavio Paz',
        'Institut Angeleta Ferrer',
        'Institut Escola Les Vinyes',
      ]);
      expect(week).toContain(
        'La selección y el orden se definen con el grupo, según sus intereses y la disponibilidad de cada escuela.'
      );
      expect(ownText('pasantias-full-day')).toBe(
        'Institut Escola El Puig y Institut Escola Les Vinyes están fuera de Barcelona y toman el día completo.'
      );
    });

    it('lists the five Mirada Profunda schools by name and states their two full days once', () => {
      expect(itemsBetween(html, 'pasantias-escuelas-mirada-profunda', 'pasantias-mirada-extra')).toEqual([
        'Escola Virolai',
        'Escola Sadako',
        'Institut Angeleta Ferrer',
        'Institut Escola El Puig',
        'Institut Escola Les Vinyes',
      ]);

      const chapter = textBetween(html, 'pasantias-escuelas-mirada-profunda', 'pasantias-mirada-extra');
      expect(ownText('pasantias-mirada-days')).toBe('2 días completos por escuela');
      expect(chapter.match(/días completos/g)).toHaveLength(1);
      expect(chapter).toContain(
        'El orden de las escuelas se confirma con cada una según su disponibilidad y puede cambiar. Una de ellas puede repartir sus dos días entre el viernes 22 y el lunes 25.'
      );
      // Amber 700 on cream, not the gold (order r2 B4).
      const classes = classOf(html, 'data-testid="pasantias-mirada-days"').split(/\s+/);
      expect(classes).toContain('text-brand_accent_text');
      expect(classes).not.toContain('text-brand_accent');
    });

    it('nests the headings section → program → week → school, skipping no level', () => {
      expect(headingLevels(html, 'pasantias-escuelas', 'pasantias-mirada-extra')).toEqual([
        2, 3, 4, 5, 5, 4, 5, 5, 5, 5, 5, 3, 4, 4, 4, 4, 4,
      ]);
    });

    it('states no seven schools, no consecutive days and no fixed visit sequence', () => {
      const escuelas = textBetween(html, 'pasantias-escuelas', 'pasantias-mirada-extra');
      expect(escuelas).not.toMatch(/consecutiv|siete|7 escuelas|uno tras otro/i);
    });
  });
});
