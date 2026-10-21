/**
 * A7a — `/pasantias` is the destination, and the retired INSPIRA flipbook is gone.
 *
 * ## Why this is a test and not a grep in a report
 *
 * A7a is a link round: every "PASANTÍAS" nav entry and the footer link moved from
 * the homepage teaser anchor (`#pasantias` / `/#pasantias`) to the real page, the
 * two Heyzine flipbooks of the retired Abril 2026 INSPIRA brochure came off the
 * site, and the homepage's two stock images were swapped. Every one of those is
 * provable by a grep, and every one of them evaporates the moment somebody edits
 * a file — which is exactly what happened to `/pasantias` itself: it shipped
 * finished and orphaned, and nothing in the suite noticed for a whole phase.
 *
 * So the greps live here instead.
 *
 * ## Why the file list is walked rather than written down
 *
 * Seven files carried the old links. Listing those seven would cover the round
 * and nothing after it: the eighth page, added next month with a nav copied from
 * one of the seven, would reintroduce `/#pasantias` with the suite green. The
 * scope is therefore *derived* — every `.tsx` under `pages/`, plus
 * `components/Footer.tsx`, which is the shared footer every public page renders.
 * This is the same reasoning `__tests__/pages/pasantias-hardcoded-cohort.test.ts`
 * records for its own leaf walk, and the same reasoning
 * `scripts/check-price-leak.mjs` records for its bundle walk.
 *
 * ## Why the href scan reads hrefs instead of searching the source
 *
 * `source.includes('#pasantias')` cannot be used here, because `pages/index.tsx`
 * legitimately keeps `id="pasantias"` on the homepage teaser section — external
 * links and bookmarks point at it, and A7a preserves it deliberately. A substring
 * search would either fail on the preserved anchor or be relaxed until it proved
 * nothing. {@link hrefOccurrences} reads the `href` **values** instead, so the
 * `id` is invisible to it and the preservation gets its own assertion in the
 * opposite direction: delete the anchor and this file goes red on purpose.
 *
 * The Directivos flipbooks get the same treatment. They stay, so they are pinned
 * as *present*: a later flipbook purge is then a deliberate act with a failing
 * test to answer, not a silent one.
 *
 * `it('every page keeps the /pasantias links it was given', …)` is the
 * anti-vacuity check. Every absence assertion below is of the form "no occurrence
 * matches", which a scanner that finds no occurrences at all satisfies perfectly;
 * the count test pins the destinations this round created, so a regex that stops
 * matching fails loudly instead of going quietly green.
 *
 * ## Why the counts are per file, and exact (A9)
 *
 * A7a shipped with two gaps that A9 closed, and both were the same mistake in two
 * places: an assertion that asked whether something existed *somewhere in scope*
 * rather than *where it belongs*.
 *
 *  - The Directivos flipbooks were pinned site-wide, so deleting one from
 *    `pages/programas.tsx` while `pages/index.tsx` still carried it left the guard
 *    green. Both pages offer the brochure; both offers are the thing protected.
 *  - The href check proved only that *at least one* `/pasantias` href survived per
 *    file, and separately that no `#pasantias` href existed. A nav entry labelled
 *    PASANTÍAS repointed to `/programas` passed both: no anchor appears, and the
 *    file still holds its other `/pasantias` links. An exact per-file count is what
 *    makes losing or repointing one of the fifteen go red.
 *
 * Both maps below are derived by reading the tree, never by convention. A page that
 * legitimately gains or loses a link edits its number here and says why — which is
 * the point: the change becomes deliberate instead of invisible.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { COHORT_HEADLINE, COHORT_PROGRAMS } from '../../lib/pasantias/cohort-public';

const REPO_ROOT = join(__dirname, '..', '..');
const PAGES_DIR = join(REPO_ROOT, 'pages');
const FOOTER_PATH = join(REPO_ROOT, 'components', 'Footer.tsx');

/* ------------------------------------------------------------------ the scope */

interface ScannedFile {
  /** Repo-relative, forward-slashed, so failure messages are clickable. */
  path: string;
  source: string;
}

function repoRelative(absolute: string): string {
  return relative(REPO_ROOT, absolute).split(sep).join('/');
}

/** Every `.tsx` under `dir`, at any depth. */
function walkTsx(dir: string): string[] {
  const found: string[] = [];

  for (const entry of readdirSync(dir)) {
    const absolute = join(dir, entry);

    if (statSync(absolute).isDirectory()) {
      found.push(...walkTsx(absolute));
      continue;
    }

    if (entry.endsWith('.tsx')) found.push(absolute);
  }

  return found;
}

