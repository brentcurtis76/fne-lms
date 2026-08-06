/**
 * A6r [A1] — no cohort fact may be written as a literal in the `/pasantias`
 * source, and every fact the page shows must actually come from the module.
 *
 * ## Why this guard was rewritten in r3
 *
 * Until r3 this file scanned the page source against a **hand-maintained list of
 * strings** with `source.includes()`. Sol found the list incomplete, which is the
 * third time on this project that a hand-enumerated guard has been found
 * incomplete: the leak scanner's separator list was wrong three times, by three
 * different authors, before it was fixed by deriving the set instead of listing
 * it. The same fix is applied here.
 *
 * Two mechanisms now run, and they cover different failure modes:
 *
 * 1. **A derived source scan.** Every primitive leaf of `COHORT_PUBLIC` is
 *    collected by walking the object, so a field added to the module later is
 *    covered without anyone remembering to add it. The scan still cannot see
 *    numbers, booleans, short words or composition (`['Escola','Virolai']
 *    .join(' ')` defeats any substring check), which is why it is only half.
 *
 * 2. **A render contract.** The page is rendered once as it stands, then once
 *    per leaf with that single leaf changed in the module, and the mutated value
 *    is required to **appear in the output**. This is what catches the cases a
 *    substring scan cannot: `{COHORT_VISIT_DAY_COUNT}` replaced by a literal
 *    `9`, a composed school name, a nine-character `lodgingArea`.
 *
 * ## Why the contract was tightened in r4
 *
 * Until r4 the contract asserted the render *changed*, and that is satisfiable
 * without rendering anything. The PM hardcoded `2,5` in place of
 * `{formatDays(immersionDays)}` and the guard passed 15/15: mutating one
 * immersion school's `immersionDays` makes the two schools disagree,
 * `uniformImmersionDays()` returns `null`, and the whole "días cada una" clause
 * disappears. The render changed — by *collapsing*, not by printing the new
 * value — so the leaf read as wired while the page showed a stale literal.
 *
 * This was never specific to `immersionDays`. Any leaf read through a
 * conditional, an aggregate, a uniqueness check or a length comparison can
 * satisfy "changed" by vanishing. So the assertion is now containment: the
 * mutated value has to be *on the page*, and this leaf's copy of the old value
 * has to be off it.
 *
 * Three outcomes are therefore possible per leaf, and each is declared rather
 * than assumed:
 *
 * - **rendered** — the mutated value appears. The default; anything undeclared
 *   must reach it.
 * - **consumed** — the output moved but the value itself is never printable:
 *   `fullDay` is read as a flag, `tier` is compared with `=== 'inmersion'`
 *   rather than shown. Only the weaker "changed" check is available, so these
 *   are named in {@link UNPRINTABLE_LEAVES} with the reason.
 * - **absent** — the output does not move at all. Named in
 *   {@link EXPECTED_GAPS} with the reason.
 *
 * Every list is asserted in *both* directions: a declared leaf that starts
 * rendering fails here and its excuse must be deleted, and a leaf in no list
 * must render. A new module field that nobody wires fails too, because it
 * belongs to no list.
 *
 * ## What r5 added
 *
 * Two shapes the r4 contract could not see. Both were found by the reviewer and
 * both were reproduced on the branch as it stood.
 *
 * 1. **Collection sizes.** The contract walks and mutates primitive *leaves*;
 *    it never changes an array's shape. But the page publishes several facts
 *    read off `.length` — `Las 7 escuelas`, `Los 13 objetivos`, `3 días para
 *    Barcelona o Europa` — and each of them could be typed in as a literal with
 *    all 21 assertions still green, because no leaf of the module moves when a
 *    school is added or dropped. Collections are now derived beside the leaves
 *    and each is grown by one plausible sibling, after which the page has to
 *    print the number it became. {@link publishesCount} is where the count is
 *    told apart from everything else an append moves, of which there is plenty.
 *
 *    Counting the page over is only half of it, and the half that misses the
 *    literal the reviewer actually reported. `COHORT_SCHOOLS.length` is printed
 *    twice; type `7` into one of them and the other still puts an `8` on the
 *    page and still takes a `7` off it, so both count comparisons pass. The
 *    round's first attempt at this was green against exactly that page. So the
 *    collection is also shrunk past its present size, on a module whose prose
 *    has been marked out of the way ({@link quietValue}), and the size it used
 *    to have has to be gone from the page — one surviving `7` is one literal.
 *    See {@link printsStaleSize}.
 *
 * 2. **A suffix cannot move a value the page compares.** `SchoolDetail`
 *    branches on `school.tier === 'inmersion'`; marking `visita` produces
 *    `visitazzq`, which is still not `inmersion`, so the page held still and
 *    all five `visitSchools[*].tier` leaves were recorded as inert. They are
 *    not — every visit card's treatment comes from that comparison. A
 *    discriminator is now mutated *across* the boundary the page branches on
 *    ({@link predicateAlternative}, with the boundary read out of the source
 *    rather than listed), and the five moved to {@link UNPRINTABLE_LEAVES}.
 *
 * The second arrived as a wrong *reason* rather than as a missing check, which
 * is the more expensive kind: a reason recorded as fact tells the next reader
 * the question is settled. The immersion pair's reason was wrong on its own
 * terms too — it said `tier` decides which schools the immersion figure is
 * drawn from, and `uniformImmersionDays()` never reads `tier`. Every reason in
 * every list was re-read against the code in r5, not only the ones that moved.
 *
 * ## What r6 added
 *
 * Two more shapes, both reported by the reviewer against the page as it stood
 * after r5 and both reproduced here before anything was changed.
 *
 * 1. **A fragment of a string, restated at one site while another renders the
 *    whole of it.** The page said "Fiesta Nacional de España" in a FAQ answer
 *    and "El orden de las visitas puede variar" in an italic note, both taken
 *    out of module values that also render in full a few hundred pixels away.
 *    The source scan looks for the complete leaf; {@link provesRendered} asks
 *    the complete leaf to lose an occurrence, and it did — at the wired site.
 *    So the question is asked the other way round now: the page is rendered
 *    against a module whose every string has had every token marked, and any
 *    run of the module's own words still on it was typed into the page. See
 *    {@link survivingFragments}. The floor is {@link MIN_SCANNED_LENGTH} and two
 *    whole tokens, both of which are the source scan's own threshold and its own
 *    reason rather than a number tuned until this went green — the legitimate
 *    overlaps it surfaces are classified in {@link EXPECTED_FRAGMENTS} instead.
 *
 * 2. **A cardinality stated in words.** The page says how many weeks the cohort
 *    runs in four places, and the cardinality contract cannot see any of them:
 *    it counts digits, and "Dos semanas" is not a digit. The `weeks` exception
 *    said as much and called the number copy, which made a hardcoded fact look
 *    like a declared one. All four sites now read `COHORT_WEEKS.length` through
 *    an es-CL number word, and {@link weekCountSurface} grows the cohort by a
 *    week and requires the old word to be gone — one site left pinned fails
 *    while the rest stay wired. The design's own two-card structure is a
 *    separate matter and is pinned separately: `DESIGNED_WEEK_COUNT` in the page
 *    is what the two cards can render, and a third week fails
 *    `renders every week the cohort has` rather than silently not appearing.
 *
 * `it('the contract can fail', …)` proves the mechanism rather than asserting it
 * works: a string, a number and a short value are each pinned to their original
 * value while the module changes underneath — exactly what a hardcoded literal
 * does — and the contract is required to name that leaf.
 */
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Overrides applied to the cohort module for the next render, keyed by export
 * name. Hoisted because `vi.mock`'s factory runs before this file's body.
 */
const cohortStore = vi.hoisted(() => ({ overrides: {} as Record<string, unknown> }));

/**
 * The cohort module, re-exported through getters so a render reads whatever is
 * in {@link cohortStore} at that moment. Vitest compiles a named import into a
 * property access on the module namespace, so the page picks up an override
 * without being re-imported — which is what keeps 140-odd renders cheap.
 */
vi.mock('../../lib/pasantias/cohort-public', async () => {
  const actual = (await vi.importActual('../../lib/pasantias/cohort-public')) as Record<
    string,
    unknown
  >;
  const mocked: Record<string, unknown> = {};

  for (const key of Object.keys(actual)) {
    Object.defineProperty(mocked, key, {
      enumerable: true,
      configurable: true,
      get: () => (key in cohortStore.overrides ? cohortStore.overrides[key] : actual[key]),
    });
  }

  return mocked;
});

import {
  COHORT_OBJECTIVES,
  COHORT_PUBLIC,
  COHORT_SCHOOLS,
  COHORT_WEEKS,
} from '../../lib/pasantias/cohort-public';
import PasantiasPage, {
  DESIGNED_WEEK_COUNT,
  buildMetaDescription,
  getServerSideProps,
} from '../../pages/pasantias';

const REPO_ROOT = join(__dirname, '..', '..');
const PAGE_PATH = join(REPO_ROOT, 'pages', 'pasantias.tsx');
const COMPONENTS_DIR = join(REPO_ROOT, 'components', 'pasantias');

/* ------------------------------------------------------------------ the leaves */

type Primitive = string | number | boolean;

interface CohortLeaf {
  /** Readable path into `COHORT_PUBLIC`, e.g. `visitSchools[4].highlights[2]`. */
  path: string;
  /** The same path as segments, for reading and writing the value. */
  segments: (string | number)[];
  value: Primitive;
}

/**
 * Every primitive under `COHORT_PUBLIC`, found by walking it.
 *
 * Containers reached a second time are skipped by object identity: `schools` is
 * `immersionSchools` concatenated with `visitSchools` and holds the very same
 * objects, so its leaves are the ones already collected under those two paths
 * rather than a second set that would have to be excluded by hand.
 */
function collectLeaves(root: unknown): CohortLeaf[] {
  const leaves: CohortLeaf[] = [];
  const seen = new WeakSet<object>();

  const walk = (node: unknown, segments: (string | number)[]) => {
    if (node === null || node === undefined) return;

    if (typeof node === 'object') {
      if (seen.has(node)) return;
      seen.add(node);

      if (Array.isArray(node)) {
        node.forEach((item, index) => walk(item, [...segments, index]));
      } else {
        for (const [key, value] of Object.entries(node)) {
          walk(value, [...segments, key]);
        }
      }
      return;
    }

    if (typeof node === 'function') return;

    leaves.push({ path: formatPath(segments), segments, value: node as Primitive });
  };

  walk(root, []);
  return leaves;
}

