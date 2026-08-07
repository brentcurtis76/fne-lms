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
 * `it('the scan can see hrefs at all', …)` is the anti-vacuity check. Every
 * assertion below is of the form "no occurrence matches", which a scanner that
 * finds no occurrences at all satisfies perfectly; the sanity test pins the
 * destination hrefs this round created, so a regex that stops matching fails
 * loudly instead of going quietly green.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

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

/** The Directivos brochure, which stays. Pinned present, not absent. */
const DIRECTIVOS_FLIPBOOK_IDS = ['d87d80f309', '92bf9eb5ee'] as const;

/** The two homepage images A7a retired from the app; both files stay on disk. */
const RETIRED_HOMEPAGE_IMAGES = ['/barcelona-innovation.jpg', '/barcelona-skyline.jpg'] as const;

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

  it('the scan can see hrefs at all', () => {
    const destinations = hrefOccurrences(SCOPE)
      .filter((found) => found.href === '/pasantias')
      .map((found) => found.path);

    expect(destinations).toEqual(
      expect.arrayContaining([INDEX_PATH, 'pages/programas.tsx', 'components/Footer.tsx'])
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

  it('the Directivos flipbooks are still on the site', () => {
    const missing = DIRECTIVOS_FLIPBOOK_IDS.filter(
      (id) => matchesIn(SCOPE, new RegExp(id, 'g')).length === 0
    );

    expect(missing, 'a Directivos flipbook disappeared; A7a removed only the INSPIRA pair').toEqual(
      []
    );
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
