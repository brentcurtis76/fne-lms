/**
 * Z0B NER spike — emits the Node-only layer's per-mention verdicts so the
 * Python side can compute NER-only and Node+NER recall on IDENTICAL inputs.
 *
 * Run:  npx tsx scripts/spikes/ner/measure-node.ts > /tmp/node-results.json
 *
 * Scoring is deliberately the same rule the vitest suites use: a mention counts
 * as caught when its exact surface string no longer appears in the sanitized
 * text. Anything looser would make the three columns of the results table
 * incomparable.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { MAX_NAME_TOKENS, NON_PERSON_TERMS, sanitize } from '../../../lib/zoom/sanitizer';

type FixtureCase = {
  id: string;
  category?: string;
  attendees: string[];
  text: string;
  mustRedact: string[];
  mustPreserve: string[];
};

type FixtureSuite = { suite: string; cases: FixtureCase[] };

const FIXTURE_DIR = join(__dirname, '..', '..', '..', '__tests__', 'lib', 'zoom', 'fixtures');

function load(name: string): FixtureSuite {
  return JSON.parse(readFileSync(join(FIXTURE_DIR, name), 'utf8')) as FixtureSuite;
}

const suites = [load('must-catch.json'), load('adversarial.json')];

const output = {
  sanitizerVersion: sanitize('x', []).sanitizerVersion,
  // Shared with the Python side so the any-label NER variant vetoes the same
  // institutions/places/subjects the Node layer already knows about, instead of
  // maintaining a second drifting copy of that list.
  nonPersonTerms: Array.from(NON_PERSON_TERMS).sort(),
  maxNameTokens: MAX_NAME_TOKENS,
  suites: suites.map((suite) => ({
    suite: suite.suite,
    cases: suite.cases.map((fixture) => {
      const started = process.hrtime.bigint();
      const result = sanitize(fixture.text, fixture.attendees);
      const elapsedMs = Number(process.hrtime.bigint() - started) / 1e6;

      return {
        id: fixture.id,
        category: fixture.category ?? 'explicit-reference',
        elapsedMs,
        status: result.status,
        mentions: fixture.mustRedact.map((mention) => ({
          mention,
          caughtByNode: !result.sanitizedText.includes(mention),
        })),
        preserved: fixture.mustPreserve.map((keep) => ({
          keep,
          survivedNode: result.sanitizedText.includes(keep),
        })),
      };
    }),
  })),
};

process.stdout.write(`${JSON.stringify(output, null, 2)}\n`);
