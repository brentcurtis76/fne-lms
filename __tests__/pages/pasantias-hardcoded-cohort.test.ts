/**
 * A6r [A1] — no cohort fact may be written as a literal in the `/pasantias`
 * source.
 *
 * This phase exists because the page was redesigned externally and the delivered
 * mockup had every fact inlined. A port that keeps those literals looks
 * identical to a wired one on the day it ships and rots the moment a fact
 * changes: A6a spent four rounds on exactly that failure mode, where an approved
 * amendment reached Appendix A and never reached the rendered page.
 *
 * The check is deliberately blunt. It reads the page's own source — not the
 * rendered HTML, which necessarily contains every fact — and asserts that no
 * value exported by `cohort-public.ts` appears in it as text. The only way to
 * pass is to render the value from the module.
 *
 * WHAT IS AND IS NOT CHECKED, and why. Values shorter than
 * {@link MIN_CHECKED_LENGTH} are skipped: `COHORT_LODGING_AREA` is the single
 * word "Barcelona", which is ordinary page copy, and `ESO` is a substring of
 * three other level strings. Skipping them is what keeps this from being a
 * guard nobody can satisfy. Proper nouns are exempt from that floor — an
 * expert's name is never incidental copy — so every name is checked at any
 * length, as is every ISO date, which has no business being typed out at all.
 *
 * Comments are NOT stripped before scanning. A comment quoting a school name
 * would fail this test, which is the stricter reading and costs nothing: a
 * comment can paraphrase.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import {
  COHORT_CLAIMS,
  COHORT_DATE_LABEL,
  COHORT_DAY_STRUCTURE,
  COHORT_EXCLUDES,
  COHORT_EXPERTS,
  COHORT_FREE_DAYS,
  COHORT_HEADLINE,
  COHORT_INCLUDES,
  COHORT_LABEL,
  COHORT_OBJECTIVES,
  COHORT_SCHOOLS,
  COHORT_VISIT_DAYS,
  COHORT_WEEKS,
} from '../../lib/pasantias/cohort-public';

const REPO_ROOT = join(__dirname, '..', '..');
const PAGE_PATH = join(REPO_ROOT, 'pages', 'pasantias.tsx');
const COMPONENTS_DIR = join(REPO_ROOT, 'components', 'pasantias');

/**
 * Below this, a value is as likely to be ordinary Spanish as it is to be a
 * planted cohort fact. Exemptions are listed explicitly in {@link COHORT_FACTS}.
 */
const MIN_CHECKED_LENGTH = 12;

interface CohortFact {
  /** Where the value comes from, so a failure names the export, not just a string. */
  source: string;
  value: string;
  /** True for values checked regardless of length — proper nouns and ISO dates. */
  alwaysCheck?: boolean;
}

function facts(source: string, values: readonly string[], alwaysCheck = false): CohortFact[] {
  return values.map((value) => ({ source, value, alwaysCheck }));
}

