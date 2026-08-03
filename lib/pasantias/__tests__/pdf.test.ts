// @vitest-environment node
/**
 * Phase A3 — brochure and ficha generators.
 *
 * These are text-extraction tests, not snapshots: both documents are rendered
 * for real and the PDF's own text layer is read back with `pdf-parse`. That is
 * the only check that means anything here, because D-02's guarantee is about
 * what a reader can see in the delivered bytes — a component test proves a
 * React tree, not a page.
 *
 * Two properties are load-bearing:
 *  - the brochure carries the Appendix A-8 investment (the €1.000 programme fee
 *    and the €70–120 per-night band on a base-doble basis) and never the retired
 *    €560 package or its €1.560 total, and never Madrid (removed 2026-08-02);
 *  - the ficha carries no monetary token at all — enforced structurally, since
 *    it does not import `cohort-commercial.ts` and so has no price in reach.
 */
import { beforeAll, describe, expect, it } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { PDFDocument } from 'pdf-lib';
import pdfParse from 'pdf-parse';
import { generateBrochure } from '../brochure';
import { generateFicha } from '../ficha';
import { COHORT_HEADLINE } from '../cohort-public';
import { FICHA_FILENAME, FICHA_VERSION, isRfc5987SafeFilename } from '../pdf/filenames';
import { BROCHURE_FILENAME, COMMERCIAL_SENTINEL } from '../cohort-commercial';

/** Rendering a ten-page PDF with embedded fonts is slow; render each once. */
const RENDER_TIMEOUT_MS = 60_000;

/**
 * A PDF's text layer keeps the line breaks the layout produced, so a sentence
 * that wraps comes back split. Line breaks are layout, not content: phrases are
 * asserted against whitespace-collapsed text.
 */
function normalize(text: string): string {
  return text.replace(/\s+/g, ' ');
}

/**
 * The same text with whitespace removed entirely — used only for the absence
 * checks, so a forbidden amount cannot hide inside a line break (`1.5` / `60`).
 * Collapsing to nothing can in principle glue two unrelated numbers together,
 * which is why it backs up the normalized check rather than replacing it.
 */
function compact(text: string): string {
  return text.replace(/\s+/g, '');
}

/**
 * The headline date form both documents must print, and the one they must not.
 *
 * Appendix A-1 was amended on 2026-08-02: the two-range label read as two
 * different pasantías, so every headline surface shows one continuous span.
 * `COHORT_HEADLINE` is the derived string (`Octubre, 5 al 16 · 2026`) — pinning
 * the constant proves the documents consume the module rather than composing
 * their own year, and the literal below proves the retired form is gone even if
 * someone reintroduces it by hand.
 */
const SINGLE_SPAN_LABEL = 'Octubre, 5 al 16';
const RETIRED_TWO_RANGE_LABEL = '5–9 y 13–16';

let brochure: Buffer;
let ficha: Buffer;
let brochureText: string;
let fichaText: string;
let brochureCompact: string;
let fichaCompact: string;
let brochurePages: number;
let fichaPages: number;

beforeAll(async () => {
  [brochure, ficha] = await Promise.all([generateBrochure(), generateFicha()]);

  const [brochureParsed, fichaParsed] = await Promise.all([
    pdfParse(brochure),
    pdfParse(ficha),
  ]);
  brochureText = normalize(brochureParsed.text);
  fichaText = normalize(fichaParsed.text);
  brochureCompact = compact(brochureParsed.text);
  fichaCompact = compact(fichaParsed.text);

  const [brochureDoc, fichaDoc] = await Promise.all([
    PDFDocument.load(brochure),
    PDFDocument.load(ficha),
  ]);
  brochurePages = brochureDoc.getPageCount();
  fichaPages = fichaDoc.getPageCount();
}, RENDER_TIMEOUT_MS);

describe('generateBrochure — document shape', () => {
  it('returns PDF bytes', () => {
    expect(brochure.length).toBeGreaterThan(0);
    expect(brochure.toString('ascii', 0, 5)).toBe('%PDF-');
  });

  it('is a full brochure, not a leaflet', () => {
    expect(brochurePages).toBeGreaterThanOrEqual(5);
  });
});

