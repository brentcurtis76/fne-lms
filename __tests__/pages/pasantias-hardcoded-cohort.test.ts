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
 *    per leaf with that single leaf changed in the module. If the rendered
 *    output does not change, the page is not reading that leaf — it is either
 *    restating it as a literal or not showing it at all. This is what catches
 *    the cases a substring scan cannot: `{COHORT_VISIT_DAY_COUNT}` replaced by a
 *    literal `9`, a composed school name, a nine-character `lodgingArea`.
 *
 * Leaves the page genuinely does not render are declared in
 * {@link EXPECTED_GAPS} with a reason. They are asserted to *stay* uncovered, so
 * a gap that later becomes covered fails here and must be deleted — and a new
 * module field that nobody wires fails too, because it belongs to neither list.
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

/**
 * The distinct values each field name takes across the whole module, so a field
 * that behaves as an enum can be mutated into another of *its own* values.
 *
 * Appending a marker is the wrong mutation for a discriminator: `tier` is read
 * as `=== 'inmersion'`, so `'visita'` and `'visitazzq'` render identically and a
 * hardcoded `'visita'` would look wired. Derived from the leaves rather than
 * listed, so the next enum field is handled without anyone noticing it is one.
 */
const VALUES_BY_FIELD = new Map<string, Primitive[]>();

/** The last named segment of a path — `visitSchools[3].tier` → `tier`. */
function fieldName(segments: (string | number)[]): string {
  const named = segments.filter((segment) => typeof segment === 'string');
  return String(named[named.length - 1] ?? '');
}

for (const leaf of LEAVES) {
  const field = fieldName(leaf.segments);
  const values = VALUES_BY_FIELD.get(field) ?? [];
  if (!values.includes(leaf.value)) values.push(leaf.value);
  VALUES_BY_FIELD.set(field, values);
}

/** Two to four distinct plain strings at the same field name reads as an enum. */
function enumSiblings(leaf: CohortLeaf): Primitive[] | null {
  const values = VALUES_BY_FIELD.get(fieldName(leaf.segments)) ?? [];
  if (values.length < 2 || values.length > 4) return null;
  if (!values.every((value) => typeof value === 'string' && !ISO_DATE.test(value))) return null;
  return values;
}

/**
 * A different value of the same shape, so the page keeps working and only its
 * output moves. Dates shift the day rather than the year — the page prints day
 * and month, so a year change would render identically.
 */
function mutateValue(leaf: CohortLeaf): Primitive {
  const { value } = leaf;
  if (typeof value === 'number') return value + 7.25;
  if (typeof value === 'boolean') return !value;
  if (ISO_DATE.test(value)) {
    const [year, month, day] = value.split('-');
    const shifted = String((Number(day) % 27) + 1).padStart(2, '0');
    return `${year}-${month}-${shifted}`;
  }

  const siblings = enumSiblings(leaf);
  if (siblings) {
    const other = siblings.find((candidate) => candidate !== value);
    if (other !== undefined) return other;
  }

  // Every token, not just the string as a whole: a page that restates one word
  // of a claim while rendering the rest would otherwise still look wired.
  return value.replace(/\S+/g, (token) => `${token}${MUTATION_MARK}`);
}

function readPath(root: unknown, segments: (string | number)[]): Primitive {
  return segments.reduce<any>((node, segment) => node[segment], root);
}

function writePath(root: unknown, segments: (string | number)[], value: Primitive): void {
  const parent = segments.slice(0, -1).reduce<any>((node, segment) => node[segment], root);
  parent[segments[segments.length - 1]] = value;
}

/** The override that changes exactly this leaf and nothing else. */
function overrideFor(leaf: CohortLeaf): Overrides {
  const [key, ...rest] = leaf.segments;
  const exportName = EXPORT_BY_KEY[key as string];
  const clone = structuredClone((COHORT_PUBLIC as Record<string, unknown>)[key as string]);

  if (rest.length === 0) return { [exportName]: mutateValue(leaf) };

  writePath(clone, rest, mutateValue(leaf));
  return { [exportName]: clone };
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

/**
 * Leaves whose value the rendered page does not respond to — either restated as
 * a literal or not shown at all.
 */
async function unwiredLeaves(
  leaves: CohortLeaf[],
  render: (overrides: Overrides) => Promise<string> = renderPage
): Promise<string[]> {
  const baseline = await render({});
  const unwired: string[] = [];

  for (const leaf of leaves) {
    if ((await render(overrideFor(leaf))) === baseline) unwired.push(leaf.path);
  }

  return unwired;
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

function matchesPrefix(path: string, pathPrefix: string): boolean {
  return path === pathPrefix || path.startsWith(`${pathPrefix}.`) || path.startsWith(`${pathPrefix}[`);
}

function isExpectedGap(path: string): boolean {
  return EXPECTED_GAPS.some(({ pathPrefix }) => matchesPrefix(path, pathPrefix));
}

const CONTRACT_LEAVES = LEAVES.filter((leaf) => !isExpectedGap(leaf.path));
const GAP_LEAVES = LEAVES.filter((leaf) => isExpectedGap(leaf.path));

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
      expect(unscanned.every((leaf) => CONTRACT_LEAVES.includes(leaf) || isExpectedGap(leaf.path)))
        .toBe(true);
    });
  });

  describe('the render contract', () => {
    it('renders every leaf it does not declare a gap for', async () => {
      expect(await unwiredLeaves(CONTRACT_LEAVES)).toEqual([]);
    }, 60_000);

    it('keeps its declared gaps honest', async () => {
      // Every gap must still be a gap. One that starts rendering has to be
      // deleted from EXPECTED_GAPS, not left as a stale excuse.
      expect(await unwiredLeaves(GAP_LEAVES)).toEqual(GAP_LEAVES.map((leaf) => leaf.path));
    }, 60_000);

    it('declares no gap that matches nothing', () => {
      // A gap left behind after the field it excused was renamed or deleted
      // reads as coverage that was thought about. It was not.
      const orphans = EXPECTED_GAPS.filter(
        ({ pathPrefix }) => !GAP_LEAVES.some((leaf) => matchesPrefix(leaf.path, pathPrefix))
      );

      expect(orphans).toEqual([]);
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
      const [key, ...rest] = leaf.segments;
      const exportName = EXPORT_BY_KEY[key as string];

      if (exportName in pinned) {
        if (rest.length === 0) pinned[exportName] = leaf.value;
        else writePath(pinned[exportName], rest, leaf.value);
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
  });
});
