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
 * Both lists are asserted in *both* directions: a declared leaf that starts
 * rendering fails here and its excuse must be deleted, and a leaf in neither
 * list must render. A new module field that nobody wires fails too, because it
 * belongs to neither list.
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

import { COHORT_OBJECTIVES, COHORT_PUBLIC, COHORT_SCHOOLS } from '../../lib/pasantias/cohort-public';
import PasantiasPage, { getServerSideProps } from '../../pages/pasantias';

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
  if (ISO_DATE.test(value)) {
    return `${value.slice(0, 8)}${String(MUTATION_DAY).padStart(2, '0')}`;
  }

  // Every token, not just the string as a whole: a page that restates one word
  // of a claim while rendering the rest would otherwise still look wired.
  //
  // r3 mutated a field with two-to-four distinct values into another of its own
  // values instead, because `tier` is read as `=== 'inmersion'` and a marker
  // renders identically. Containment made that rule harmful: `levels` has four
  // values, so mutating one school's into another's produced a string already on
  // the page, and the leaf could not be told from a literal. Discriminators are
  // declared in UNPRINTABLE_LEAVES now, which is what they always were.
  return value.replace(/\S+/g, (token) => `${token}${MUTATION_MARK}`);
}

function readPath(root: unknown, segments: (string | number)[]): Primitive {
  return segments.reduce<any>((node, segment) => node[segment], root);
}

function writePath(root: unknown, segments: (string | number)[], value: Primitive): void {
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

/** `visitSchools[3].levels` → `visitSchools..levels`. Siblings share a shape. */
function pathShape(leaf: CohortLeaf): string {
  return leaf.segments.map((segment) => (typeof segment === 'number' ? '' : segment)).join('.');
}

const LEAVES_BY_SHAPE = new Map<string, CohortLeaf[]>();

for (const leaf of LEAVES) {
  LEAVES_BY_SHAPE.set(pathShape(leaf), [...(LEAVES_BY_SHAPE.get(pathShape(leaf)) ?? []), leaf]);
}

async function renderPage(overrides: Overrides): Promise<string> {
  cohortStore.overrides = overrides;
  try {
    const result = (await getServerSideProps({
      req: { headers: { host: 'localhost:3000' } },
    } as never)) as { props: Record<string, unknown> };

    return renderToStaticMarkup(React.createElement(PasantiasPage as never, result.props));
  } finally {
    cohortStore.overrides = {};
  }
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
  {
    pathPrefix: 'visitSchools[0].tier',
    reason:
      "Inert on this page. The tier arrays are already split in the module, and the only place the page reads `tier` is the `=== 'inmersion'` filter behind the immersion figure — which a visit school never satisfies before or after a mutation, so nothing moves. Until r4 this leaf read as wired because the mutation swapped it to 'inmersion', which moved it into that filter: the output changed and the value was still never printed.",
  },
  { pathPrefix: 'visitSchools[1].tier', reason: 'As visitSchools[0].tier.' },
  { pathPrefix: 'visitSchools[2].tier', reason: 'As visitSchools[0].tier.' },
  { pathPrefix: 'visitSchools[3].tier', reason: 'As visitSchools[0].tier.' },
  { pathPrefix: 'visitSchools[4].tier', reason: 'As visitSchools[0].tier.' },
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
      "A discriminator, compared and never shown: the page reads `=== 'inmersion'` to decide which schools the immersion figure is drawn from. Changing it moves the output — the figure stops being computed — but no form of the new value can appear.",
  },
  {
    pathPrefix: 'immersionSchools[1].tier',
    reason: 'As immersionSchools[0].tier.',
  },
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

    const proofFor = async (path: string) => {
      const leaf = LEAVES.find((candidate) => candidate.path === path);
      if (!leaf) throw new Error(`No such leaf: ${path}`);
      return unwiredLeaves([leaf], renderWithHardcoded(leaf));
    };

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
  });
});