function readAll(paths: string[]): ScannedFile[] {
  return paths.map((absolute) => ({
    path: repoRelative(absolute),
    source: readFileSync(absolute, 'utf8'),
  }));
}

const SCOPE = readAll([...walkTsx(PAGES_DIR), FOOTER_PATH]);

const INDEX_PATH = 'pages/index.tsx';

function fileInScope(path: string): ScannedFile {
  const file = SCOPE.find((candidate) => candidate.path === path);
  if (file === undefined) throw new Error(`${path} is not in scope; the walk or the path is wrong`);
  return file;
}

/* ------------------------------------------------------------ the occurrences */

interface Occurrence {
  path: string;
  /** 1-based, so it matches what an editor and `grep -n` show. */
  line: number;
  /** The offending text itself, trimmed of surrounding whitespace. */
  text: string;
}

/** `pages/index.tsx:189 — href="#pasantias"` — how every failure below reads. */
function formatOccurrence(found: Occurrence): string {
  return `${found.path}:${found.line} — ${found.text}`;
}

function lineOf(source: string, index: number): number {
  return source.slice(0, index).split('\n').length;
}

function matchesIn(files: ScannedFile[], pattern: RegExp): Occurrence[] {
  return files.flatMap(({ path, source }) =>
    [...source.matchAll(new RegExp(pattern.source, `${pattern.flags.replace('g', '')}g`))].map(
      (match) => ({
        path,
        line: lineOf(source, match.index ?? 0),
        text: match[0].trim(),
      })
    )
  );
}

interface HrefOccurrence extends Occurrence {
  /** The href's value with its quotes removed. */
  href: string;
}

/**
 * Every `href` whose value is a literal, with that value read out.
 *
 * Four spellings, because JSX has four and this repo's five hand-written public
 * pages use more than one of them: `href="…"`, `href='…'`, `href={'…'}` and an
 * uninterpolated `` href={`…`} ``. An href built from an expression is not read —
 * there is nothing to read — which is a miss this cannot avoid and never a false
 * positive.
 */
function hrefOccurrences(files: ScannedFile[]): HrefOccurrence[] {
  const pattern =
    /href\s*=\s*(?:"([^"]*)"|'([^']*)'|\{\s*(?:"([^"]*)"|'([^']*)'|`([^`${]*)`)\s*\})/g;

  return files.flatMap(({ path, source }) =>
    [...source.matchAll(pattern)].map((match) => ({
      path,
      line: lineOf(source, match.index ?? 0),
      text: match[0].trim(),
      href: match[1] ?? match[2] ?? match[3] ?? match[4] ?? match[5] ?? '',
    }))
  );
}

/* --------------------------------------------------------------- the flipbooks */

/** The retired Abril 2026 INSPIRA brochure: the iframe and its "nueva pestaña" link. */
const INSPIRA_FLIPBOOK_IDS = ['fef3878d3c', 'fb8cf2cfb1'] as const;

/**
 * The Directivos brochure, which stays. Pinned present, not absent — and pinned to
 * the file that carries it, for the reason in the header.
 *
 * `d87d80f309` is the iframe and is on both pages; `92bf9eb5ee` is the homepage's
 * "nueva pestaña" link and is only there.
 */
const DIRECTIVOS_FLIPBOOKS: ReadonlyArray<{ path: string; ids: readonly string[] }> = [
  { path: INDEX_PATH, ids: ['d87d80f309', '92bf9eb5ee'] },
  { path: 'pages/programas.tsx', ids: ['d87d80f309'] },
];

/** The two homepage images A7a retired from the app; both files stay on disk. */
const RETIRED_HOMEPAGE_IMAGES = ['/barcelona-innovation.jpg', '/barcelona-skyline.jpg'] as const;

/* ---------------------------------------------------------------- the links */

const PASANTIAS_HREF = '/pasantias';

/**
 * How many literal `/pasantias` hrefs each file carries — fifteen in total, which
 * is the number A7a recorded when it rewired the site.
 *
 * Exact rather than "at least one", for the reason in the header. An href built
 * from an expression is invisible to {@link hrefOccurrences} and therefore is not
 * counted here either; that is a miss the scanner cannot avoid, and never a false
 * positive.
 */
