/**
 * PASANT-B001a — source integrity for the January 2027 brochure and the B001
 * discovery evidence (docs/plan/evidence/pasant-january/).
 *
 * The pinned values below come from the approved PASANT plan (grant rev 1) and
 * the A9 row IDs it names, never from implementation constants. These tests read
 * only committed snapshots, so CI and a fresh checkout run the same assertions;
 * the real PDF and A9 Git objects are compared with the snapshots by the
 * PASANT-01 RUN validator, not here.
 */
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = join(__dirname, '../../..');
const EVIDENCE = join(ROOT, 'docs/plan/evidence/pasant-january');
const SOURCE_SHA256 = '84d83e153ee794a95d7a9e019359fc637237842ae0a7128f98cae332ff4efdb5';
const SOURCE_PAGES = 17;
const SOURCE_VERSION = '2027-01-V1';
const MAIN_SHA = '76349909621bc07a1c7ab8242cd3c3ececaed152';
const A9_SHA = '9008bacddcf40a79aa4c051b11ab3a5baf33939b';

/** Approved-plan C002 facts, as the brochure must state them. */
const PLAN_FACTS: Array<{ page: number; text: string }> = [
  { page: 1, text: 'Pasantía INSPIRA y Mirada Profunda' },
  { page: 3, text: '18 al 28 de enero · 9 días en escuelas' },
  { page: 3, text: '18 al 29 de enero · 10 días en escuelas' },
  { page: 3, text: '6 escuelas' },
  { page: 3, text: '5 escuelas, dos días completos en cada una' },
  { page: 17, text: `VERSIÓN ${SOURCE_VERSION}` },
];

/** A9 release-checklist rows named by PASANT-C011, plus the later LEDGER results it preserves. */
const A9_ROWS = [
  'A2-1', 'A2-2', 'A2-3', 'A2-4', 'A2-5', 'A2-6', 'A2-7a', 'A2-7b', 'A2-7c', 'A2-7d',
  'A2-8', 'A2-9', 'A2-10', 'A2-11', 'A2-12', 'A2-13', 'A2-4/6 (CI)',
];
const A9_LEDGER_RESULTS: Record<string, string> = {
  'A2-9': 'PASS', 'A2-11': 'FAIL', 'A2-12': 'FAIL', 'A2-13': 'BLOCKED',
};

type SourceSnapshot = {
  source: { sha256: string; bytes: number; pages: number; version: string };
  extraction: { tool: string; toolVersion: string; method: string };
  pages: Array<{ page: number; sha256: string; text: string }>;
};
type A9Snapshot = {
  graph: { main: string; a9: string; mergeBase: string; leftRightCount: string };
  extracts: Array<{ commit: string; path: string; blob: string; sha256: string; lines: string[] }>;
};

const sha256 = (text: string) => createHash('sha256').update(text).digest('hex');
const squash = (text: string) => text.normalize('NFKC').replace(/\s+/g, '');
const cells = (line: string) => line.split('|').slice(1, -1).map((cell) => cell.trim());
const tableRows = (doc: string, firstCell: RegExp) =>
  doc.split('\n').filter((line) => line.startsWith('|')).map(cells).filter((row) => firstCell.test(row[0]));
const readEvidence = (name: string) => readFileSync(join(EVIDENCE, name), 'utf8');
const fencedJson = <T>(name: string): T => {
  const block = readEvidence(name).match(/```json\n([\s\S]*?)\n```/);
  if (!block) throw new Error(`${name}: no fenced json block`);
  return JSON.parse(block[1]) as T;
};

const matrix = readEvidence('b001-fact-matrix.md');
const reconciliation = readEvidence('b001-reconciliation.md');
const source = fencedJson<SourceSnapshot>('b001-source-snapshot.md');
const a9 = fencedJson<A9Snapshot>('b001-a9-snapshot.md');
const pages = source.pages.map((page) => squash(page.text));
const facts = tableRows(matrix, /^F\d+$/).map(([id, program, field, , cited, anchor]) => ({
  id, program, field,
  pages: cited.split(',').map(Number),
  anchor: anchor.replace(/^`|`$/g, ''),
}));
const decisions = tableRows(matrix, /^DEC-\d+$/);
const register = new Map(tableRows(reconciliation, /^A2-/).map((row) => [row[0], row]));
const extract = (commit: string, path: string) => {
  const found = a9.extracts.find((x) => x.commit === commit && x.path === path);
  if (!found) throw new Error(`A9 snapshot has no extract ${commit}:${path}`);
  return found.lines.join('\n');
};