function formatPath(segments: (string | number)[]): string {
  return segments
    .map((segment, index) =>
      typeof segment === 'number' ? `[${segment}]` : index === 0 ? segment : `.${segment}`
    )
    .join('');
}

const LEAVES = collectLeaves(COHORT_PUBLIC);

/**
 * Pinned so a structural change to the module is visible rather than silent. A
 * field added or removed moves this number; when it does, re-read
 * {@link EXPECTED_GAPS} — the new field is covered by the contract below unless
 * it is declared there with a reason.
 */
const EXPECTED_LEAF_COUNT = 150;

/** Top-level `COHORT_PUBLIC` key → the export the page actually imports. */
const EXPORT_BY_KEY: Record<string, string> = {
  id: 'COHORT_ID',
  label: 'COHORT_LABEL',
  headline: 'COHORT_HEADLINE',
  dateLabel: 'COHORT_DATE_LABEL',
  weeks: 'COHORT_WEEKS',
  freeDays: 'COHORT_FREE_DAYS',
  visitDays: 'COHORT_VISIT_DAYS',
  visitDayCount: 'COHORT_VISIT_DAY_COUNT',
  immersionSchools: 'COHORT_IMMERSION_SCHOOLS',
  visitSchools: 'COHORT_VISIT_SCHOOLS',
  schools: 'COHORT_SCHOOLS',
  experts: 'COHORT_EXPERTS',
  claims: 'COHORT_CLAIMS',
  objectives: 'COHORT_OBJECTIVES',
  dayStructure: 'COHORT_DAY_STRUCTURE',
  includes: 'COHORT_INCLUDES',
  excludes: 'COHORT_EXCLUDES',
  lodgingArea: 'COHORT_LODGING_AREA',
};

/* ------------------------------------------------------------- the source scan */

/**
 * Below this, a string is as likely to be ordinary Spanish as it is to be a
 * planted cohort fact — "Barcelona", "ESO", "Cenas", "visita". Those are not
 * left uncovered: they are exactly what the render contract below is for. ISO
 * dates are checked at any length because a calendar date typed into a page is
 * never a coincidence.
 */
const MIN_SCANNED_LENGTH = 12;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function isScannable(leaf: CohortLeaf): leaf is CohortLeaf & { value: string } {
  if (typeof leaf.value !== 'string') return false;
  return ISO_DATE.test(leaf.value) || leaf.value.length >= MIN_SCANNED_LENGTH;
}

const SCANNED_LEAVES = LEAVES.filter(isScannable);

/** Every cohort fact this source writes out as a literal. Empty means wired. */
export function findHardcodedCohortFacts(source: string): CohortLeaf[] {
  return SCANNED_LEAVES.filter((leaf) => source.includes(String(leaf.value)));
}

/** The page plus anything under `components/pasantias/`, which renders with it. */
function pageSources(): { path: string; source: string }[] {
  const sources = [{ path: 'pages/pasantias.tsx', source: readFileSync(PAGE_PATH, 'utf8') }];

  let componentFiles: string[] = [];
  try {
    componentFiles = readdirSync(COMPONENTS_DIR).filter((name) => /\.tsx?$/.test(name));
  } catch {
    // The directory does not exist until A6b adds the lead form; nothing to scan.
  }

  for (const name of componentFiles) {
    sources.push({
      path: `components/pasantias/${name}`,
      source: readFileSync(join(COMPONENTS_DIR, name), 'utf8'),
    });
  }

  return sources;
}

/* --------------------------------------------------------- the render contract */

type Overrides = Record<string, unknown>;

/** A token suffix that survives HTML escaping and collides with nothing. */
const MUTATION_MARK = 'zzq';

/** The last named segment of a path — `visitSchools[3].tier` → `tier`. */
function fieldName(segments: (string | number)[]): string {
  const named = segments.filter((segment) => typeof segment === 'string');
  return String(named[named.length - 1] ?? '');
}

/** `visitSchools[3].levels` → `visitSchools..levels`. Siblings share a shape. */
function shapeOf(segments: (string | number)[]): string {
  return segments.map((segment) => (typeof segment === 'number' ? '' : segment)).join('.');
}

/* ------------------------------------------------------------ discriminators */

/**
 * The string literals the page tests a value *against*: `school.tier ===
 * 'inmersion'` yields `inmersion`. Read out of the source rather than listed,
 * so a discriminator a later design introduces is covered without anyone
 * remembering this file exists.
 */
