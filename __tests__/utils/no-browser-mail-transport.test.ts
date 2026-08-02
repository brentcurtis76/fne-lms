/**
 * B1b regression guard — no browser-controlled mail transport survives in the tree.
 *
 * B1b deleted `pages/api/send-email.ts` and `pages/api/test-email.ts`, and the
 * Codex round-1 review then found the same capability class alive through a
 * different door: `utils/meetingUtils.ts` built `{to, subject, html}` in the
 * browser and handed it to a Supabase edge function also named `send-email`
 * (which never existed in this project — every call 404'd silently). Round 2
 * deleted that path.
 *
 * A grep in an evidence file proves the tree at one commit; this file is what
 * keeps it true. Two static sweeps over the source tree:
 *
 *  1. REPO-WIDE — nothing anywhere invokes a Supabase edge function named
 *     `send-email`. The edge function does not exist; a future caller would be
 *     re-creating the reviewed-away capability rather than using a real one.
 *  2. CLIENT SURFACES — the directories that end up in browser bundles carry no
 *     mail transport at all: no relay fetch, no provider SDK, no import of the
 *     server-side mail modules. That set is DERIVED from what tsconfig compiles
 *     minus a documented list of non-browser roots (see `CLIENT_SURFACES`), so
 *     no client tree can be left out by omission. Server-side senders live in
 *     `lib/` and `pages/api/`, where the recipient is derived from persisted
 *     state behind an auth check; those are outside sweep 2 by construction and
 *     covered by their own tests.
 *
 * The rule keys on TRANSPORT, not on message shape: a file that assembles a
 * subject and an HTML body but can reach no sender cannot send mail (see
 * `pages/email-showcase.tsx`, which renders template previews). Capability is
 * what the criterion is about.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = process.cwd();

const SOURCE_EXTENSIONS = ['.ts', '.tsx', '.js', '.jsx'];

/**
 * Top-level directories `tsconfig.json` keeps out of the compiled universe.
 * Read from the file rather than restated here, so the two cannot drift.
 * `include` is `**​/*.ts(x)` — the whole tree — so `exclude` is the only filter,
 * and its plain-name entries (`node_modules`, `__tests__`, `e2e`,
 * `cc-bridge-mcp-server`, …) are exactly the roots TypeScript never sees.
 */
const TSCONFIG_EXCLUDED_ROOTS = new Set<string>(
  (JSON.parse(readFileSync(path.join(ROOT, 'tsconfig.json'), 'utf8')).exclude as string[])
    .filter((entry) => !entry.includes('*') && !path.extname(entry))
);

/**
 * Compiled top-level roots that no browser can execute, with the reason each is
 * out of the client sweep. They are still swept by the repo-wide test below.
 */
const NON_CLIENT_ROOTS: Record<string, string> = {
  docs: 'documentation — markdown, no modules',
  lib: 'shared + server modules; the legitimate home of a mail transport (API routes derive the recipient from persisted state behind an auth check)',
  scripts: 'node-only build and maintenance scripts, never bundled',
  supabase: 'SQL migrations, pgTAP suites and Deno edge functions — never in a browser bundle',
  tests: 'Playwright and Vitest suites — test code, not shipped',
};

/**
 * Directories whose modules can be pulled into a browser bundle — DERIVED, never
 * hand-picked. Everything TypeScript compiles is a client surface unless it is
 * named in `NON_CLIENT_ROOTS` above with a reason. A hand-written list is what
 * failed in round 2: it named five directories and silently omitted `src`, whose
 * components (`src/components/TipTapEditor.tsx`) are imported by `components/`
 * and `pages/` and ship in the same chunks. Deriving the set makes the guard
 * fail closed — a new top-level directory is swept until someone justifies it.
 * Dot-directories (`.github`, `.claude`) are tooling config, not app source.
 */
