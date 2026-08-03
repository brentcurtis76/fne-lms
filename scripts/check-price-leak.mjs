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
 * digits like 1000 — so numeric matching is context-scoped: an amount counts
 * only when a currency marker (€ or EUR) sits nearby. The euro symbol on its own
 * is not a finding; the app has unrelated euro-denominated features (consultant
 * rates, expense reports).
 *
 * WHAT A REAL LEAK LOOKS LIKE, verified by deliberately importing the commercial
 * module into `pages/index.tsx` and building — the minifier is why the obvious
 * checks are not enough:
 *   - accented copy is emitted escaped (`seg\xfan el tipo de alojamiento`), so
 *     every file is unescaped before it is searched;
 *   - round thousands are emitted in exponential form when that is shorter
 *     (`1000` → `1e3`), so amounts are matched in that form too;
 *   - object keys do NOT survive — the minifier flattens the object down to the
 *     properties that were read, so `lodgingNote` is not a usable signal while
 *     the string it pointed at is;
 *   - values the module derives at runtime never appear as literals at all, only
 *     their parts do — which is why the copy check below matters as much as the
 *     amounts. (The €1.560 total that first demonstrated this was retired with
 *     the 2026-07-31 lodging amendment; the lodging note is now derived the same
 *     way, from the per-night band.)
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { pathToFileURL } from 'node:url';

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
 *
 * RETIRED AMOUNTS STAY ON THIS LIST. The owner's 2026-08-02 repricing moved the
 * programme from €1.000 to €2.500, and a retired price reaching a public surface
 * is worse than a current one: it is a number FNE would have to honour or
 * retract. So €1.000 is guarded exactly like the live figure, and only amounts
 * whose *shape* stops being distinctive should ever leave this list.
 *
 * Not here: the €560 lodging package, its €1.560 total (both retired 2026-07-31)
 * and the €810 city extension (removed 2026-08-02) — those were dropped before
 * this rule existed and are covered by `__tests__/lib/pasantias-cohort.test.ts`'s
 * PROTECTED_AMOUNTS on the module side. The €70–120 per-night band is protected
 * data too, but its figures are two and three digits long, so they get their own
 * check below rather than this list's wide currency window.
 */
const PRICE_AMOUNT_PATTERNS = [
  '2[.,\\s]?500', //  2500, 2.500, 2,500, 2 500 — the live programme fee
  '2\\.5e3', //       the exponential spelling of 2500
  '1[.,\\s]?000', //  RETIRED 2026-08-02: 1000, 1.000, 1,000, 1 000
  '1e3', //           RETIRED 2026-08-02: how the minifier writes 1000
];

/**
 * The Appendix A-8 lodging band (`COHORT_LODGING_PER_NIGHT_EUR`). A leak that
 * reads `.min` or `.max` alone is tree-shaken free of both the sentinel and the
 * lodging prose, so these figures have to be looked for directly — but `70` and
 * `120` are ordinary numbers that occur constantly in minified output, so they
 * only count inside a much tighter currency window than the amounts above.
 */
const BAND_AMOUNT_PATTERNS = ['70', '120'];

const CURRENCY = '(?:€|EUR)';
/**
 * How far apart the amount and its currency marker may sit. Minified output has
 * no line breaks and packs a whole object into one run of characters, so this
 * has to be wide enough to span `currency:"EUR",items:[{id:…,label:…,amount:…}`
 * — measured at roughly 60 characters in the leak demo. Verified not to fire on
 * a clean build of this repo, which does ship unrelated euro-denominated code.
 */
const GAP = '[\\s\\S]{0,120}?';
/**
 * The band's window, sized to what a rendered figure actually looks like after
 * minification — `"€70"`, `["€",70]`, `"entre €".concat(70,` (nine characters,
 * measured on the r3 leak demo) — and no wider, because at `GAP`'s width a bare
 * `70` would find a euro sign somewhere in most unrelated chunks.
 */
const BAND_GAP = '[\\s\\S]{0,12}?';

const amountPattern = PRICE_AMOUNT_PATTERNS.join('|');
/**
 * Bounded so the band's figures only match as whole amounts: not preceded or
 * followed by another digit, and not sitting inside a grouped or decimal number
 * (`€1.200,70`, `€120.000`), which is how unrelated euro amounts in this repo
 * are written.
 */
const bandAmountPattern =
  `(?<!\\d)(?<![\\d][.,])(?:${BAND_AMOUNT_PATTERNS.join('|')})(?!\\d)(?![.,]\\d)`;

const CHECKS = [
  {
    id: 'sentinel',
    description: 'COMMERCIAL_SENTINEL from cohort-commercial.ts',
    pattern: /__INSPIRA_COMMERCIAL__/g,
  },
  {
    id: 'priced-amount',
    description:
      'an Appendix A-8 programme amount, live or retired, near a currency marker',
    pattern: new RegExp(
      `${CURRENCY}${GAP}(?:${amountPattern})|(?:${amountPattern})${GAP}${CURRENCY}`,
      'g'
    ),
  },
  {
    id: 'priced-band-amount',
    description: 'an Appendix A-8 lodging-band amount beside a currency marker',
    pattern: new RegExp(
      `${CURRENCY}${BAND_GAP}${bandAmountPattern}|${bandAmountPattern}${BAND_GAP}${CURRENCY}`,
      'g'
    ),
  },
  {
    // Copy is what actually survives minification (keys do not), so a structural
    // leak carrying no currency symbol is still visible through its strings.
    // Every fragment must stay a verbatim substring of a live `COHORT_*` string,
    // or it guards nothing: the optional city extension's label fragment was
    // dropped on 2026-08-02 with the extension itself, and `en base a habitación
    // doble` added with the same round's base-doble precision to the lodging note.
    id: 'commercial-copy',
    description: 'a string that only exists in cohort-commercial.ts',
    pattern:
      /Alojamiento en Barcelona: entre|por persona por noche|en base a habitación doble|según el tipo de alojamiento|Precios vigentes para la cohorte|al momento del acuerdo|Pasantias-INSPIRA-Barcelona/g,
  },
];

/**
 * Minified bundles escape non-ASCII (`Extensi\xf3n`), which would hide every
 * accented Spanish string from a literal search. Undo that before scanning.
 */
export function unescapeLiterals(text) {
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

/**
 * Every check's matches in one already-unescaped blob of text. `main` scans
 * files through this, and `__tests__/scripts/check-price-leak.test.ts` scans
 * synthetic leak shapes through it — so what the regression test proves is what
 * the build actually runs, not a copy of it.
 */
export function scanText(text) {
  const found = [];
  for (const check of CHECKS) {
    check.pattern.lastIndex = 0;
    let match;
    while ((match = check.pattern.exec(text)) !== null) {
      found.push({ check, index: match.index, match: match[0] });
    }
  }
  return found;
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
    for (const finding of scanText(text)) {
      findings.push({
        check: finding.check,
        file: relative(process.cwd(), file),
        index: finding.index,
        snippet: snippetAt(text, finding.index, finding.match.length),
      });
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

// Only when run as a CLI: importing this module (the regression test does) must
// not scan the filesystem or exit the process.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