describe('generateBrochure — cohort content (Appendix A)', () => {
  it('names the cohort and its dates', () => {
    expect(brochureText).toContain('Pasantías INSPIRA');
    expect(brochureText).toContain('Octubre 2026');
    expect(brochureText).toContain(SINGLE_SPAN_LABEL);
  });

  it('prints the dates as one span with the year once, never the retired two ranges', () => {
    expect(brochureText).toContain(COHORT_HEADLINE);
    expect(brochureText).not.toContain(RETIRED_TWO_RANGE_LABEL);
    expect(brochureCompact).not.toContain(compact(RETIRED_TWO_RANGE_LABEL));
  });

  it('states the honest day count and the two-week structure', () => {
    expect(brochureText).toContain('9 días de visitas');
    expect(brochureText).toContain('Semana 1 — inmersión');
    expect(brochureText).toContain('Semana 2 — visitas');
    expect(brochureText).toContain('Fiesta Nacional de España');
  });

  it('renders all thirteen objectives', () => {
    expect(brochureText).toContain('Los 13 objetivos');
    expect(brochureText).toContain(
      'Comprender y apreciar el giro relacional que implica migrar hacia la Nueva Educación'
    );
  });

  it('renders the day structure', () => {
    expect(brochureText).toContain('Mañana 1');
    expect(brochureText).toContain('Mañana 2');
    expect(brochureText).toContain('Tarde');
  });

  it('renders all seven schools in their two tiers', () => {
    for (const school of [
      'Escola Virolai',
      'Escola Sadako',
      'Institut Escola El Puig',
      'Escola La Maquinista',
      'Escola Octavio Paz',
      'Institut Angeleta Ferrer',
      'Institut Escola Les Vinyes',
    ]) {
      expect(brochureText).toContain(school);
    }
    expect(brochureText).toContain('día completo');
  });

  it('renders the eight-person team with the titles the brief fixes', () => {
    for (const member of [
      'Coral Regí',
      'Mora del Fresno',
      'Jordi Musons',
      'Sandra Entrena',
      'Boris Mir',
      'Sergi del Moral',
      'Pepe Menéndez',
      'Joan Quintana',
    ]) {
      expect(brochureText).toContain(member);
    }
    expect(brochureText).toContain('Encargada de Innovación');
  });

  it('renders what the programme includes and excludes', () => {
    expect(brochureText).toContain('Comidas incluidas en los días de visita y cena de cierre');
    expect(brochureText).toContain('Desayunos de hotel');
    expect(brochureText).toContain('Seguros');
  });

  it('identifies the controller, not just the brand', () => {
    expect(brochureText).toContain('Fundación Nueva Educación');
    expect(brochureText).toContain('Fundación Instituto Relacional');
    expect(brochureText).toContain('RUT 65.166.503-5');
    expect(brochureText).toContain('Carlos Silva Vildósola 10448');
    expect(brochureText).toContain('info@nuevaeducacion.org');
    expect(brochureText).toContain('+56 9 4162 3577');
    expect(brochureText).toContain('/pasantias');
  });
});

/**
 * The retired €560 lodging package and its €1.560 combined total (Appendix A-8,
 * amended 2026-07-31), in every form they could reach a page — but only ever in
 * **currency context**. The figures alone are three and four digits that occur
 * innocently in RUTs, phone numbers and addresses; a bare substring check goes
 * red on those coincidences, and a check that cries wolf is one that gets
 * loosened or removed. `RETIRED_AMOUNT_PATTERNS` is exercised in both
 * directions by its own control test below.
 */
const RETIRED_AMOUNT_PATTERNS: readonly RegExp[] = [
  /€\s*1?[.,]?560\b/, // €560 · € 560 · €1.560 · €1560
  /\b1?[.,]?560\s*(?:€|EUR\b|euros?\b)/i, // 560 € · 1.560 EUR · 1.560 euros
];

