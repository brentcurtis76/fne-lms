#!/usr/bin/env node
/**
 * D-01 leak guard — no commercial cohort data in the client bundle.
 *
 * `lib/pasantias/cohort-commercial.ts` holds the Pasantías prices and payment
 * terms. Per D-02 those may appear in the brochure PDF bytes and in no other
 * repository-authored surface. `cohort-public.ts` is the module public pages
 * import; the split only means something if something checks it, so this script
 * runs after `next build` and greps everything the browser actually downloads.
 *
 * Usage (after a production build):
 *   node scripts/check-price-leak.mjs
 *
 * WHAT IS SCANNED: `.next/static/**` — the directory Next.js serves to browsers.
 * `.next/server/**` is deliberately NOT scanned: once A3 lands, the brochure
 * generator runs there and is supposed to hold prices.
 *
 * EXCLUSIONS: files whose extension is a known binary asset (images, fonts,
 * media) are skipped — they cannot carry a string leak and decoding them would
 * only produce noise. Everything else under `.next/static` is read as UTF-8,
 * including source maps when a build emits them.
 *
 * FALSE POSITIVES: bare amounts are useless as a signal — minified JS is full of
 * the digits 560 and 1000 — so numeric matching is context-scoped: an amount
 * counts only when a currency marker (€ or EUR) sits nearby. The euro symbol on
 * its own is not a finding; the app has unrelated euro-denominated features
 * (consultant rates, expense reports).
 *
 * WHAT A REAL LEAK LOOKS LIKE, verified by deliberately importing the commercial
 * module into `pages/index.tsx` and building — the minifier is why the obvious
 * checks are not enough:
 *   - accented copy is emitted escaped (`Extensi\xf3n opcional a Madrid`), so
 *     every file is unescaped before it is searched;
 *   - `1000` is emitted as `1e3`, so amounts are matched in that form too;
 *   - object keys do NOT survive — the minifier flattens the object down to the
 *     properties that were read, so `madridExtension` is not a usable signal
 *     while the label string it pointed at is;
 *   - `COHORT_PRICE_TOTAL` is a runtime `reduce`, so `1560` never appears as a
 *     literal at all; the parts do.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const STATIC_DIR = join(process.cwd(), '.next', 'static');

/** Extensions that cannot carry a text leak. */
const BINARY_EXTENSIONS = new Set([
  '.png', '.jpg', '.jpeg', '.gif', '.webp', '.avif', '.ico', '.bmp',
  '.woff', '.woff2', '.ttf', '.otf', '.eot',
  '.mp4', '.webm', '.mp3', '.wav', '.pdf', '.zip', '.gz',
]);

/**
 * Amounts from Appendix A-8, in every form a bundler emits them. Keep in sync
 * with the values in `lib/pasantias/cohort-commercial.ts` — a price added there
 * without being added here is a price this guard will not look for.
 */
const PRICE_AMOUNT_PATTERNS = [
  '1[.,\\s]?000', // 1000, 1.000, 1,000, 1 000
  '1e3', //          how the minifier writes 1000
  '1[.,\\s]?560', // the programme + lodging total
  '560',
  '810',
];

const CURRENCY = '(?:€|EUR)';
/**
 * How far apart the amount and its currency marker may sit. Minified output has
 * no line breaks and packs a whole object into one run of characters, so this
 * has to be wide enough to span `currency:"EUR",items:[{id:…,label:…,amount:…}`
 * — measured at roughly 60 characters in the leak demo. Verified not to fire on
 * a clean build of this repo, which does ship unrelated euro-denominated code.
 */
const GAP = '[\\s\\S]{0,120}?';

const amountPattern = PRICE_AMOUNT_PATTERNS.join('|');

const CHECKS = [
  {
    id: 'sentinel',
    description: 'COMMERCIAL_SENTINEL from cohort-commercial.ts',
    pattern: /__INSPIRA_COMMERCIAL__/g,
  },
  {
    id: 'priced-amount',
    description: 'an Appendix A-8 amount near a currency marker',
    pattern: new RegExp(
      `${CURRENCY}${GAP}(?:${amountPattern})|(?:${amountPattern})${GAP}${CURRENCY}`,
      'g'
    ),
  },
  {
    // Copy is what actually survives minification (keys do not), so a structural
    // leak carrying no currency symbol is still visible through its strings.
    id: 'commercial-copy',
    description: 'a string that only exists in cohort-commercial.ts',
    pattern:
      /Extensión opcional a Madrid|Alojamiento \(habitación doble\)|Precios vigentes para la cohorte|al momento del acuerdo|Pasantias-INSPIRA-Barcelona/g,
  },
];

/**
 * Minified bundles escape non-ASCII (`Extensi\xf3n`), which would hide every
 * accented Spanish string from a literal search. Undo that before scanning.
 */
function unescapeLiterals(text) {
  return text
    .replace(/\\x([0-9a-fA-F]{2})/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)))
    .replace(/\\u\{([0-9a-fA-F]+)\}/g, (_, hex) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/\\u([0-9a-fA-F]{4})/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)));
}

function listFiles(dir) {
  const found = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      found.push(...listFiles(path));
    } else if (entry.isFile()) {
      found.push(path);
    }
  }
  return found;
}

function isScannable(path) {
  const dot = path.lastIndexOf('.');
  const extension = dot === -1 ? '' : path.slice(dot).toLowerCase();
  return !BINARY_EXTENSIONS.has(extension);
}

/** Bundles are one enormous line, so report an offset and its neighbourhood. */
function snippetAt(text, index, length) {
  const from = Math.max(0, index - 40);
  const to = Math.min(text.length, index + length + 40);
  return text.slice(from, to).replace(/\s+/g, ' ');
}

function main() {
  let stats;
  try {
    stats = statSync(STATIC_DIR);
  } catch {
    stats = null;
  }
  if (!stats || !stats.isDirectory()) {
    console.error(
      `check-price-leak: ${relative(process.cwd(), STATIC_DIR)} does not exist — run \`npm run build\` first.`
    );
    process.exit(1);
  }

  const files = listFiles(STATIC_DIR).filter(isScannable);
  if (files.length === 0) {
    console.error(
      'check-price-leak: found no scannable files under .next/static — the build output looks wrong.'
    );
    process.exit(1);
  }

  const findings = [];
  for (const file of files) {
    const text = unescapeLiterals(readFileSync(file, 'utf8'));
    for (const check of CHECKS) {
      check.pattern.lastIndex = 0;
      let match;
      while ((match = check.pattern.exec(text)) !== null) {
        findings.push({
          check,
          file: relative(process.cwd(), file),
          index: match.index,
          snippet: snippetAt(text, match.index, match[0].length),
        });
      }
    }
  }

  if (findings.length > 0) {
    console.error(
      `check-price-leak: FAIL — commercial cohort data reached the client bundle (${findings.length} match(es)).\n`
    );
    for (const finding of findings) {
      console.error(`  [${finding.check.id}] ${finding.file} @ ${finding.index}`);
      console.error(`      ${finding.check.description}`);
      console.error(`      …${finding.snippet}…\n`);
    }
    console.error(
      'Only the server-side brochure generator may import lib/pasantias/cohort-commercial.ts.\n' +
        'Public surfaces import lib/pasantias/cohort-public.ts, which has no monetary fields.'
    );
    process.exit(1);
  }

  console.log(
    `check-price-leak: OK — scanned ${files.length} file(s) under .next/static, no commercial data found.`
  );
}

main();