describe('B001 fact matrix (committed evidence)', () => {
  it('records the pinned provenance and its page-text snapshot', () => {
    expect(matrix).toContain(SOURCE_SHA256);
    expect(matrix).toMatch(new RegExp(`Pages: ${SOURCE_PAGES}\\b`));
    expect(matrix).toContain(`Version: \`${SOURCE_VERSION}\``);
    expect(matrix).toContain('b001-source-snapshot.md');
  });

  it('has unique fact IDs with in-range page references and an anchor each', () => {
    expect(facts.length).toBeGreaterThanOrEqual(30);
    expect(new Set(facts.map((f) => f.id)).size).toBe(facts.length);
    for (const fact of facts) {
      expect(fact.anchor, fact.id).not.toBe('');
      for (const page of fact.pages) expect(page >= 1 && page <= SOURCE_PAGES, fact.id).toBe(true);
    }
  });

  it.each([
    ['INSPIRA', 'audience'], ['Mirada Profunda', 'audience'], ['INSPIRA', 'dates'],
    ['Mirada Profunda', 'dates'], ['INSPIRA', 'duration'], ['INSPIRA', 'school selection'],
    ['Mirada Profunda', 'schools'], ['per program', 'includes'], ['per program', 'excludes'],
    ['INSPIRA', 'CLP'], ['Mirada Profunda', 'CLP'], ['both', 'EUR'],
  ])('covers %s · %s', (program, field) => {
    expect(facts.some((f) => f.program === program && f.field.includes(field))).toBe(true);
  });

  it('records every approved-plan fact on its page', () => {
    for (const { page, text } of PLAN_FACTS) {
      expect(facts.some((f) => f.pages.includes(page) && squash(f.anchor).includes(squash(text))), text).toBe(true);
    }
  });

  it('keeps brochure facts, plan facts, deltas and decisions in separate sections', () => {
    for (const heading of ['## 1. Brochure facts', '## 2. Approved-plan facts', '## 3. Delta', '## 4. Proposed corrections']) {
      expect(matrix).toContain(heading);
    }
  });

  it('lists every required decision, keeps C002 corrections open and cites evidence for each settled row', () => {
    expect(decisions.length).toBeGreaterThanOrEqual(8);
    const topics = decisions.map((row) => row[1]).join('\n');
    for (const topic of [/Muss?ons vs Muss?ons/, /RPA/, /four-of-five/, /packaging/i, /Publication mode/, /Program IDs/, /success copy/i, /Canonical status/]) {
      expect(topics).toMatch(topic);
    }
    for (const [id, topic, , , status, evidence] of decisions) {
      expect(status, id).toMatch(/^(UNRESOLVED|PLAN DEFAULT|DECIDED)\b/);
      if (status.startsWith('PLAN DEFAULT')) expect(evidence, id).toMatch(/plan rev 1/);
      if (status.startsWith('DECIDED')) expect(evidence, id).toMatch(/\d{4}-\d{2}-\d{2}/);
      if (/Muss?ons|RPA|four-of-five|Canonical status/.test(topic)) expect(status, id).not.toMatch(/^PLAN DEFAULT/);
    }
  });
});

describe('committed page-text snapshot of the pinned January brochure', () => {
  it('records the pinned hash, page count, version and extraction method', () => {
    expect(source.source.sha256).toBe(SOURCE_SHA256);
    expect(source.source.pages).toBe(SOURCE_PAGES);
    expect(source.source.version).toBe(SOURCE_VERSION);
    expect(source.extraction.tool).toBe('pdf-parse');
    expect(source.extraction.method).not.toBe('');
    expect(source.pages.map((page) => page.page)).toEqual(Array.from({ length: SOURCE_PAGES }, (_, i) => i + 1));
  });

  it('every page text matches its recorded SHA-256', () => {
    for (const page of source.pages) {
      expect(page.text.length, `p${page.page}`).toBeGreaterThan(0);
      expect(sha256(page.text), `p${page.page}`).toBe(page.sha256);
    }
  });

  it('states every approved-plan fact on its page, and the matcher rejects October text', () => {
    for (const { page, text } of PLAN_FACTS) expect(pages[page - 1], text).toContain(squash(text));
    expect(pages[2]).not.toContain(squash('Octubre, 5 al 16'));
  });

  it('contains every matrix anchor on each cited page', () => {
    for (const fact of facts) {
      for (const page of fact.pages) expect(pages[page - 1], `${fact.id} p${page}`).toContain(squash(fact.anchor));
    }
  });

  it('page 15 team totals are page 14 per-person values times team size', () => {
    const clp = (n: number) => `$${String(n).replace(/\B(?=(\d{3})+(?!\d))/g, '.')}`;
    for (let n = 1; n <= 10; n += 1) {
      for (const [fee, low, high] of [[2_500_000, 4_700_000, 5_000_000], [2_000_000, 4_200_000, 4_500_000]]) {
        expect(pages[14], `${n} personas`).toContain(squash(`${n} persona${n > 1 ? 's' : ''} ${clp(n * fee)} ${clp(n * low)} a ${clp(n * high)}`));
      }
    }
  });
});