describe('generateBrochure — investment per amended Appendix A-8', () => {
  it('quotes the programme fee in es-CL currency format', () => {
    expect(brochureText).toContain('1.000');
  });

  it('quotes the lodging band and its base-doble basis', () => {
    expect(brochureText).toContain('70');
    expect(brochureText).toContain('120');
    expect(brochureText).toContain('base doble');
    // The compressed table cell is never the only place the precision lives.
    expect(brochureText).toContain('en base a habitación doble');
    expect(brochureText).toContain('el monto es por persona, no por habitación');
  });

  it('uses the owner-decided coordination framing for lodging', () => {
    expect(brochureText).toContain('se coordina con el equipo FNE según tu preferencia');
  });

  it('states the payment terms, the minimum and the validity', () => {
    expect(brochureText).toContain('50% al momento del acuerdo');
    expect(brochureText).toContain('30 días antes');
    expect(brochureText).toContain('5 personas');
    expect(brochureText).toContain('Precios vigentes para la cohorte Octubre 2026');
  });

  it('never quotes the retired lodging package or its combined total', () => {
    for (const pattern of RETIRED_AMOUNT_PATTERNS) {
      expect(brochureText).not.toMatch(pattern);
      expect(brochureCompact).not.toMatch(pattern);
    }
  });

  /**
   * The guard above is only worth its line if it still fires. A bare `560`
   * substring did fire, but on any three digits that happened to line up — a
   * RUT, a phone number, a street number — and a check that goes red for
   * innocent reasons is a check someone eventually deletes, taking the real
   * coverage with it. Hence the currency context; hence this control.
   */
  it('the retired-amount guard matches real leaks in every currency form', () => {
    for (const leak of [
      '€560 por persona',
      'alojamiento 560 € por noche',
      '560 EUR en habitación doble',
      'total: €1.560',
      '1.560 euros por persona',
      'Alojamiento€560',
      '€1560',
    ]) {
      expect(RETIRED_AMOUNT_PATTERNS.some((pattern) => pattern.test(leak))).toBe(true);
    }
    for (const innocent of [
      'RUT 65.166.503-5',
      '+56 9 4162 3577',
      'Carlos Silva Vildósola 10448',
      '560 metros del metro',
    ]) {
      expect(RETIRED_AMOUNT_PATTERNS.some((pattern) => pattern.test(innocent))).toBe(false);
    }
  });

  it('never mentions Madrid', () => {
    expect(brochureText).not.toMatch(/madrid/i);
    expect(brochureCompact).not.toMatch(/madrid/i);
  });
});

/**
 * Every shape a price could take in the ficha. `€`/`EUR` are the currency
 * markers; the figures are the Appendix A-8 amounts bounded so an unrelated
 * number cannot match; the phrases are strings that exist only in
 * `cohort-commercial.ts` or in the brochure's investment section.
 */
const MONETARY_TOKENS: readonly RegExp[] = [
  /€/,
  /\bEUR\b/i,
  /\beuros?\b/i,
  /\b1[.,]?000\b/,
  /\b70\b/,
  /\b120\b/,
  /por persona por noche/i,
  /base doble/i,
  /habitación doble/i,
  /Precios vigentes/i,
  /al momento del acuerdo/i,
  /Inversión/i,
  new RegExp(COMMERCIAL_SENTINEL),
];

describe('generateFicha — document shape', () => {
  it('returns PDF bytes', () => {
    expect(ficha.length).toBeGreaterThan(0);
    expect(ficha.toString('ascii', 0, 5)).toBe('%PDF-');
  });

  it('fits in one or two pages', () => {
    expect(fichaPages).toBeGreaterThanOrEqual(1);
    expect(fichaPages).toBeLessThanOrEqual(2);
  });
});

describe('generateFicha — open content, no prices (D-02)', () => {
  it('carries the cohort essentials', () => {
    expect(fichaText).toContain('Pasantías INSPIRA Barcelona');
    expect(fichaText).toContain('Octubre 2026');
    expect(fichaText).toContain(SINGLE_SPAN_LABEL);
    expect(fichaText).toContain('9 días de visitas');
    expect(fichaText).toContain('Escola Virolai');
    expect(fichaText).toContain('Institut Escola Les Vinyes');
    expect(fichaText).toContain('Mañana 1');
    expect(fichaText).toContain('Coral Regí');
  });

  it('prints the dates as one span with the year once, never the retired two ranges', () => {
    expect(fichaText).toContain(COHORT_HEADLINE);
    expect(fichaText).not.toContain(RETIRED_TWO_RANGE_LABEL);
    expect(fichaCompact).not.toContain(compact(RETIRED_TWO_RANGE_LABEL));
    // The two-week breakdown stays where itinerary detail belongs.
    expect(fichaText).toContain('Semana 1 — inmersión');
    expect(fichaText).toContain('Semana 2 — visitas');
  });

  it('offers the web and WhatsApp call to action', () => {
    expect(fichaText).toContain('/pasantias');
    expect(fichaText).toContain('+56 9 4162 3577');
  });

  it('contains no monetary token of any kind', () => {
    for (const token of MONETARY_TOKENS) {
      expect(fichaText).not.toMatch(token);
    }
    // Word boundaries do not survive whitespace removal, so the compact pass
    // only looks for the shapes that carry their own delimiters.
    expect(fichaCompact).not.toMatch(/€|\bEUR\b|1[.,]000/i);
  });

  it('never mentions Madrid', () => {
    expect(fichaText).not.toMatch(/madrid/i);
    expect(fichaCompact).not.toMatch(/madrid/i);
  });
});

