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
 *     server-side mail modules. Server-side senders live in `lib/` and
 *     `pages/api/`, where the recipient is derived from persisted state behind
 *     an auth check; those are excluded here and covered by their own tests.
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

/** Directories whose modules can be pulled into a browser bundle. */
const CLIENT_SURFACES = ['components', 'pages', 'hooks', 'contexts', 'utils'];

/** Server-only trees: legitimate homes for a mail transport. */
const SERVER_ONLY = [path.join('pages', 'api')];

const SOURCE_EXTENSIONS = ['.ts', '.tsx', '.js', '.jsx'];

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

const clientFiles = CLIENT_SURFACES.flatMap(collectSourceFiles).filter(
  (file) => !SERVER_ONLY.some((serverDir) => file.startsWith(serverDir + path.sep))
);

const allSourceFiles = [...clientFiles, ...collectSourceFiles('lib'), ...collectSourceFiles('scripts')];

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
  it('sweeps a non-trivial number of client files', () => {
    // Guards the guard: a broken collector would make every assertion vacuous.
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