const PREDICATE_LITERALS: ReadonlySet<string> = new Set(
  pageSources().flatMap(({ source }) =>
    [...source.matchAll(/[=!]==\s*(?:'([^']*)'|"([^"]*)")/g)].map((match) => match[1] ?? match[2])
  )
);

/**
 * Every value a field takes anywhere in the module, keyed by field *name* and
 * not by path shape. `tier` is `'inmersion'` throughout `immersionSchools` and
 * `'visita'` throughout `visitSchools`, so each shape holds exactly one value
 * and only their union describes the enum the page branches on.
 */
const VALUES_BY_FIELD = new Map<string, Set<Primitive>>();

for (const leaf of LEAVES) {
  const field = fieldName(leaf.segments);
  VALUES_BY_FIELD.set(field, (VALUES_BY_FIELD.get(field) ?? new Set()).add(leaf.value));
}

/**
 * The values of `field` when it is a discriminator — an enum that straddles a
 * predicate the page branches on, with at least one value the page tests for
 * and at least one it does not. `null` for every other field.
 */
function discriminatorDomain(field: string): string[] | null {
  const values = [...(VALUES_BY_FIELD.get(field) ?? [])].filter(
    (value): value is string => typeof value === 'string'
  );

  const straddles =
    values.some((value) => PREDICATE_LITERALS.has(value)) &&
    values.some((value) => !PREDICATE_LITERALS.has(value));

  return straddles ? values : null;
}

/**
 * The value that puts this leaf on the *other* side of the predicate, or `null`
 * when the leaf is not a discriminator.
 *
 * This is what r5 fixes. A suffix mutation moves an enum leaf to a value that
 * is still on its own side of the boundary — `'visita'` and `'visitazzq'` are
 * both `!== 'inmersion'` — so the page cannot move and the leaf reads as inert
 * when it is not. All five `visitSchools[*].tier` leaves were declared absent
 * on exactly that evidence while `SchoolDetail` was branching on every one.
 */
function predicateAlternative(leaf: CohortLeaf): string | null {
  if (typeof leaf.value !== 'string') return null;

  const domain = discriminatorDomain(fieldName(leaf.segments));
  if (domain === null) return null;

  const tested = PREDICATE_LITERALS.has(leaf.value);
  return domain.find((value) => PREDICATE_LITERALS.has(value) !== tested) ?? null;
}

/**
 * A day of the month no date in the module already uses. Derived rather than
 * picked, because the contract now asserts the mutated value *appears*: shifting
 * 9 October by one lands on 10 October, which the page already prints as the
 * first free day, and the leaf would read as wired on its neighbour's output.
 */
const MUTATION_DAY = (() => {
  const used = new Set(
    LEAVES.filter(
      (leaf): leaf is CohortLeaf & { value: string } =>
        typeof leaf.value === 'string' && ISO_DATE.test(leaf.value)
    ).map((leaf) => Number(leaf.value.slice(8, 10)))
  );

  for (let day = 1; day <= 28; day += 1) if (!used.has(day)) return day;
  throw new Error('the cohort uses every day of the month; dates need another mutation');
})();

/**
 * A different value of the same shape, so the page keeps working and only its
 * output moves. Dates move the day rather than the year — the page prints day
 * and month, so a year change would render identically.
 */
function mutateValue(leaf: CohortLeaf): Primitive {
  const { value } = leaf;
  if (typeof value === 'number') return value + 7.25;
  if (typeof value === 'boolean') return !value;

  // A discriminator is mutated across the boundary the page branches on, not
  // by suffix: see {@link predicateAlternative} for what the suffix hid.
  const crossed = predicateAlternative(leaf);
  if (crossed !== null) return crossed;

  if (ISO_DATE.test(value)) {
    return `${value.slice(0, 8)}${String(MUTATION_DAY).padStart(2, '0')}`;
  }

  // Every token, not just the string as a whole: a page that restates one word
  // of a claim while rendering the rest would otherwise still look wired.
  //
  // r3 applied the swap above to *any* field with two-to-four distinct values,
  // which containment made harmful: `levels` has four, so mutating one school's
  // into another's produced a string already on the page and the leaf could not
  // be told from a literal. r4 narrowed it to a suffix for everything, which
  // over-corrected — a suffix cannot move a value the page compares. The rule is
  // now the predicate rather than the cardinality of the field: `levels` is not
  // compared, so it is marked; `tier` is, so it is crossed.
  return value.replace(/\S+/g, (token) => `${token}${MUTATION_MARK}`);
}

function readPath(root: unknown, segments: (string | number)[]): unknown {
  return segments.reduce<any>((node, segment) => node[segment], root);
}

function writePath(root: unknown, segments: (string | number)[], value: unknown): void {
  const parent = segments.slice(0, -1).reduce<any>((node, segment) => node[segment], root);
  parent[segments[segments.length - 1]] = value;
}

/** The override that changes exactly these leaves and nothing else. */
function overrideFor(leaves: CohortLeaf[]): Overrides {
  const overrides: Overrides = {};

  for (const leaf of leaves) {
    const [key, ...rest] = leaf.segments;
    const exportName = EXPORT_BY_KEY[key as string];

    if (rest.length === 0) {
      overrides[exportName] = mutateValue(leaf);
      continue;
    }

    overrides[exportName] ??= structuredClone(
      (COHORT_PUBLIC as Record<string, unknown>)[key as string]
    );
    writePath(overrides[exportName], rest, mutateValue(leaf));
  }

  return overrides;
}

function pathShape(leaf: CohortLeaf): string {
  return shapeOf(leaf.segments);
}

const LEAVES_BY_SHAPE = new Map<string, CohortLeaf[]>();

for (const leaf of LEAVES) {
  LEAVES_BY_SHAPE.set(pathShape(leaf), [...(LEAVES_BY_SHAPE.get(pathShape(leaf)) ?? []), leaf]);
}

/** Runs `body` with the module swapped underneath it, then puts the real one back. */
async function withCohort<T>(overrides: Overrides, body: () => Promise<T> | T): Promise<T> {
  cohortStore.overrides = overrides;
  try {
    return await body();
  } finally {
    cohortStore.overrides = {};
  }
}

async function renderPage(overrides: Overrides): Promise<string> {
  return withCohort(overrides, async () => {
    const result = (await getServerSideProps({
      req: { headers: { host: 'localhost:3000' } },
    } as never)) as { props: Record<string, unknown> };

    return renderToStaticMarkup(React.createElement(PasantiasPage as never, result.props));
  });
}

/* ------------------------------------------------------- what the page shows */

/**
 * Attributes whose value is content rather than presentation. Read alongside the
 * visible text so a leaf an element *consumes* rather than prints — `weeks[0].id`
 * inside `data-testid`, an expert's name inside `alt`, the headline inside a
 * `<meta content>` — is still provable by containment instead of being written
 * off as unprintable.
 */
const CONTENT_ATTRIBUTES = ['data-testid', 'alt', 'title', 'aria-label', 'content'];

/**
 * What the page shows, as opposed to what it is built from.
 *
 * Markup is dropped because Tailwind class names are full of exactly the digits
 * and short words this contract has to match on — `mt-9` would make a bare `9`
 * look rendered anywhere on the page. Each tag becomes a NUL rather than being
 * deleted, so two adjacent elements' text cannot fuse into a token neither of
 * them contains.
 */
function renderedSurface(html: string): string {
  const attributes = [...html.matchAll(new RegExp(`(?:${CONTENT_ATTRIBUTES.join('|')})="([^"]*)"`, 'g'))];

  return decodeEntities(
    [html.replace(/<[^>]*>/g, '\0'), ...attributes.map((match) => match[1])].join('\0')
  );
}

function decodeEntities(value: string): string {
  return value
    .replace(/&quot;/g, '"')
    .replace(/&#x27;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&');
}

/**
 * How a value looks once the page has printed it. Empty means it has no
 * printable form at all: a boolean is read as a flag, never shown.
 *
 * The es-CL forms are written out here rather than imported from the page. The
 * page's formatters are part of what this contract checks, so borrowing them
 * would let a page that formats nothing still satisfy it.
 */
function renderedForms(value: Primitive): string[] {
  if (typeof value === 'boolean') return [];
  if (typeof value === 'number') return [String(value), String(value).replace('.', ',')];
  if (ISO_DATE.test(value)) return [value, dayMonthEsCl(value)];
  return [value];
}

function dayMonthEsCl(isoDate: string): string {
  const [year, month, day] = isoDate.split('-').map(Number);

  return new Intl.DateTimeFormat('es-CL', { timeZone: 'UTC', day: 'numeric', month: 'long' }).format(
    new Date(Date.UTC(year, month - 1, day))
  );
}

/**
 * Whether `form` is on the page now and was not before.
 *
 * Contiguous first, because it is the strongest reading and the only one that
 * works for a form built from ordinary words: "1 de octubre" has three tokens
 * the page is full of, so a token-wise check would find it in the baseline too
 * and conclude nothing had appeared.
 *
 * Token-wise second, because a composed value never appears contiguously — the
 * design renders each claim as a large figure over a small caption, so
 * "400+ pasantes" reaches the markup as two tokens in two different elements.
 * A page printing half a claim fails this, which a contiguous check on the
 * printed half would not.
 */
function appearsNewly(output: string, baseline: string, form: string): boolean {
  if (output.includes(form)) return !baseline.includes(form);

  const tokens = form.split(/\s+/).filter(Boolean);
  const inAll = (surface: string) => tokens.every((token) => surface.includes(token));

  return inAll(output) && !inAll(baseline);
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Occurrences of `form` that are not the mutation's own handiwork. Appending the
 * marker to "Barcelona" leaves "Barcelonazzq", which still *contains* the
 * original, so a plain count would read the mutation as having changed nothing.
 */
function countUnmutated(surface: string, form: string): number {
  return (surface.match(new RegExp(`${escapeRegExp(form)}(?!${MUTATION_MARK})`, 'g')) ?? []).length;
}

/* ----------------------------------------------------------- the classification */

/** What mutating a leaf proved about the page. See this file's header. */
type Proof = 'rendered' | 'uniform' | 'consumed' | 'absent';

/**
 * The r4 assertion. "The render changed" is satisfied by a leaf that only makes
 * something *vanish*; "the render contains the new value" is not.
 */
function provesRendered(leaf: CohortLeaf, baseline: string, output: string): boolean {
  const appeared = renderedForms(mutateValue(leaf)).some((form) =>
    appearsNewly(output, baseline, form)
  );

  if (!appeared) return false;

  // And this leaf's copy of the old value has to leave the page. A page that
  // renders the module *and* restates the same fact as a stale literal would
  // otherwise satisfy the containment half on the live copy alone.
  return renderedForms(leaf.value)
    .filter((form) => countUnmutated(baseline, form) > 0)
    .every((form) => countUnmutated(output, form) < countUnmutated(baseline, form));
}

async function classifyLeaves(
  leaves: CohortLeaf[],
  render: (overrides: Overrides) => Promise<string> = renderPage
): Promise<Map<string, Proof>> {
  const rawBaseline = await render({});
  const baseline = renderedSurface(rawBaseline);
  const proofs = new Map<string, Proof>();

  for (const leaf of leaves) {
    const rawOutput = await render(overrideFor([leaf]));

    if (rawOutput === rawBaseline) {
      proofs.set(leaf.path, 'absent');
      continue;
    }

    if (provesRendered(leaf, baseline, renderedSurface(rawOutput))) {
      proofs.set(leaf.path, 'rendered');
      continue;
    }

    proofs.set(leaf.path, (await provesUniform(leaf, baseline, render)) ? 'uniform' : 'consumed');
  }

  return proofs;
}

/**
 * Whether the leaf is printed once its siblings move with it.
 *
 * Some fields are read as an *agreement* across siblings rather than one at a
 * time: `uniformImmersionDays()` returns a number only while every immersion
 * school reports the same one. Changing a single school makes them disagree, the
 * "días cada una" clause vanishes, and that collapse is exactly what r4 refuses
 * to accept as proof. Moving the whole group to the same new value keeps the
 * agreement intact, so the number has to be printed — a page with `2,5` typed
 * into it still fails.
 *
 * Weaker than the single-leaf case in one specific way, which is why these are
 * declared in {@link UNIFORM_LEAVES}: siblings holding the *same* value are
 * indistinguishable afterwards, so this proves the field is read from the
 * module, not which of the two schools it was read from.
 */
async function provesUniform(
  leaf: CohortLeaf,
  baseline: string,
  render: (overrides: Overrides) => Promise<string>
): Promise<boolean> {
  const siblings = LEAVES_BY_SHAPE.get(pathShape(leaf)) ?? [];
  if (siblings.length < 2) return false;

  return provesRendered(leaf, baseline, renderedSurface(await render(overrideFor(siblings))));
}

/** 150 leaves is 150 renders; the whole suite reads one run of them. */
let classified: Promise<Map<string, Proof>> | null = null;

function classifyAll(): Promise<Map<string, Proof>> {
  classified ??= classifyLeaves(LEAVES);
  return classified;
}

async function pathsProving(leaves: CohortLeaf[], proof: Proof): Promise<string[]> {
  const proofs = await classifyAll();
  return leaves.filter((leaf) => proofs.get(leaf.path) === proof).map((leaf) => leaf.path);
}

/**
 * The leaves that did not do what their declaration says, each with what it did
 * instead — reported on the received side of the assertion so a failure names
 * the leaf rather than printing a truncated list of the ones that behaved.
 */
async function misclassified(leaves: CohortLeaf[], expected: Proof): Promise<string[]> {
  const proofs = await classifyAll();

  return leaves
    .filter((leaf) => proofs.get(leaf.path) !== expected)
    .map((leaf) => `${leaf.path}: ${proofs.get(leaf.path)}, declared ${expected}`);
}

/** Leaves the page is not shown to print, on their own or with their siblings. */
async function unwiredLeaves(
  leaves: CohortLeaf[],
  render: (overrides: Overrides) => Promise<string> = renderPage
): Promise<string[]> {
  const proofs = await classifyLeaves(leaves, render);

  return leaves
    .filter((leaf) => proofs.get(leaf.path) !== 'rendered' && proofs.get(leaf.path) !== 'uniform')
    .map((leaf) => leaf.path);
}

/* ----------------------------------------------------- the cardinality contract */

/**
 * A collection under `COHORT_PUBLIC`, found the same way the leaves are.
 *
 * The leaf walk skips a container it has already seen by identity, so `schools`
 * contributes no leaves — it holds the very objects `immersionSchools` and
 * `visitSchools` do. It is still a distinct array with a distinct length, and
 * the page prints that length twice, so the array itself is collected here
 * while its elements stay skipped.
 */
interface CohortCollection {
  /** Readable path into `COHORT_PUBLIC`, e.g. `visitSchools[4].highlights`. */
  path: string;
  segments: (string | number)[];
  length: number;
  /** The element the appended one is modelled on. */
  sample: unknown;
}

function collectCollections(root: unknown): CohortCollection[] {
  const collections: CohortCollection[] = [];
  const seen = new WeakSet<object>();

  const walk = (node: unknown, segments: (string | number)[]) => {
    if (node === null || node === undefined || typeof node !== 'object') return;
    if (seen.has(node)) return;
    seen.add(node);

    if (Array.isArray(node)) {
      if (node.length > 0) {
        collections.push({
          path: formatPath(segments),
          segments,
          length: node.length,
          sample: node[node.length - 1],
        });
      }
      node.forEach((item, index) => walk(item, [...segments, index]));
      return;
    }

    for (const [key, value] of Object.entries(node)) walk(value, [...segments, key]);
  };

  walk(root, []);
  return collections;
}

const COLLECTIONS = collectCollections(COHORT_PUBLIC);

/** Pinned for the same reason {@link EXPECTED_LEAF_COUNT} is. */
const EXPECTED_COLLECTION_COUNT = 21;

/**
 * The new element's version of one value: strings marked so it cannot be
 * confused with the element it was cloned from — React keys included — and
 * everything else carried over untouched.
 *
 * Numbers stay put because a collection's members feed more than its size:
 * `uniformImmersionDays()` returns a figure only while every immersion school
 * reports the same `immersionDays`, so an appended school with a different one
 * would delete the "días cada una" clause and the render would move for a
 * reason that has nothing to do with the count. Discriminators stay put for the
 * same reason — an appended immersion school carrying a `visita` tier would
 * flip its own card's treatment. This is what makes the append attributable.
 */
function plausibleValue(field: string, value: Primitive): Primitive {
  if (typeof value !== 'string') return value;
  if (discriminatorDomain(field) !== null) return value;

  return ISO_DATE.test(value)
    ? `${value.slice(0, 8)}${String(MUTATION_DAY).padStart(2, '0')}`
    : `${value}${MUTATION_MARK}`;
}

/** A plausible sibling for `sample`: same shape, distinguishable content. */
function plausibleElement(sample: unknown, field: string): unknown {
  if (sample === null || typeof sample !== 'object') {
    return plausibleValue(field, sample as Primitive);
  }

  const clone = structuredClone(sample) as object;
  for (const leaf of collectLeaves(clone)) {
    writePath(clone, leaf.segments, plausibleValue(fieldName(leaf.segments), leaf.value));
  }

  return clone;
}

/** The override that grows exactly this collection by one and nothing else. */
function overrideForCollection(collection: CohortCollection): Overrides {
  const [key, ...rest] = collection.segments;
  const exportName = EXPORT_BY_KEY[key as string];
  const grow = (current: unknown[]) => [
    ...current,
    plausibleElement(collection.sample, fieldName(collection.segments)),
  ];

  const root = (COHORT_PUBLIC as Record<string, unknown>)[key as string];
  if (rest.length === 0) return { [exportName]: grow(root as unknown[]) };

  const clone = structuredClone(root);
  writePath(clone, rest, grow(readPath(clone, rest) as unknown[]));
  return { [exportName]: clone };
}

/* ------------------------------------------------------------- the quiet module */

/**
 * A value with nothing left in it a bare-number search could mistake for a
 * count. Every token of a string is marked and a date moves to
 * {@link MUTATION_DAY}; numbers and booleans are left exactly as they are.
 *
 * The point is the digits inside the module's own prose. `COHORT_CLAIMS` holds
 * "7 escuelas en esta cohorte" and `COHORT_HEADLINE` holds "Octubre, 5 al 16",
 * so the page prints a bare `7` and a bare `5` and a bare `16` for reasons that
 * have nothing to do with how many schools or visit schools there are. Marking
 * turns them into `7zzq`, which no longer reads as a number in its own right,
 * and leaves the sizes the page *computes* — counts and list ordinals — as the
 * only bare numbers on it.
 */
function quietValue(value: Primitive): Primitive {
  if (typeof value !== 'string') return value;

  return ISO_DATE.test(value)
    ? `${value.slice(0, 8)}${String(MUTATION_DAY).padStart(2, '0')}`
    : value.replace(/\S+/g, (token) => `${token}${MUTATION_MARK}`);
}

function quietTree(node: unknown): unknown {
  if (Array.isArray(node)) return node.map(quietTree);

  if (node !== null && typeof node === 'object') {
    return Object.fromEntries(Object.entries(node).map(([key, value]) => [key, quietTree(value)]));
  }

  return quietValue(node as Primitive);
}

/** Every export the page imports, quieted. Rebuilt per call; never shared. */
function quietModule(): Overrides {
  return Object.fromEntries(
    Object.entries(EXPORT_BY_KEY).map(([key, exportName]) => [
      exportName,
      quietTree((COHORT_PUBLIC as Record<string, unknown>)[key]),
    ])
  );
}

/** The quiet module with exactly this collection one element shorter. */
function quietShrinkOf(collection: CohortCollection): Overrides {
  const overrides = quietModule();
  const [key, ...rest] = collection.segments;
  const exportName = EXPORT_BY_KEY[key as string];

  const current = rest.length === 0 ? overrides[exportName] : readPath(overrides[exportName], rest);
  const shrunk = (current as unknown[]).slice(0, -1);

  if (rest.length === 0) overrides[exportName] = shrunk;
  else writePath(overrides[exportName], rest, shrunk);

  return overrides;
}

/** The quiet module with exactly this collection grown to `length` elements. */
function quietGrowthOf(collection: CohortCollection, length: number): Overrides {
  const overrides = quietModule();
  const [key, ...rest] = collection.segments;
  const exportName = EXPORT_BY_KEY[key as string];

  const current = (
    rest.length === 0 ? overrides[exportName] : readPath(overrides[exportName], rest)
  ) as unknown[];
  const sample = current[current.length - 1];
  const field = fieldName(collection.segments);
  const grown = [...current];
  while (grown.length < length) grown.push(plausibleElement(sample, field));

  if (rest.length === 0) overrides[exportName] = grown;
  else writePath(overrides[exportName], rest, grown);

  return overrides;
}

/* --------------------------------------------------- the fragment rule (r6/B2) */

/**
 * Everything the page publishes, as one string: the markup's text and content
 * attributes, plus the `<meta description>`.
 *
 * The metadata is appended rather than read off the markup because `next/head`
 * contributes nothing to a static render — `renderToStaticMarkup` of this page
 * emits no `<meta>` at all — so a guard that only reads the markup cannot see
 * the sentence the search result shows. `buildMetaDescription` is read under the
 * same override as the render, which is what makes it move with the module.
 *
 * Whitespace is collapsed because JSX keeps the source's line breaks and
 * indentation inside a text node, so a phrase that is contiguous on the page is
 * not contiguous in the markup. Tag boundaries stay NUL: a phrase split across
 * two elements is deliberately *not* matched, which can only make this miss a
 * restatement, never invent one.
 */
async function publishedSurface(overrides: Overrides): Promise<string> {
  return withCohort(overrides, async () => {
    const result = (await getServerSideProps({
      req: { headers: { host: 'localhost:3000' } },
    } as never)) as { props: Record<string, unknown> };

    const html = renderToStaticMarkup(React.createElement(PasantiasPage as never, result.props));

    return `${renderedSurface(html)}\0${buildMetaDescription()}`.replace(/\s+/g, ' ');
  });
}

/**
 * How much of a module string has to survive before it is a restatement rather
 * than ordinary Spanish.
 *
 * Both halves are the source scan's own floor, for the source scan's own reason.
 * {@link MIN_SCANNED_LENGTH} decides when a *whole* value is long enough that
 * finding it in the page cannot be a coincidence; a run of the same value's own
 * words is the same kind of evidence and gets the same threshold rather than a
 * second number tuned until the suite went green. The token floor is the other
 * half of that sentence: one token is a word, and the module and ordinary es-CL
 * copy share plenty of words — "Barcelona", "escuelas", "aprendizaje" — while a
 * run of two or more is a phrase somebody typed.
 */
const MIN_FRAGMENT_TOKENS = 2;

/**
 * Occurrences of `phrase` as whole words.
 *
 * Not {@link countUnmutated}, which is a substring count with the mutation mark
 * excluded: "días de visita" is a substring of the page's own "días de visitas"
 * and that is a different phrase, not a restatement of this one. The boundaries
 * also subsume the mutation mark — "Barcelonazzq" ends in letters — so a marked
 * value cannot match either.
 */
function countPhrase(surface: string, phrase: string): number {
  return (
    surface.match(
      new RegExp(`(?<![\\p{L}\\p{N}])${escapeRegExp(phrase)}(?![\\p{L}\\p{N}])`, 'gu')
    ) ?? []
  ).length;
}

/**
 * The longest runs of this leaf's own words that are still on `surface`.
 *
 * Read against the page rendered on the **quiet module** (see
 * {@link quietValue}), where every string the module publishes has had every one
 * of its tokens marked. A wired page therefore prints none of the module's
 * words; anything of the original left on it was typed into the page.
 *
 * This is the string analogue of {@link printsStaleSize}, and it exists for the
 * same reason. {@link provesRendered} mutates one leaf and asks whether the old
 * value lost an occurrence, so a page that restates *part* of a leaf at one site
 * while another site renders the whole of it passes: the whole leaf did lose an
 * occurrence, at the wired site. Quieting the module removes the wired site from
 * the comparison entirely, so the partial copy has nothing left to hide behind.
 *
 * Only maximal runs are reported: a run that is inside another one is the same
 * restatement said twice.
 */
function survivingFragments(leaf: CohortLeaf, surface: string): string[] {
  if (typeof leaf.value !== 'string') return [];

  const tokens = leaf.value.split(/\s+/).filter(Boolean);
  const longest: string[] = [];

  for (let start = 0; start + MIN_FRAGMENT_TOKENS <= tokens.length; start += 1) {
    let survivor: string | null = null;

    for (let end = start + MIN_FRAGMENT_TOKENS; end <= tokens.length; end += 1) {
      const run = tokens.slice(start, end).join(' ');
      // A longer run contains this one, so once a run is gone so is every
      // extension of it.
      if (countPhrase(surface, run) === 0) break;
      survivor = run;
    }

    if (survivor !== null && survivor.length >= MIN_SCANNED_LENGTH) longest.push(survivor);
  }

  return longest.filter((run) => !longest.some((other) => other !== run && other.includes(run)));
}

interface RestatedFragment {
  /** The leaf the run belongs to. */
  path: string;
  /** The run of that leaf's words still on the page. */
  fragment: string;
}

/** `leafPath: "fragment"` — how a failure names one. */
function formatFragment(found: RestatedFragment): string {
  return `${found.path}: ${JSON.stringify(found.fragment)}`;
}

let quietSurface: Promise<string> | null = null;

function quietPublishedSurface(): Promise<string> {
  quietSurface ??= publishedSurface(quietModule());
  return quietSurface;
}

async function restatedFragments(
  surfaceOf: () => Promise<string> = quietPublishedSurface
): Promise<RestatedFragment[]> {
  const surface = await surfaceOf();

  return LEAVES.flatMap((leaf) =>
    survivingFragments(leaf, surface).map((fragment) => ({ path: leaf.path, fragment }))
  );
}

/* -------------------------------------------------- the week-count rule (r6/B1) */

/**
 * The es-CL number words the page's copy can state a small cardinality with,
 * written out here rather than imported from the page for the same reason
 * {@link renderedForms} is: borrowing the page's own words would let a page that
 * derives nothing still satisfy this.
 */
const COUNT_WORDS_ES = ['cero', 'una', 'dos', 'tres', 'cuatro', 'cinco', 'seis'];

/** Standalone occurrences of `word` — "modos" and "todos" are not "dos". */
function countWordOccurrences(surface: string, word: string): number {
  return (
    surface.match(new RegExp(`(?<!\\p{L})${escapeRegExp(word)}(?!\\p{L})`, 'giu')) ?? []
  ).length;
}

/**
 * The page published with the cohort grown to `weekCount` weeks, on the quiet
 * module.
 *
 * Quiet because the module states a cardinality of its own in its prose —
 * `weeks[1].summary` says "una o dos escuelas por día" — and the count this
 * proves is the page's, not the module's.
 */
function weekCountSurface(weekCount: number): Promise<string> {
  const weeks = COLLECTIONS.find((collection) => collection.path === 'weeks');
  if (!weeks) throw new Error('COHORT_PUBLIC no longer has a weeks collection');

  return publishedSurface(quietGrowthOf(weeks, weekCount));
}

/**
 * What the page *prints*, with attribute values left out — deliberately
 * narrower than {@link renderedSurface}.
 *
 * Index-bearing test hooks move with a collection's length by construction:
 * `pasantias-objective-13` appears the moment a fourteenth objective renders,
 * `pasantias-school-inmersion-2` the moment a third school does. Every one of
 * them carries the collection's *old* size as a number, so an attribute-wise
 * surface would report a page that prints no count at all as publishing one.
 */
function printedSurface(html: string): string {
  return decodeEntities(html.replace(/<[^>]*>/g, '\0'));
}

const printedSurfaceOf = async (overrides: Overrides): Promise<string> =>
  printedSurface(await renderPage(overrides));

/**
 * Occurrences of `count` printed as a number in its own right. The lookarounds
 * keep a `13` out of `2013`, out of `2,5` and out of an ordinal like `013`, so
 * the two halves below measure the count rather than the digits the page is
 * full of.
 */
function countOccurrences(surface: string, count: number): number {
  return (surface.match(new RegExp(`(?<![\\w.,])${count}(?![\\w.,])`, 'g')) ?? []).length;
}

/**
 * Whether the page prints this collection's size.
 *
 * Neither half is "the render changed", and that is the whole point. Appending
 * a school moves a great deal — a card appears, a name appears, the immersion
 * section grows a row, every school test hook after it shifts index — and none
 * of it can satisfy either half. What is required is that the *new* size be
 * printed where it was not before, and that the *old* size lose ground at the
 * same time. A page with `7` typed into it fails the second half while
 * everything else about it moves, which is exactly the case r5 was opened on.
 *
 * What this half cannot see on its own is a page that prints the same count in
 * several places and hardcodes only some of them. `COHORT_SCHOOLS.length` is
 * printed twice — the hero strip and the section title — and typing `7` into
 * one of them satisfies both halves above, because the other site still puts an
 * `8` on the page and still takes a `7` off it. That is the exact literal the
 * reviewer raised, so counting is not where this can end:
 * {@link printsStaleSize} is the other half.
 */
function publishesCount(
  before: string,
  after: string,
  oldLength: number,
  newLength: number
): boolean {
  return (
    countOccurrences(after, newLength) > countOccurrences(before, newLength) &&
    countOccurrences(after, oldLength) < countOccurrences(before, oldLength)
  );
}

/**
 * Whether the page still prints this collection's *present* size after the
 * collection has shrunk past it — one literal is enough to make this true.
 *
 * Read on the quiet module (see {@link quietValue}), where the only bare
 * numbers left are the ones the page computes. Shrink `COHORT_SCHOOLS` to six
 * and a wired page has no `7` anywhere on it; a page with `Las 7 escuelas`
 * typed into the section title has exactly one, however many other sites moved
 * to `6` around it. That is what a per-site check buys and a count comparison
 * cannot.
 *
 * Shrinking rather than growing, because growing cannot be read this way: the
 * objectives list numbers its own items, so a fourteenth objective leaves the
 * thirteenth's ordinal `13` on the page and a wired page would look stale.
 * Shrinking takes the ordinal away with the element.
 *
 * Two limits, both stated rather than papered over. A collection of one cannot
 * be shrunk into a size the page could print, so it is left to the counting
 * half alone; none exists today. And this asks only whether the old size is
 * *gone*, not which site printed it — a page that hardcodes every site of a
 * count is caught by the counting half instead, which is where it shows up.
 */
async function printsStaleSize(
  collection: CohortCollection,
  surfaceOf: (overrides: Overrides) => Promise<string>
): Promise<boolean> {
  if (collection.length < 2) return false;

  const shrunk = await surfaceOf(quietShrinkOf(collection));
  return countOccurrences(shrunk, collection.length) > 0;
}

type CountProof = 'published' | 'unpublished';

async function classifyCollections(
  collections: CohortCollection[],
  surfaceOf: (overrides: Overrides) => Promise<string> = printedSurfaceOf
): Promise<Map<string, CountProof>> {
  const before = await surfaceOf({});
  const proofs = new Map<string, CountProof>();

  for (const collection of collections) {
    const after = await surfaceOf(overrideForCollection(collection));

    // Both halves, and the second one only for a collection that got past the
    // first: shrinking a collection the page destructures by position — `weeks`
    // is read as `[immersionWeek, visitWeek]` — would throw rather than answer,
    // and nothing is learned by asking a collection whose size is never printed
    // whether it prints a stale one.
    const published =
      publishesCount(before, after, collection.length, collection.length + 1) &&
      !(await printsStaleSize(collection, surfaceOf));

    proofs.set(collection.path, published ? 'published' : 'unpublished');
  }

  return proofs;
}

let counted: Promise<Map<string, CountProof>> | null = null;

function classifyAllCounts(): Promise<Map<string, CountProof>> {
  counted ??= classifyCollections(COLLECTIONS);
  return counted;
}

/** As {@link misclassified}, for sizes. */
async function miscounted(
  collections: CohortCollection[],
  expected: CountProof
): Promise<string[]> {
  const proofs = await classifyAllCounts();

  return collections
    .filter((collection) => proofs.get(collection.path) !== expected)
    .map((collection) => `${collection.path}: ${proofs.get(collection.path)}, declared ${expected}`);
}

/**
 * Leaves this page genuinely does not render, each with the reason. Anything
 * not listed here must move the rendered output when it changes.
 */
const EXPECTED_GAPS: { pathPrefix: string; reason: string }[] = [
  {
    pathPrefix: 'id',
    reason:
      'COHORT_ID is the machine identifier for the cohort. The page shows COHORT_LABEL/COHORT_HEADLINE instead and never imports it.',
  },
  {
    pathPrefix: 'dateLabel',
    reason:
      'COHORT_DATE_LABEL is the span without the year. The page renders COHORT_HEADLINE, which is a separate export built from it, so overriding this one moves nothing.',
  },
  {
    pathPrefix: 'visitDays',
    reason:
      'COHORT_VISIT_DAYS is the flat list of every visit date. The page shows the two week ranges and COHORT_VISIT_DAY_COUNT, not the individual dates.',
  },
  {
    pathPrefix: 'weeks[0].visitDays',
    reason:
      'Same dates, per week. The itinerary prints each week as a range from startDate to endDate, both of which are covered.',
  },
  {
    pathPrefix: 'weeks[1].visitDays',
    reason: 'As weeks[0].visitDays.',
  },
  {
    pathPrefix: 'freeDays[1].date',
    reason:
      'The long weekend is printed as a range, first free day to last, so the middle day\'s date never appears. Its label does, and is covered.',
  },
];

/**
 * Leaves the page reads but can never print, so containment cannot prove them
 * and only the weaker "the output moved" check is available. Declared here so
 * the weakness is visible rather than assumed — which is the whole reason r4
 * exists.
 *
 * A leaf belongs here only if there is genuinely nothing to contain. Where an
 * element consumes the value instead — a `data-testid` built from an `id`, an
 * `alt` built from a name — {@link CONTENT_ATTRIBUTES} makes it provable and it
 * stays under the containment rule.
 */
const UNPRINTABLE_LEAVES: { pathPrefix: string; reason: string }[] = [
  {
    pathPrefix: 'immersionSchools[0].tier',
    reason:
      "A discriminator, compared and never shown: `SchoolDetail` reads `school.tier === 'inmersion'` (pages/pasantias.tsx:340) to give a card the dark treatment with its arrow list rather than the light one with the highlights run together. Crossing the predicate moves the output; no form of the new value can appear, because both sides of the enum are ordinary words the page already prints in its own copy. Until r5 this reason said tier decided which schools the immersion figure is drawn from. It does not: `uniformImmersionDays()` (pages/pasantias.tsx:75) maps COHORT_IMMERSION_SCHOOLS straight to `immersionDays` and never reads tier at all.",
  },
  {
    pathPrefix: 'immersionSchools[1].tier',
    reason: 'As immersionSchools[0].tier.',
  },
  {
    pathPrefix: 'visitSchools[0].tier',
    reason:
      "The same discriminator on the far side of the enum, driving the same choice: a visit school fails `=== 'inmersion'` and gets the light card. Declared an EXPECTED_GAP from r4 until r5 on the strength of a mutation that could not have moved it — appending a marker leaves `visita` and `visitazzq` both `!== 'inmersion'`, so the page held still and was recorded as never asking. It asks for all five.",
  },
  { pathPrefix: 'visitSchools[1].tier', reason: 'As visitSchools[0].tier.' },
  { pathPrefix: 'visitSchools[2].tier', reason: 'As visitSchools[0].tier.' },
  { pathPrefix: 'visitSchools[3].tier', reason: 'As visitSchools[0].tier.' },
  { pathPrefix: 'visitSchools[4].tier', reason: 'As visitSchools[0].tier.' },
  {
    pathPrefix: 'visitSchools[0].fullDay',
    reason:
      'A boolean read as a flag to pick which of two labels a visit day carries. A boolean has no printable form at all — the label it selects is the page\'s own copy, not a cohort fact.',
  },
  {
    pathPrefix: 'visitSchools[4].fullDay',
    reason: 'As visitSchools[0].fullDay.',
  },
];

/**
 * Leaves read as an *agreement* across their siblings, so a single-leaf mutation
 * can only make the page fall silent. Proved with the whole sibling group moved
 * together instead — see {@link provesUniform} for what that does and does not
 * establish. Declared here so the difference is on the record.
 */
const UNIFORM_LEAVES: { pathPrefix: string; reason: string }[] = [
  {
    pathPrefix: 'immersionSchools[0].immersionDays',
    reason:
      'Read through `uniformImmersionDays()`, which returns a number only while both immersion schools agree. This is the leaf the PM used to prove r3\'s contract false-passing: changing one school alone deletes the "días cada una" clause instead of re-rendering it.',
  },
  {
    pathPrefix: 'immersionSchools[1].immersionDays',
    reason: 'As immersionSchools[0].immersionDays — the other half of the same agreement.',
  },
];

/**
 * Collections whose size the page genuinely never prints, each with the reason.
 * Anything not listed here must print its new size when it grows.
 *
 * Declared by path *shape* rather than by prefix, because a prefix cannot
 * separate a collection from the collections inside it: `immersionSchools` is
 * counted and `immersionSchools[0].highlights` is not, and one is a prefix of
 * the other. A shape covers a whole sibling group in one honest sentence.
 */
const UNCOUNTED_COLLECTIONS: { shape: string; reason: string }[] = [
  {
    shape: 'weeks',
    reason:
      'The itinerary prints one named week card per week, each as a date range, and states how many there are in four places — the meta description, the section heading, the long-weekend FAQ and the CTA paragraph. Every one of them says it in words ("Dos semanas, dos modos"), and this mechanism counts digits, so it can only ever read the size as unpublished. The word is proved instead by `states how many weeks the cohort runs by reading the module, at every site` and the design\'s own cardinality is pinned by `renders every week the cohort has, or fails rather than dropping one` — so a third week fails the suite instead of rendering nothing. This exception is the limit of the digit mechanism, not permission to type the number in.',
  },
  {
    shape: 'weeks..visitDays',
    reason:
      'The days inside one week, which the itinerary never counts: the card prints startDate to endDate. The cohort-wide figure the page does show is COHORT_VISIT_DAY_COUNT, a number the module computes once and exports as a leaf of its own.',
  },
  {
    shape: 'visitDays',
    reason:
      'The flat list of every visit day. Its size reaches the page only through COHORT_VISIT_DAY_COUNT, which is computed at module load from the real array, so overriding this one moves nothing at all — the same reason its leaves are an EXPECTED_GAP.',
  },
  {
    shape: 'immersionSchools..highlights',
    reason:
      'The aspectos destacados of one school, rendered as an arrow list. The page prints every one of them and counts none — a fifth highlight appears, no figure moves.',
  },
  {
    shape: 'visitSchools..highlights',
    reason: 'As immersionSchools..highlights, run together on one line instead of listed.',
  },
  {
    shape: 'experts',
    reason:
      'The team section renders a card per expert and heads the section with copy, not with a figure. An eighth or a ninth expert changes the grid and no number on the page.',
  },
  {
    shape: 'claims',
    reason:
      'The figures band prints the claims themselves — each one is already a figure with its own caption — so the number of claims is never itself printed.',
  },
  {
    shape: 'dayStructure',
    reason:
      'The día tipo prints each block as a labelled row. Three blocks or four, the section head does not say how many.',
  },
  {
    shape: 'includes',
    reason:
      'The programme list prints its items; nothing counts them. The count would be worth printing to nobody — what is included is the fact, not how many things it is.',
  },
  {
    shape: 'excludes',
    reason: 'As includes, on the other side of the same section.',
  },
];

/**
 * Runs of the module's words that survive the quiet render for a reason that is
 * not a restatement — declared by the run itself, because the run is what the
 * page and the module share and several leaves can contribute the same one.
 *
 * A declaration here is a classification, not a waiver. Every one of these is
 * ordinary Spanish — function words around a common noun, the foundation's own
 * name, the name of the movement — and each reason names the page text it comes
 * from, checked against the source. None of them is a cohort fact: no date, no
 * school, no level, no highlight, no expert, no claim, no objective.
 *
 * The thing not to do here is raise {@link MIN_FRAGMENT_TOKENS} or
 * {@link MIN_SCANNED_LENGTH} until the list empties. That is how the
 * hand-maintained phrase list this guard replaced got its holes: the floor stops
 * being a stated reason and becomes whatever number made the suite green.
 */
const EXPECTED_FRAGMENTS: { fragment: string; reason: string }[] = [
  {
    fragment: 'de la escuela',
    reason:
      'The eyebrow of the "Dentro de la escuela" section (pages/pasantias.tsx:834) — the page\'s own name for what a visit day is like. The module\'s uses are inside an objective and one school\'s highlight, both of which render in full.',
  },
  {
    fragment: 'del programa',
    reason:
      'Two FAQ answers: "Las sesiones del programa se desarrollan en español" (pages/pasantias.tsx:469) and "va aparte del programa" (pages/pasantias.tsx:479). The module\'s use is a job title, "Directora del programa INSPIRA".',
  },
  {
    fragment: 'de Barcelona',
    reason:
      'The visit-day label "Día completo — fuera de Barcelona" (pages/pasantias.tsx:917), which says where a school is rather than naming one. The module\'s use is inside the claim "12 escuelas de Barcelona en la red", which the figures band renders whole.',
  },
  {
    fragment: 'escuelas de vanguardia en',
    reason:
      'The meta description, "semanas viviendo escuelas de vanguardia en Barcelona" (buildMetaDescription, pages/pasantias.tsx:152). "Escuelas de vanguardia" is the movement\'s name and the page\'s positioning sentence, not a fact about this cohort.',
  },
  {
    fragment: 'escuelas de vanguardia',
    reason: 'The same meta description sentence, one token shorter, from another objective.',
  },
  {
    fragment: 'estudiantes y',
    reason:
      '"entrevistar a estudiantes y docentes" in the hero-adjacent programme paragraph (pages/pasantias.tsx:740) — two words of the page\'s own description of a visit day.',
  },
  {
    fragment: 'las escuelas',
    reason:
      'Two page sentences: "En las escuelas vas a escuchar una mezcla de catalán y español" (pages/pasantias.tsx:470) and "las escuelas y las condiciones de participación" in the #programa CTA (pages/pasantias.tsx:1105). Neither names a school; the seven names come from the module and are covered leaf by leaf.',
  },
  {
    fragment: 'en la autonomía y',
    reason:
      "The site-wide Footer mission sentence, \"una Nueva Educación basada en la autonomía y la colaboración\" (components/Footer.tsx:39). The Footer renders inside this page and is not part of A6r's scope at all.",
  },
  {
    fragment: 'procesos de cambio',
    reason:
      'The FAQ answer describing who the pasantía is for: "que están conduciendo procesos de cambio en sus colegios" (pages/pasantias.tsx:457).',
  },
  {
    fragment: 'Nueva Educación',
    reason:
      "The foundation's own name — the page title (pages/pasantias.tsx:139), og:site_name (:530), the logo's alt text (:557) and the Footer. It reaches the module only because two objectives name the movement the foundation is named after.",
  },
  {
    fragment: 'y el equipo de',
    reason:
      'The FAQ answer "y el equipo de FNE acompaña las visitas" (pages/pasantias.tsx:471). Four function words and the module\'s use is inside the honorarios inclusion, which the programme list renders whole.',
  },
];

function matchesPrefix(path: string, pathPrefix: string): boolean {
  return path === pathPrefix || path.startsWith(`${pathPrefix}.`) || path.startsWith(`${pathPrefix}[`);
}

function declaredIn(
  declarations: { pathPrefix: string; reason: string }[],
  path: string
): boolean {
  return declarations.some(({ pathPrefix }) => matchesPrefix(path, pathPrefix));
}

function isExpectedGap(path: string): boolean {
  return declaredIn(EXPECTED_GAPS, path);
}

function isUnprintable(path: string): boolean {
  return declaredIn(UNPRINTABLE_LEAVES, path);
}

function isUniform(path: string): boolean {
  return declaredIn(UNIFORM_LEAVES, path);
}

const DECLARED = [...EXPECTED_GAPS, ...UNPRINTABLE_LEAVES, ...UNIFORM_LEAVES];

const CONTRACT_LEAVES = LEAVES.filter(
  (leaf) => !isExpectedGap(leaf.path) && !isUnprintable(leaf.path) && !isUniform(leaf.path)
);
const GAP_LEAVES = LEAVES.filter((leaf) => isExpectedGap(leaf.path));
const UNPRINTED_LEAVES = LEAVES.filter((leaf) => isUnprintable(leaf.path));
const UNIFORM_GROUP_LEAVES = LEAVES.filter((leaf) => isUniform(leaf.path));

function isUncounted(collection: CohortCollection): boolean {
  return UNCOUNTED_COLLECTIONS.some(({ shape }) => shape === shapeOf(collection.segments));
}

const COUNTED_COLLECTIONS = COLLECTIONS.filter((collection) => !isUncounted(collection));
const UNCOUNTED_GROUP = COLLECTIONS.filter(isUncounted);

/* ------------------------------------------------------------------- the suite */

describe('A6r [A1] — /pasantias renders cohort data, it does not restate it', () => {
  describe('the derived case set', () => {
    it('covers every primitive under COHORT_PUBLIC', () => {
      expect(LEAVES).toHaveLength(EXPECTED_LEAF_COUNT);
      expect(LEAVES.every((leaf) => typeof leaf.value !== 'object')).toBe(true);
    });

    it('maps every top-level field to the export the page imports', () => {
      // A field added to the aggregate with no export beside it would otherwise
      // be collected and then silently skipped when the contract tried to
      // override it.
      expect(Object.keys(EXPORT_BY_KEY).sort()).toEqual(Object.keys(COHORT_PUBLIC).sort());
    });

    it('reaches the deep leaves, not just the top level', () => {
      const paths = LEAVES.map((leaf) => leaf.path);

      expect(paths).toContain('visitSchools[4].highlights[4]');
      expect(paths).toContain('experts[7].role');
      expect(paths).toContain('weeks[0].startDate');
      expect(paths).toContain('visitDayCount');
    });

    it('treats schools as the alias it is, rather than a second copy', () => {
      // COHORT_SCHOOLS holds the same objects as the two tier arrays, so its
      // leaves belong to those paths. The aggregate is still exercised: the page
      // renders its length.
      expect(COHORT_SCHOOLS[0]).toBe(COHORT_PUBLIC.immersionSchools[0]);
      expect(LEAVES.filter((leaf) => leaf.path.startsWith('schools['))).toEqual([]);
    });
  });

  describe('the source scan', () => {
    it('writes no cohort fact as a literal in its own source', () => {
      const offenders = pageSources().flatMap(({ path, source }) =>
        findHardcodedCohortFacts(source).map(
          (leaf) => `${path} hardcodes ${leaf.path}: ${JSON.stringify(leaf.value)}`
        )
      );

      expect(offenders).toEqual([]);
    });

    it('imports the public cohort module and never the commercial one', () => {
      const { source } = pageSources()[0];

      expect(source).toContain("from '../lib/pasantias/cohort-public'");
      // Matched as an import rather than as a substring: the page's own header
      // comment names the commercial module to say it must never be imported, and
      // a substring check would read that prohibition as the violation.
      expect(source).not.toMatch(/\bfrom\s+['"][^'"]*cohort-commercial/);
      expect(source).not.toMatch(/\brequire\(\s*['"][^'"]*cohort-commercial/);
    });

    it('names a planted school, so the check is not vacuous', () => {
      const school = COHORT_SCHOOLS[0];
      const planted = `<h4 className="font-bold">${school.name}</h4>`;

      expect(findHardcodedCohortFacts(planted).map((leaf) => leaf.value)).toContain(school.name);
    });

    it('names a planted objective, so long copy is covered too', () => {
      const objective = COHORT_OBJECTIVES[COHORT_OBJECTIVES.length - 1];
      const planted = `<p>${objective}</p>`;

      expect(findHardcodedCohortFacts(planted).map((leaf) => leaf.value)).toContain(objective);
    });

    it('states what it cannot see, rather than implying it sees everything', () => {
      const unscanned = LEAVES.filter((leaf) => !isScannable(leaf));

      // Numbers, booleans and short words. Listed as a count rather than pinned
      // one by one: the point is that the render contract covers them, which
      // `the render contract` below asserts leaf by leaf.
      expect(unscanned.length).toBeGreaterThan(0);
      expect(
        unscanned.every(
          (leaf) => CONTRACT_LEAVES.includes(leaf) || declaredIn(DECLARED, leaf.path)
        )
      ).toBe(true);
    });
  });

  describe('the render contract', () => {
    it('prints every leaf it does not declare an exception for', async () => {
      // Containment, not "the output moved": the mutated value has to be on the
      // page. See the header — "moved" passes on a leaf whose only effect is to
      // make a clause vanish. Reported split, so a failure says whether the leaf
      // is unprintable (declare it) or not read at all (wire it).
      expect(await pathsProving(CONTRACT_LEAVES, 'consumed')).toEqual([]);
      expect(await pathsProving(CONTRACT_LEAVES, 'absent')).toEqual([]);
    }, 60_000);

    it('keeps its declared gaps honest', async () => {
      // Every gap must still be a gap. One that starts moving the output has to
      // be deleted from EXPECTED_GAPS, not left as a stale excuse.
      expect(await misclassified(GAP_LEAVES, 'absent')).toEqual([]);
    }, 60_000);

    it('keeps its unprintable declarations honest, in both directions', async () => {
      // Each must still move the output — otherwise it is a gap, not a leaf read
      // as a flag — and must still fail containment even with its siblings moved
      // alongside it. One that starts printing is provable the strong way, so its
      // excuse has to be deleted.
      expect(await misclassified(UNPRINTED_LEAVES, 'consumed')).toEqual([]);
    }, 60_000);

    it('keeps its uniform declarations honest, in both directions', async () => {
      // Each must still need its siblings, and must still print once it has them.
      // One that starts printing on its own is `rendered` and the weaker proof
      // has to be given up; one that stops printing even with them is the page
      // restating the fact, which is what this whole file is for.
      expect(await misclassified(UNIFORM_GROUP_LEAVES, 'uniform')).toEqual([]);
    }, 60_000);

    it('declares no exception that matches nothing', () => {
      // An excuse left behind after the field it covered was renamed or deleted
      // reads as coverage that was thought about. It was not.
      const orphans = DECLARED.filter(
        ({ pathPrefix }) => !LEAVES.some((leaf) => matchesPrefix(leaf.path, pathPrefix))
      );

      expect(orphans).toEqual([]);
    });

    it('collects every collection under COHORT_PUBLIC, the schools alias included', () => {
      const paths = COLLECTIONS.map((collection) => collection.path);

      expect(COLLECTIONS).toHaveLength(EXPECTED_COLLECTION_COUNT);
      // The alias contributes no *leaves* — its elements are the two tier
      // arrays' — but its length is its own and the page prints it twice.
      expect(paths).toContain('schools');
      expect(paths).toContain('visitSchools[4].highlights');
      expect(paths).toContain('weeks[1].visitDays');
      // And not a second copy of the aliased elements' collections.
      expect(paths.filter((path) => path.startsWith('schools['))).toEqual([]);
    });

    it('counts no collection the per-site proof cannot read', () => {
      // S1. `printsStaleSize` returns false below two elements — a collection of
      // one cannot be shrunk into a size the page could print — and the count
      // then rests on the aggregate half alone, which is exactly the half that
      // misses a literal at one of several sites. No collection has that shape
      // today; this fails the day one does, rather than the guard quietly
      // weakening underneath it.
      expect(
        COUNTED_COLLECTIONS.filter((collection) => collection.length < 2).map(
          (collection) => collection.path
        )
      ).toEqual([]);
    });

    it('prints the size of every collection it does not declare an exception for', async () => {
      // Grow the collection by a plausible sibling and the page has to print
      // the number it becomes. See `publishesCount` for why neither half of
      // that is "the render changed": appending a school moves plenty, and a
      // page with `7` typed into it still fails.
      expect(await miscounted(COUNTED_COLLECTIONS, 'published')).toEqual([]);
    }, 60_000);

    it('keeps its uncounted declarations honest, in both directions', async () => {
      // One that starts publishing a size has to lose its excuse, exactly as a
      // gap that starts moving the output does.
      expect(await miscounted(UNCOUNTED_GROUP, 'unpublished')).toEqual([]);
    }, 60_000);

    it('declares no uncounted exception that matches nothing', () => {
      const orphans = UNCOUNTED_COLLECTIONS.filter(
        ({ shape }) => !COLLECTIONS.some((collection) => shapeOf(collection.segments) === shape)
      );

      expect(orphans).toEqual([]);
    });

    it('declares each exception once, in one list only', () => {
      // The three lists mean three different things about a leaf. A path in two
      // of them means one of the two is a leftover, and the honesty checks above
      // would then contradict each other rather than fail cleanly.
      const duplicated = DECLARED.map(({ pathPrefix }) => pathPrefix).filter(
        (pathPrefix, index, all) => all.indexOf(pathPrefix) !== index
      );

      expect(duplicated).toEqual([]);
    });
  });

  /**
   * Sol's B2. The two mechanisms above both read a whole leaf: the source scan
   * looks for the complete value, and the render proof asks the complete value
   * to lose an occurrence. A page that restates *part* of a module string at one
   * site while another site renders the whole of it satisfies both, because the
   * whole did lose an occurrence — at the wired site. This asks the question the
   * other way round: with every string in the module marked, nothing of the
   * module's own wording should be left on the page.
   */
  describe('the fragment rule', () => {
    it("restates no run of the module's own words", async () => {
      const declared = new Set(EXPECTED_FRAGMENTS.map(({ fragment }) => fragment));

      expect(
        (await restatedFragments())
          .filter((found) => !declared.has(found.fragment))
          .map(formatFragment)
      ).toEqual([]);
    }, 30_000);

    it('declares no fragment that no longer survives', async () => {
      // A declaration outlives the copy it explained exactly as an EXPECTED_GAP
      // outlives a field, and reads as coverage that was thought about.
      const surviving = new Set((await restatedFragments()).map((found) => found.fragment));
      const orphans = EXPECTED_FRAGMENTS.map(({ fragment }) => fragment).filter(
        (fragment) => !surviving.has(fragment)
      );

      expect(orphans).toEqual([]);
    }, 30_000);
  });

  /**
   * Sol's B1. How many weeks the cohort runs is a cohort fact, and the page
   * states it in words rather than digits, which is why the cardinality contract
   * above cannot see it. Two things are required and they are different: the
   * number the page prints has to come from the module, and the design — two
   * cards with two treatments, built by destructuring `COHORT_WEEKS` by position
   * — has to be a checked invariant rather than a sentence in a comment.
   */
  describe('the two-week design', () => {
    it('renders every week the cohort has, or fails rather than dropping one', async () => {
      expect(COHORT_WEEKS).toHaveLength(DESIGNED_WEEK_COUNT);

      // And this is why the assertion above is not decoration. The itinerary
      // reads `const [immersionWeek, visitWeek] = COHORT_WEEKS`, so a third week
      // produces no third card and no error either — the page would simply stop
      // showing part of the programme. The line above is what turns that silent
      // drop into a red suite.
      const grown = await renderPage(
        overrideForCollection(
          COLLECTIONS.find((collection) => collection.path === 'weeks') as CohortCollection
        )
      );

      expect(grown.match(/data-testid="pasantias-week-/g) ?? []).toHaveLength(DESIGNED_WEEK_COUNT);
    }, 30_000);

    it('states how many weeks the cohort runs by reading the module, at every site', async () => {
      const stale = COUNT_WORDS_ES[DESIGNED_WEEK_COUNT];
      const grown = COUNT_WORDS_ES[DESIGNED_WEEK_COUNT + 1];

      // Not vacuous: the page does state the count, in words, more than once.
      expect(
        countWordOccurrences(await weekCountSurface(DESIGNED_WEEK_COUNT), stale)
      ).toBeGreaterThan(0);

      // And with a week added, every one of those sites has to have moved. One
      // site left pinned to the old word fails here while the others stay wired,
      // which is the negative control the aggregate half of the cardinality
      // contract cannot give: `dos` is not a digit and nothing counts it.
      const surface = await weekCountSurface(DESIGNED_WEEK_COUNT + 1);

      expect([stale, countWordOccurrences(surface, stale)]).toEqual([stale, 0]);
      // The other direction: the sites did not merely stop saying "dos", they
      // say the number the module now has.
      expect([grown, countWordOccurrences(surface, grown) > 0]).toEqual([grown, true]);
    }, 30_000);
  });

  /**
   * The contract above only means something if it can fail. Each of these pins
   * one leaf to its original value while the module changes underneath, which is
   * precisely what a literal in the page does, and requires the contract to name
   * that leaf.
   */
  describe('the contract can fail', () => {
    /** A render that ignores the module for `leaf` — i.e. hardcodes it. */
    const renderWithHardcoded = (leaf: CohortLeaf) => async (overrides: Overrides) => {
      const pinned = structuredClone(overrides);

      // A uniform leaf is proved with its siblings moved alongside it, so a
      // literal has to be simulated across the whole group: pinning one school's
      // immersionDays and letting the other move would make them disagree, which
      // is the module changing, not the page ignoring it.
      const literal = isUniform(leaf.path) ? (LEAVES_BY_SHAPE.get(pathShape(leaf)) ?? [leaf]) : [leaf];

      for (const pin of literal) {
        const [key, ...rest] = pin.segments;
        const exportName = EXPORT_BY_KEY[key as string];

        if (!(exportName in pinned)) continue;
        if (rest.length === 0) pinned[exportName] = pin.value;
        else writePath(pinned[exportName], rest, pin.value);
      }

      return renderPage(pinned);
    };

    const leafAt = (path: string): CohortLeaf => {
      const leaf = LEAVES.find((candidate) => candidate.path === path);
      if (!leaf) throw new Error(`No such leaf: ${path}`);
      return leaf;
    };

    const proofFor = async (path: string) => unwiredLeaves([leafAt(path)], renderWithHardcoded(leafAt(path)));

    /** How one leaf classifies under `render` — 'consumed' against 'absent'. */
    const classificationOf = async (path: string, render: (o: Overrides) => Promise<string>) =>
      (await classifyLeaves([leafAt(path)], render)).get(path);

    const collectionAt = (path: string): CohortCollection => {
      const collection = COLLECTIONS.find((candidate) => candidate.path === path);
      if (!collection) throw new Error(`No such collection: ${path}`);
      return collection;
    };

    /**
     * A surface that prints this collection's *old* size wherever the page
     * prints its size — the page with a literal typed into it.
     *
     * Simulated on the printed text rather than in the module, because a size
     * is derived from the collection itself: there is no value to pin the way
     * {@link renderWithHardcoded} pins a leaf. Every standalone occurrence of
     * the new size is put back, which is a *stronger* hardcode than a real one
     * — a page that typed the literal into one of three sites would still
     * update the other two — so it can only make this control harder to pass,
     * never easier.
     */
    const withStaleCount =
      (collection: CohortCollection) =>
      async (overrides: Overrides): Promise<string> =>
        (await printedSurfaceOf(overrides)).replace(
          new RegExp(`(?<![\\w.,])${collection.length + 1}(?![\\w.,])`, 'g'),
          String(collection.length)
        );

    /**
     * A surface with the *first* site that prints this collection's size typed
     * in as a literal, and every other site left wired — the partial hardcode
     * {@link publishesCount} cannot see.
     *
     * The baseline is returned untouched, which is the whole nature of the
     * thing being simulated: a literal is invisible while the module still
     * agrees with it. It only shows itself once the collection moves and the
     * literal does not, which is both other renders.
     */
    const withOneStaleSite =
      (collection: CohortCollection) =>
      async (overrides: Overrides): Promise<string> => {
        const surface = await printedSurfaceOf(overrides);
        if (Object.keys(overrides).length === 0) return surface;

        return surface.replace(
          new RegExp(
            `(?<![\\w.,])(?:${collection.length + 1}|${collection.length - 1})(?![\\w.,])`
          ),
          String(collection.length)
        );
      };

    const countProofFor = async (
      path: string,
      surfaceOf?: (overrides: Overrides) => Promise<string>
    ) => (await classifyCollections([collectionAt(path)], surfaceOf)).get(path);

    it('catches a hardcoded string — a school name', async () => {
      expect(await proofFor('immersionSchools[0].name')).toEqual(['immersionSchools[0].name']);
    }, 30_000);

    it('catches a hardcoded number — the visit-day count the old scan could not see', async () => {
      expect(await proofFor('visitDayCount')).toEqual(['visitDayCount']);
    }, 30_000);

    it('catches a hardcoded short value — nine characters, under the scan floor', async () => {
      // `lodgingArea` is "Barcelona": too short for the source scan, and the page
      // composes it into an eyebrow with another field, which a substring check
      // could not see either.
      expect(await proofFor('lodgingArea')).toEqual(['lodgingArea']);
    }, 30_000);

    /*
     * The three below are the r4 cases: leaves the page reads through something
     * other than a direct print. Every one of them passed r3's contract while
     * hardcoded, because each makes the render *change* when it is mutated.
     */

    it('catches a hardcoded aggregate — the immersion days both schools must agree on', async () => {
      // The PM's case. Mutating one school makes the two disagree, so the whole
      // "días cada una" clause disappears: the render changes, and r3 read that
      // as the leaf being wired while the page showed a literal `2,5`.
      expect(await proofFor('immersionSchools[0].immersionDays')).toEqual([
        'immersionSchools[0].immersionDays',
      ]);
    }, 30_000);

    it('catches a hardcoded date read through a length expression', async () => {
      // The last free day is printed as `freeDayDates[freeDayDates.length - 1]`,
      // twice — once in the long-weekend range and once in the Fiesta Nacional
      // sentence. Nothing about that read prints the date unless the page asks
      // it to.
      expect(await proofFor('freeDays[2].date')).toEqual(['freeDays[2].date']);
    }, 30_000);

    it('catches a hardcoded claim, which the page takes apart before printing', async () => {
      // `splitClaim` cuts "400+ pasantes" at the first space and renders the two
      // halves in different elements, so the value never reaches the markup whole.
      expect(await proofFor('claims[0]')).toEqual(['claims[0]']);
    }, 30_000);

    /*
     * The two below are the r5 cases. Neither is a leaf: one is a collection's
     * size, which no leaf mutation can reach, and the other is a value the page
     * compares rather than prints, which no suffix mutation can move.
     */

    it('catches a hardcoded count — the seven schools the hero and the section title both print', async () => {
      // Sol's B1. `{COHORT_SCHOOLS.length}` replaced by `7` passed all 21
      // assertions this file had before r5, because adding or dropping a school
      // changes no leaf of the module — only the shape of the array.
      expect(await countProofFor('schools')).toBe('published');
      expect(await countProofFor('schools', withStaleCount(collectionAt('schools')))).toBe(
        'unpublished'
      );
    }, 30_000);

    it('catches a count hardcoded at one of the two sites that print it', async () => {
      // The literal Sol actually reported: `Las 7 escuelas` in the section
      // title, with the hero strip beside it still reading the module. The
      // counting half passes it — a `8` appears, a `7` leaves — and it was
      // still green on this branch when the round that closed B1 was verified.
      // `printsStaleSize` is what fails it.
      expect(await countProofFor('schools', withOneStaleSite(collectionAt('schools')))).toBe(
        'unpublished'
      );
      expect(
        await countProofFor('objectives', withOneStaleSite(collectionAt('objectives')))
      ).toBe('unpublished');
    }, 30_000);

    it('catches a hardcoded count the page also prints as an ordinal', async () => {
      // The objectives list numbers its own items, so a fourteenth objective
      // puts a `14` on the page whether or not the section title asks how many
      // there are. It is the second half of `publishesCount` — the old size
      // losing ground — that decides this one, which is why both are required.
      expect(await countProofFor('objectives')).toBe('published');
      expect(await countProofFor('objectives', withStaleCount(collectionAt('objectives')))).toBe(
        'unpublished'
      );
    }, 30_000);

    /*
     * The two below are the r6 cases. One is part of a string the page also
     * renders whole somewhere else; the other is a count the page states as a
     * word, which no mechanism that counts digits can reach.
     */

    it('catches a partial restatement while another site renders the leaf in full', async () => {
      // Sol's B2 shape. The planted run is taken off the leaf rather than typed
      // here, so this control cannot drift from the value it is a fragment of,
      // and it is a *proper* fragment — the whole leaf is what the source scan
      // and the render proof already cover.
      const leaf = leafAt('weeks[1].summary');
      const planted = String(leaf.value).split(/\s+/).slice(1).join(' ');

      expect(planted).not.toEqual(leaf.value);
      expect(
        (await restatedFragments(async () => `${await quietPublishedSurface()} ${planted}`)).map(
          formatFragment
        )
      ).toContain(formatFragment({ path: leaf.path, fragment: planted }));
    }, 30_000);

    it('catches a week count typed in beside the sites that read the module', async () => {
      // Sol's B1 shape, simulated the way `withOneStaleSite` simulates a count:
      // one site's word is put back to what it was while the rest follow the
      // module. A page that hardcoded every site would fail the same assertion
      // harder, so this is the weaker of the two cases and the one that matters.
      const stale = COUNT_WORDS_ES[DESIGNED_WEEK_COUNT];
      const grown = COUNT_WORDS_ES[DESIGNED_WEEK_COUNT + 1];

      const oneSitePinned = (await weekCountSurface(DESIGNED_WEEK_COUNT + 1)).replace(
        new RegExp(`(?<!\\p{L})${grown}(?!\\p{L})`, 'iu'),
        stale
      );

      expect(countWordOccurrences(oneSitePinned, stale)).toBeGreaterThan(0);
    }, 30_000);

    it('catches hardcoded tier handling — the dark or light card treatment', async () => {
      // A discriminator cannot be caught the way the six cases above are:
      // `proofFor` would name it whether the page read it or not, because it is
      // never printed. What separates a page that asks from one that does not
      // is the weaker proof — wired, crossing the predicate flips the card's
      // treatment and the output moves; with the choice typed in, the page
      // cannot move at all. Both sides of the enum, because the visit side is
      // what r4 recorded as inert on the strength of a mutation that never
      // crossed the boundary.
      for (const path of ['immersionSchools[0].tier', 'visitSchools[0].tier']) {
        expect([path, await classificationOf(path, renderPage)]).toEqual([path, 'consumed']);
        expect([
          path,
          await classificationOf(path, renderWithHardcoded(leafAt(path))),
        ]).toEqual([path, 'absent']);
      }
    }, 30_000);
  });
});