describe('download filenames (A4 headers)', () => {
  it('are safe in both Content-Disposition forms', () => {
    expect(isRfc5987SafeFilename(BROCHURE_FILENAME)).toBe(true);
    expect(isRfc5987SafeFilename(FICHA_FILENAME)).toBe(true);
  });

  it('name the document, the cohort and the cache version', () => {
    expect(BROCHURE_FILENAME).toMatch(/^Pasantias-INSPIRA-Barcelona-octubre-2026-.+\.pdf$/);
    expect(FICHA_FILENAME).toBe(
      `Ficha-Pasantias-INSPIRA-Barcelona-octubre-2026-${FICHA_VERSION}.pdf`
    );
  });

  it('rejects the shapes that would break a header', () => {
    expect(isRfc5987SafeFilename('')).toBe(false);
    expect(isRfc5987SafeFilename('Pasantías.pdf')).toBe(false);
    expect(isRfc5987SafeFilename('a"b.pdf')).toBe(false);
    expect(isRfc5987SafeFilename('a\\b.pdf')).toBe(false);
    expect(isRfc5987SafeFilename('dir/file.pdf')).toBe(false);
    expect(isRfc5987SafeFilename('a;b.pdf')).toBe(false);
    expect(isRfc5987SafeFilename('a\nb.pdf')).toBe(false);
  });
});

// ── D-01 importer allowlist ──────────────────────────────────────────────────

const REPO_ROOT = join(__dirname, '..', '..', '..');
const SCANNED_DIRS = ['lib', 'pages', 'components', 'utils', 'scripts', '__tests__', 'tests'];
const SOURCE_EXTENSIONS = ['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs'];

/** `import … from '…/cohort-commercial'` or `require('…/cohort-commercial')`. */
const COMMERCIAL_IMPORT =
  /(?:from\s*|require\(\s*|import\(\s*)['"][^'"]*cohort-commercial(?:\.[a-z]+)?['"]/;

/**
 * The files allowed to import the commercial cohort module (D-01). The brochure
 * generator is the only production importer; the two test files exercise the
 * split itself. Anything else is a price on its way to a client bundle.
 */
const ALLOWED_COMMERCIAL_IMPORTERS = [
  'lib/pasantias/brochure.tsx',
  'lib/pasantias/__tests__/pdf.test.ts',
  '__tests__/lib/pasantias-cohort.test.ts',
].sort();

function listSourceFiles(dir: string): string[] {
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return [];
  }

  const found: string[] = [];
  for (const entry of entries) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue;
      found.push(...listSourceFiles(full));
    } else if (
      entry.isFile() &&
      SOURCE_EXTENSIONS.some((extension) => entry.name.endsWith(extension))
    ) {
      found.push(full);
    }
  }
  return found;
}

describe('D-01 — who may import cohort-commercial.ts', () => {
  it('is exactly the brochure generator and the tests that prove the split', () => {
    const importers: string[] = [];
    for (const dir of SCANNED_DIRS) {
      const full = join(REPO_ROOT, dir);
      try {
        if (!statSync(full).isDirectory()) continue;
      } catch {
        continue;
      }
      for (const file of listSourceFiles(full)) {
        if (COMMERCIAL_IMPORT.test(readFileSync(file, 'utf8'))) {
          importers.push(relative(REPO_ROOT, file));
        }
      }
    }

    expect(importers.sort()).toEqual(ALLOWED_COMMERCIAL_IMPORTERS);
  });
});