const CLIENT_SURFACES = readdirSync(ROOT, { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name)
  .filter(
    (name) =>
      !name.startsWith('.') && !TSCONFIG_EXCLUDED_ROOTS.has(name) && !(name in NON_CLIENT_ROOTS)
  )
  .sort();

/** Server-only trees: legitimate homes for a mail transport. */
const SERVER_ONLY = [path.join('pages', 'api')];

/**
 * Files that must be inside the client sweep for it to mean anything: the `src`
 * component round 2 missed, and the modal whose browser-built mail path this
 * phase deleted.
 */
const SWEEP_ANCHORS = [
  path.join('src', 'components', 'TipTapEditor.tsx'),
  path.join('components', 'meetings', 'MeetingDocumentationModal.tsx'),
];

function collectSourceFiles(dir: string): string[] {
  const absolute = path.join(ROOT, dir);
  let entries: string[];
  try {
    entries = readdirSync(absolute);
  } catch {
    return [];
  }
  return entries.flatMap((entry) => {
    const relative = path.join(dir, entry);
    if (statSync(path.join(ROOT, relative)).isDirectory()) {
      return entry === 'node_modules' ? [] : collectSourceFiles(relative);
    }
    return SOURCE_EXTENSIONS.includes(path.extname(entry)) ? [relative] : [];
  });
}

const clientSurfaceFiles = CLIENT_SURFACES.flatMap(collectSourceFiles);

const clientFiles = clientSurfaceFiles.filter(
  (file) => !SERVER_ONLY.some((serverDir) => file.startsWith(serverDir + path.sep))
);

/** Every compiled root, client and not — the repo-wide sweep's universe. */
const allSourceFiles = [
  ...clientSurfaceFiles,
  ...Object.keys(NON_CLIENT_ROOTS).flatMap(collectSourceFiles),
];

/** Transports a browser-bundled module must not be able to reach. */
const FORBIDDEN_IN_CLIENT: Array<{ label: string; pattern: RegExp }> = [
  { label: 'deleted relay routes', pattern: /['"`][^'"`]*\/api\/(send|test)-email/ },
  { label: 'Supabase send-email edge function', pattern: /functions\s*\.\s*invoke\s*\(\s*['"`]send-email['"`]/ },
  { label: 'Resend SDK', pattern: /from\s+['"]resend['"]|require\(\s*['"]resend['"]\s*\)/ },
  { label: 'SendGrid SDK', pattern: /@sendgrid\// },
  { label: 'Nodemailer', pattern: /from\s+['"]nodemailer['"]|require\(\s*['"]nodemailer['"]\s*\)/ },
  { label: 'server-side mail modules', pattern: /from\s+['"][^'"]*lib\/(emailService|email\/)/ },
];

describe('no browser-controlled mail transport (B1b)', () => {
  it('sweeps every client root, including src', () => {
    // Guards the guard: a broken collector, or a client tree left out of the
    // derived set, would make every assertion below vacuous.
    expect(CLIENT_SURFACES).toContain('src');
    for (const anchor of SWEEP_ANCHORS) expect(clientFiles).toContain(anchor);
    expect(clientFiles.length).toBeGreaterThan(100);
  });

  it('no source file invokes a Supabase edge function named send-email', () => {
    const offenders = allSourceFiles.filter((file) =>
      /functions\s*\.\s*invoke\s*\(\s*['"`]send-email['"`]/.test(readFileSync(path.join(ROOT, file), 'utf8'))
    );
    expect(offenders).toEqual([]);
  });

  it('client-bundled surfaces reach no mail transport', () => {
    const offenders: string[] = [];
    for (const file of clientFiles) {
      const source = readFileSync(path.join(ROOT, file), 'utf8');
      for (const { label, pattern } of FORBIDDEN_IN_CLIENT) {
        if (pattern.test(source)) offenders.push(`${file} → ${label}`);
      }
    }
    expect(offenders).toEqual([]);
  });
});