describe('B001 A9 reconciliation (committed evidence)', () => {
  it('records the refreshed SHAs, the exact graph count and its Git snapshot', () => {
    expect(reconciliation).toContain(MAIN_SHA);
    expect(reconciliation).toContain(A9_SHA);
    expect(reconciliation).toMatch(/--count origin\/main\.\.\.origin\/phase\/a9-verify` → `(\d+)\t(\d+)`/);
    expect(reconciliation).toContain('b001-a9-snapshot.md');
  });

  it('registers every A9 row and preserves the later LEDGER results', () => {
    for (const row of A9_ROWS) expect(register.has(row), row).toBe(true);
    for (const [row, result] of Object.entries(A9_LEDGER_RESULTS)) {
      expect(register.get(row)?.[2], row).toContain(`**${result}**`);
    }
  });

  it('keeps writer release and receiver ACK explicit', () => {
    expect(reconciliation).toMatch(/Writer release: (UNKNOWN|[^.]*\d{4}-\d{2}-\d{2})/);
    expect(reconciliation).toMatch(/Receiver ACK: (UNKNOWN|[^.]*\d{4}-\d{2}-\d{2})/);
  });
});

describe('committed A9 Git snapshot', () => {
  it('pins the plan SHAs and agrees with the recorded merge base and left/right counts', () => {
    expect(a9.graph.main).toBe(MAIN_SHA);
    expect(a9.graph.a9).toBe(A9_SHA);
    expect(a9.graph.leftRightCount).toMatch(/^\d+\t\d+$/);
    expect(reconciliation).toContain(`merge base | \`${a9.graph.mergeBase}\``);
    expect(reconciliation).toContain(`→ \`${a9.graph.leftRightCount}\``);
  });

  it('every extract names its source object and matches its recorded SHA-256', () => {
    expect(a9.extracts.length).toBeGreaterThanOrEqual(5);
    for (const x of a9.extracts) {
      const name = `${x.commit}:${x.path}`;
      expect([MAIN_SHA, A9_SHA], name).toContain(x.commit);
      expect(x.blob, name).toMatch(/^[0-9a-f]{40}$/);
      expect(x.lines.length, name).toBeGreaterThan(0);
      expect(sha256(x.lines.join('\n')), name).toBe(x.sha256);
    }
  });

  it('register covers every row in the A9 checklist and matches the A9 LEDGER results', () => {
    const checklist = extract(A9_SHA, 'docs/plan/evidence/a9/release-checklist.md');
    const ids = [...checklist.matchAll(/^(?:\| (A2-[\w/]+(?: \(CI\))?) \||### (A2-\d+) )/gm)].map((m) => m[1] ?? m[2]);
    expect(new Set(ids)).toEqual(new Set(A9_ROWS));
    for (const id of ids) expect(register.has(id), id).toBe(true);
    expect(extract(A9_SHA, 'docs/plan/LEDGER.md')).toContain('A2-9 (WhatsApp unfurl) **PASS**; A2-11 (auto-reply) **FAIL**; A2-12 (internal notification) **FAIL**; A2-13 (brochure link inside the received email) **BLOCKED**');
  });

  it('preserves the A9 IN REVIEW plan row and the mandatory flow-spec registration', () => {
    expect(extract(A9_SHA, 'docs/plan/PLAN.md')).toMatch(/^\| A9 \|.*\*\*IN REVIEW\*\*/);
    expect(extract(MAIN_SHA, 'docs/plan/PLAN.md')).toMatch(/^\| A9 \|.*\| TODO \|/);
    expect(extract(A9_SHA, 'scripts/ci/e2e-mandatory.mjs')).toContain("'tests/e2e/pasantias-flow.spec.ts'");
  });
});

describe('B001a review request', () => {
  it('names objective, branch/base/count, risk groups, evidence, scrutiny areas and limitations', () => {
    const request = readFileSync(join(ROOT, 'docs/planning/reviews/fase-pasant-b001-discovery-review-request.md'), 'utf8');
    for (const heading of ['## Branch', '## Objective', '## Files by risk', '## Test evidence', '## Scrutinize', '## Known limitations']) {
      expect(request).toContain(heading);
    }
    expect(request).toContain(MAIN_SHA);
    expect(request).toMatch(/B001 (remains|stays) open/);
    for (const name of ['b001-source-snapshot.md', 'b001-a9-snapshot.md', 'validate-original-source.mjs']) expect(request).toContain(name);
  });
});