const PASANTIAS_HREF_COUNTS: ReadonlyArray<{ path: string; count: number }> = [
  { path: INDEX_PATH, count: 3 },
  { path: 'pages/programas.tsx', count: 3 },
  { path: 'pages/equipo.tsx', count: 2 },
  { path: 'pages/nosotros.tsx', count: 2 },
  { path: 'pages/noticias.tsx', count: 2 },
  { path: 'pages/noticias/[slug].tsx', count: 2 },
  { path: 'components/Footer.tsx', count: 1 },
];

/* -------------------------------------------------------------------- the guard */

describe('A7a — the site points at /pasantias', () => {
  it('walks a scope that actually contains the pages it is meant to cover', () => {
    // The walk is the whole guard: a scope that silently collects nothing would
    // satisfy every "no occurrence" assertion below.
    expect(SCOPE.map((file) => file.path)).toEqual(
      expect.arrayContaining([
        INDEX_PATH,
        'pages/programas.tsx',
        'pages/nosotros.tsx',
        'pages/equipo.tsx',
        'pages/noticias.tsx',
        'pages/noticias/[slug].tsx',
        'components/Footer.tsx',
      ])
    );
  });

  it('every page keeps the /pasantias links it was given', () => {
    // Both the anti-vacuity check for every "no occurrence" assertion below and
    // the guard against the failure A7a's version could not see: a PASANTÍAS nav
    // entry quietly repointed somewhere else, in a file that still holds other
    // /pasantias links. Compared as formatted strings so the failure names the
    // file and both numbers instead of reporting `3 !== 2` with no address.
    const describeCount = (path: string, found: number, expected: number) =>
      `${path}: ${found} /pasantias href(s), expected ${expected}`;

    const actual = PASANTIAS_HREF_COUNTS.map(({ path, count }) =>
      describeCount(
        path,
        hrefOccurrences([fileInScope(path)]).filter((found) => found.href === PASANTIAS_HREF)
          .length,
        count
      )
    );

    expect(actual).toEqual(
      PASANTIAS_HREF_COUNTS.map(({ path, count }) => describeCount(path, count, count))
    );
  });

  it('no href targets the homepage teaser anchor', () => {
    const offenders = hrefOccurrences(SCOPE)
      .filter((found) => found.href.includes('#pasantias'))
      .map(formatOccurrence);

    expect(offenders).toEqual([]);
  });

  it('the homepage keeps its #pasantias section anchor', () => {
    // Preserved on purpose — external links and bookmarks point at it. A cleanup
    // that deletes the anchor fails here rather than breaking them quietly.
    const anchors = matchesIn([fileInScope(INDEX_PATH)], /id="pasantias"/g).map(formatOccurrence);

    expect(anchors.length, `${INDEX_PATH} no longer carries id="pasantias"`).toBeGreaterThan(0);
  });

  it('the retired INSPIRA flipbooks are gone from the site', () => {
    const offenders = matchesIn(SCOPE, new RegExp(INSPIRA_FLIPBOOK_IDS.join('|'), 'g')).map(
      formatOccurrence
    );

    expect(offenders).toEqual([]);
  });

  it('the Directivos flipbooks are still on each page that offers them', () => {
    // Per file, not site-wide: the site-wide form was satisfied by any single
    // surviving copy, so losing the offer from one of the two pages was invisible.
    const missing = DIRECTIVOS_FLIPBOOKS.flatMap(({ path, ids }) =>
      ids
        .filter((id) => matchesIn([fileInScope(path)], new RegExp(id, 'g')).length === 0)
        .map((id) => `${path} — ${id}`)
    );

    expect(
      missing,
      'a Directivos flipbook left the page that carries it; A7a removed only the INSPIRA pair'
    ).toEqual([]);
  });

  it('no page states the retired Abril 2026 cohort', () => {
    const offenders = matchesIn(SCOPE, /Abril 2026/g).map(formatOccurrence);

    expect(offenders).toEqual([]);
  });

  it('the homepage no longer references the retired images', () => {
    const index = fileInScope(INDEX_PATH);
    const offenders = RETIRED_HOMEPAGE_IMAGES.flatMap((image) =>
      matchesIn([index], new RegExp(image.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'))
    ).map(formatOccurrence);

    expect(offenders).toEqual([]);
  });
});

/**
 * PASANT-B003, C004: the homepage's cohort card promotes January 2027 and both
 * programs, read from the public module — and no page states October 2026 as
 * the running cohort. The expected January values are typed here from the
 * ratified contract (page 1 headline, page 3 program names), not imported.
 */
describe('C004 — the homepage promotes the January 2027 cohort', () => {
  it('prints the cohort headline and both program names from the public module', () => {
    const { source } = fileInScope(INDEX_PATH);

    expect(source).toMatch(
      /import \{ COHORT_HEADLINE, COHORT_PROGRAMS \} from '\.\.\/lib\/pasantias\/cohort-public';/
    );
    expect(source).toMatch(/data-testid="cohort-headline">\{COHORT_HEADLINE\}</);
    expect(source).toMatch(/data-testid="cohort-programs"/);
    expect(source).toContain('COHORT_PROGRAMS.map((program) => program.name)');
    // And never as literals in the page.
    expect(source).not.toContain('Enero, 18 al 29');
    expect(source).not.toContain('Pasantía INSPIRA');
    expect(source).not.toContain('INSPIRA Mirada Profunda');
  });

  it('the module values the card prints are January’s, pinned independently', () => {
    expect(COHORT_HEADLINE).toBe('Enero, 18 al 29 · 2027');
    expect(COHORT_PROGRAMS.map((program) => program.name).join(' · ')).toBe(
      'Pasantía INSPIRA · INSPIRA Mirada Profunda'
    );
  });

  it('no page states the retired October 2026 cohort as running', () => {
    const offenders = matchesIn(SCOPE, /Octubre 2026|octubre-2026|Octubre, 5 al 16/g).map(
      formatOccurrence
    );

    expect(offenders).toEqual([]);
  });
});

/**
 * PASANT-B003 F5 (Sol copy-discovery review): three cards inside the homepage's
 * `#pasantias` teaser, under "¿Qué incluye la experiencia?", promised benefits the
 * ratified January contract does not support — an international certification
 * with official recognition, networking with education leaders from all over the
 * world, and a scarcity badge. They were corrected as text only; the card and
 * badge markup is unchanged.
 *
 * The expected copy is typed here against the contract's own wording, never read
 * from the page:
 *  - page 16 `both.includes`: "Bibliografía básica recomendada para preparar el
 *    viaje, una bitácora y un sistema de registro de los aprendizajes, presentado
 *    al menos un mes antes del viaje."
 *  - page 8 `both.dayStructure`: "Presentación del proyecto educativo y entrevista
 *    con la dirección" and "Visita guiada, entrevistas con estudiantes y
 *    educadores" — the exchange is with the schools that receive the group.
 *  - page 17 `cohort.places`: "Los cupos de la cohorte de enero se confirman por
 *    orden de reserva."
 *
 * Scoped to the exact retired phrases: `pages/index.tsx` uses the word
 * "Certificación" again in an unrelated section, which this correction does not
 * touch.
 */
describe('F5 — the homepage teaser claims only ratified January benefits', () => {
  it('the three unsupported claims are gone from the homepage', () => {
    const offenders = matchesIn(
      [fileInScope(INDEX_PATH)],
      /Certificación Internacional|reconocimiento oficial|Networking Internacional|líderes educativos de todo el mundo|CUPOS LIMITADOS|¡CUPOS|LIMITADOS!/g
    ).map(formatOccurrence);

    expect(offenders).toEqual([]);
  });

  it('the learning-log card states the included bibliography, log and record system', () => {
    const { source } = fileInScope(INDEX_PATH);

    expect(source).toContain(
      '<h4 className="font-bold text-lg mb-1">Bitácora de Aprendizajes</h4>'
    );
    expect(source).toContain(
      'Recibe bibliografía recomendada, una bitácora y un sistema de registro de tus aprendizajes al menos un mes antes del viaje'
    );
  });

  it('the exchange card is narrowed to the schools that receive the group', () => {
    const { source } = fileInScope(INDEX_PATH);

    expect(source).toContain(
      '<h4 className="font-bold text-lg mb-1">Intercambio con las Escuelas</h4>'
    );
    expect(source).toContain(
      'Conversa con los equipos directivos, educadores y estudiantes de las escuelas que te reciben'
    );
  });

  it('the badge states the ratified booking-order rule and keeps its treatment', () => {
    const { source } = fileInScope(INDEX_PATH);

    // The badge container and both line classes are the pre-F5 markup, so a
    // redesign fails here as surely as a reworded claim does.
    expect(source).toMatch(
      /<div className="absolute -top-4 -right-4 bg-black text-white rounded-full p-4 shadow-xl border-2 border-black">\s*<p className="text-xs font-bold">CUPOS POR<\/p>\s*<p className="text-xs font-bold">ORDEN DE RESERVA<\/p>\s*<\/div>/
    );
  });
});
