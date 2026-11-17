/**
 * Redesign 6B: a small pin, in the manner of `__tests__/pages/dashboard.clasico.test.tsx`.
 *
 * A pinned case keeps ONE digest (SHA-256) of the text its body returns: the rendered markup,
 * serialised exactly as Vitest serialises a snapshot, and whatever log the case keeps. The digests
 * live in a JSON file beside the test, produced by the code as it was before a change. To see a
 * case's text set `<PREFIX>_SHOW` to its name (or `all`), with `<PREFIX>_OUT` naming a scratch
 * folder; to accept a change on purpose set `<PREFIX>_ACCEPT` to its name (or `all`), which rewrites
 * the JSON file for that case. Nothing is accepted without that variable.
 */
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { getSerializers } from '@vitest/snapshot';
import { expect, it } from 'vitest';

const fromSnapshotPackage = createRequire(createRequire(import.meta.url).resolve('@vitest/snapshot/package.json'));
const { format } = fromSnapshotPackage('pretty-format') as {
  format: (value: unknown, options: Record<string, unknown>) => string;
};

/** What `toMatchSnapshot()` stores for a value (@vitest/snapshot 0.34: serialize + addExtraLineBreaks). */
export function serialise(value: unknown): string {
  const text = format(value, {
    escapeRegex: true,
    indent: 2,
    plugins: getSerializers(),
    printFunctionName: false,
    printBasicPrototype: false,
  }).replace(/\r\n|\r/g, '\n');
  return text.includes('\n') ? `\n${text}\n` : text;
}

const sha256 = (text: string) => createHash('sha256').update(text, 'utf8').digest('hex');

export function makePin(digestsFile: string, prefix: string) {
  let digests: Record<string, string> = {};
  try {
    digests = JSON.parse(readFileSync(digestsFile, 'utf8'));
  } catch {
    digests = {};
  }
  const chosen = (variable: string, name: string) => {
    const value = process.env[`${prefix}_${variable}`];
    return value === 'all' || value === name;
  };
  const out = process.env[`${prefix}_OUT`] || join(tmpdir(), prefix.toLowerCase());
  const ran = new Set<string>();

  function expectPinned(name: string, text: string) {
    const digest = sha256(text);
    if (chosen('SHOW', name) || chosen('ACCEPT', name)) {
      mkdirSync(out, { recursive: true });
      const file = join(out, `${name.replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-|-$/g, '')}.txt`);
      writeFileSync(file, text, 'utf8');
      console.info(`${prefix}: the text of «${name}» is in ${file}`);
    }
    if (chosen('ACCEPT', name)) {
      let current: Record<string, string> = {};
      try {
        current = JSON.parse(readFileSync(digestsFile, 'utf8'));
      } catch {
        current = {};
      }
      current[name] = digest;
      const sorted = Object.fromEntries(Object.keys(current).sort().map((key) => [key, current[key]]));
      writeFileSync(digestsFile, `${JSON.stringify(sorted, null, 2)}\n`, 'utf8');
      console.warn(`${prefix}: «${name}» ACCEPTED on purpose; ${digestsFile} rewritten`);
      return;
    }
    if (digest !== digests[name]) {
      throw new Error(
        [
          `The pinned piece changed in the case «${name}».`,
          `  pinned digest: ${digests[name] ?? '(none)'}`,
          `  digest now:    ${digest}`,
          `To see the text: run with ${prefix}_SHOW set to the case's name (or all) and ${prefix}_OUT set to a`,
          'scratch folder, once before the change and once after, and diff the two files.',
        ].join('\n')
      );
    }
  }

  /** A pinned case: its body returns the stages it wants kept. */
  function pinned(name: string, body: () => Promise<string[]> | string[]) {
    it(name, async () => {
      ran.add(name);
      expectPinned(name, (await body()).join('\n════ next stage ════\n'));
    });
  }

  /** The digests file holds exactly the cases that ran, and the expected number of them. */
  function digestsFileHolds(count: number) {
    it(`the digests file holds exactly the ${count} pinned cases, and every one of them ran`, () => {
      if (process.env[`${prefix}_ACCEPT`]) return;
      expect(Object.keys(digests).sort()).toEqual([...ran].sort());
      expect(ran.size).toBe(count);
    });
  }

  return { pinned, digestsFileHolds };
}