const COHORT_FACTS: CohortFact[] = [
  ...facts('COHORT_LABEL', [COHORT_LABEL]),
  ...facts('COHORT_DATE_LABEL', [COHORT_DATE_LABEL]),
  ...facts('COHORT_HEADLINE', [COHORT_HEADLINE]),
  ...facts('COHORT_WEEKS.label', COHORT_WEEKS.map((week) => week.label)),
  ...facts('COHORT_WEEKS.summary', COHORT_WEEKS.map((week) => week.summary)),
  // Calendar dates: never a coincidence, so no length floor.
  ...facts('COHORT_VISIT_DAYS', COHORT_VISIT_DAYS, true),
  ...facts('COHORT_WEEKS.startDate', COHORT_WEEKS.map((week) => week.startDate), true),
  ...facts('COHORT_WEEKS.endDate', COHORT_WEEKS.map((week) => week.endDate), true),
  ...facts('COHORT_FREE_DAYS.date', COHORT_FREE_DAYS.map((day) => day.date), true),
  ...facts('COHORT_FREE_DAYS.label', COHORT_FREE_DAYS.map((day) => day.label)),
  // Proper nouns: exempt from the length floor for the same reason.
  ...facts('COHORT_SCHOOLS.name', COHORT_SCHOOLS.map((school) => school.name), true),
  ...facts('COHORT_SCHOOLS.levels', COHORT_SCHOOLS.map((school) => school.levels)),
  ...facts('COHORT_SCHOOLS.highlights', COHORT_SCHOOLS.flatMap((school) => school.highlights)),
  ...facts('COHORT_EXPERTS.name', COHORT_EXPERTS.map((expert) => expert.name), true),
  ...facts('COHORT_EXPERTS.role', COHORT_EXPERTS.map((expert) => expert.role)),
  ...facts(
    'COHORT_EXPERTS.school',
    COHORT_EXPERTS.map((expert) => expert.school).filter((school): school is string =>
      Boolean(school)
    ),
    true
  ),
  ...facts(
    'COHORT_EXPERTS.note',
    COHORT_EXPERTS.map((expert) => expert.note).filter((note): note is string => Boolean(note))
  ),
  ...facts('COHORT_CLAIMS', COHORT_CLAIMS),
  ...facts('COHORT_OBJECTIVES', COHORT_OBJECTIVES),
  ...facts('COHORT_DAY_STRUCTURE.label', COHORT_DAY_STRUCTURE.map((block) => block.label)),
  ...facts(
    'COHORT_DAY_STRUCTURE.description',
    COHORT_DAY_STRUCTURE.map((block) => block.description)
  ),
  ...facts('COHORT_INCLUDES', COHORT_INCLUDES),
  ...facts('COHORT_EXCLUDES', COHORT_EXCLUDES),
];

const CHECKED_FACTS = COHORT_FACTS.filter(
  (fact) => fact.alwaysCheck || fact.value.length >= MIN_CHECKED_LENGTH
);

/** Every cohort fact this source writes out as a literal. Empty means wired. */
export function findHardcodedCohortFacts(source: string): CohortFact[] {
  return CHECKED_FACTS.filter((fact) => source.includes(fact.value));
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

describe('A6r [A1] — /pasantias renders cohort data, it does not restate it', () => {
  it('writes no cohort fact as a literal in its own source', () => {
    const offenders = pageSources().flatMap(({ path, source }) =>
      findHardcodedCohortFacts(source).map(
        (fact) => `${path} hardcodes ${fact.source}: ${JSON.stringify(fact.value)}`
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

  /**
   * The oracle above only means something if it can fail. A guard that reads
   * every fact and reports nothing looks identical to a guard whose fact list is
   * empty — which is how A6a shipped three checks that did not check. These two
   * plant a fact and require it to be named.
   */
  it('names a planted school, so the check is not vacuous', () => {
    const school = COHORT_SCHOOLS[0];
    const planted = `<h4 className="font-bold">${school.name}</h4>`;

    expect(findHardcodedCohortFacts(planted).map((fact) => fact.value)).toContain(school.name);
  });

  it('names a planted objective, so long copy is covered too', () => {
    const objective = COHORT_OBJECTIVES[COHORT_OBJECTIVES.length - 1];
    const planted = `<p>${objective}</p>`;

    expect(findHardcodedCohortFacts(planted).map((fact) => fact.value)).toContain(objective);
  });

  it('checks a fact from every export it claims to cover', () => {
    // Guards rot by losing coverage silently: an export renamed or dropped from
    // COHORT_FACTS would leave this suite green over a page that inlines it.
    const covered = new Set(CHECKED_FACTS.map((fact) => fact.source.split('.')[0]));

    expect([...covered].sort()).toEqual([
      'COHORT_CLAIMS',
      'COHORT_DATE_LABEL',
      'COHORT_DAY_STRUCTURE',
      'COHORT_EXCLUDES',
      'COHORT_EXPERTS',
      'COHORT_FREE_DAYS',
      'COHORT_HEADLINE',
      'COHORT_INCLUDES',
      'COHORT_LABEL',
      'COHORT_OBJECTIVES',
      'COHORT_SCHOOLS',
      'COHORT_VISIT_DAYS',
      'COHORT_WEEKS',
    ]);
  });
});
