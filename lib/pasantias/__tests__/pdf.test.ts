// @vitest-environment node
/**
 * Brochure and ficha generators — January 2027 (PASANT-B003, C006).
 *
 * These are text-extraction tests, not snapshots: both documents are rendered
 * for real and the PDF's own text layer is read back with `pdf-parse`, and the
 * page geometry with `pdf-lib`. That is the only check that means anything
 * here, because D-02's guarantee is about what a reader can see in the delivered
 * bytes — a component test proves a React tree, not a page.
 *
 * Every expected string below is typed here from the ratified contract
 * (`docs/plan/pasantias-january-contract.md`), not imported from the modules
 * the generators read, so a wrong module value fails instead of agreeing with
 * itself. Load-bearing properties:
 *  - ONE brochure and ONE ficha, each covering both programs;
 *  - the brochure (the generated fallback for Brent's designed file) carries
 *    every ratified commercial fact: both fees, the discount condition, the
 *    per-person ranges, the 1–10 team table, 12 vs 13 nights, return on the
 *    29th vs the 30th, the flight, lodging, exchange rate and rounding, the
 *    payment split and the places rule — and no retired October price;
 *  - the ficha carries no monetary or brochure-only fact of any kind, enforced
 *    structurally (it cannot import `cohort-commercial.ts`) and checked here;
 *  - neither document is held to the October one-to-two-page budget: the ficha
 *    is as long as the ratified content needs.
 */
import { beforeAll, describe, expect, it } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { PDFDocument } from 'pdf-lib';
import pdfParse from 'pdf-parse';
import { generateBrochure } from '../brochure';
import { generateFicha } from '../ficha';
import { FICHA_FILENAME, FICHA_VERSION, isRfc5987SafeFilename } from '../pdf/filenames';
import { BROCHURE_FILENAME, BROCHURE_VERSION, COMMERCIAL_SENTINEL } from '../cohort-commercial';

/** Rendering a multi-page PDF with embedded fonts is slow; render each once. */
const RENDER_TIMEOUT_MS = 60_000;

/** A4 in PDF points. */
const A4 = { width: 595.28, height: 841.89 };

/**
 * A PDF's text layer keeps the line breaks the layout produced, so a sentence
 * that wraps comes back split. Line breaks are layout, not content: phrases are
 * asserted against whitespace-collapsed text.
 */
function normalize(text: string): string {
  return text.replace(/\s+/g, ' ');
}

/**
 * The same text with whitespace removed entirely — used only for absence
 * checks, so a forbidden figure cannot hide inside a line break.
 */
function compact(text: string): string {
  return text.replace(/\s+/g, '');
}

let brochure: Buffer;
let ficha: Buffer;
let brochureText: string;
let fichaText: string;
let brochureCompact: string;
let fichaCompact: string;
let brochureSizes: { width: number; height: number }[];
let fichaSizes: { width: number; height: number }[];

beforeAll(async () => {
  [brochure, ficha] = await Promise.all([generateBrochure(), generateFicha()]);

  const [brochureParsed, fichaParsed] = await Promise.all([pdfParse(brochure), pdfParse(ficha)]);
  brochureText = normalize(brochureParsed.text);
  fichaText = normalize(fichaParsed.text);
  brochureCompact = compact(brochureParsed.text);
  fichaCompact = compact(fichaParsed.text);

  const [brochureDoc, fichaDoc] = await Promise.all([
    PDFDocument.load(brochure),
    PDFDocument.load(ficha),
  ]);
  brochureSizes = brochureDoc.getPages().map((page) => page.getSize());
  fichaSizes = fichaDoc.getPages().map((page) => page.getSize());
}, RENDER_TIMEOUT_MS);

/** Both programs' shared public content — every line must be in BOTH documents. */
const SHARED_PUBLIC_CONTENT = [
  // Identity and span (C004).
  'Pasantías INSPIRA Barcelona',
  'Cohorte Enero 2027',
  'Enero, 18 al 29 · 2027',
  'Todos viajan juntos a Barcelona',
  '¿Primera vez? Pasantía INSPIRA. ¿Ya viajaste? Mirada Profunda.',
  // The two programs (C005).
  'Pasantía INSPIRA',
  'Equipos que viajan por primera vez',
  'lunes 18 de enero a jueves 28 de enero',
  'Inspiración y un mapa de lo posible',
  'INSPIRA Mirada Profunda',
  'Quienes ya viajaron con INSPIRA',
  'lunes 18 de enero a viernes 29 de enero',
  'Cómo se hace por dentro, y una hoja de ruta para marzo',
  // Calendars and the common weekend.
  'Semana 1 — inmersión',
  'Semana 2 — visitas',
  'Cada pasante vive 2,5 días en Escola Virolai y 2,5 días en Escola Sadako.',
  'Una escuela por día.',
  'Cinco jornadas en escuelas.',
  'Sábado 23 y domingo 24 de enero',
  // Schools.
  '2,5 días por pasante',
  'Cada cohorte visita 4 de estas 5 escuelas',
  'Escola La Maquinista',
  'Escola Octavio Paz',
  'La selección y el orden se definen con el grupo, según sus intereses y la disponibilidad de cada escuela.',
  'Institut Escola El Puig y Institut Escola Les Vinyes están fuera de Barcelona y toman el día completo.',
  'Institut Angeleta Ferrer',
  'El orden de las escuelas se confirma con cada una según su disponibilidad y puede cambiar.',
  'Una de ellas puede repartir sus dos días entre el viernes 22 y el lunes 25.',
  // Mirada Profunda before / during / after.
  'Cada participante define, con el equipo FNE, un desafío real de su colegio.',
  'viernes 29 de enero: El viernes 29 cada participante presenta qué va a mover en marzo y cómo.',
  'En abril, una sesión online para revisar qué se implementó y ajustar el rumbo.',
  // Day, host, includes and excludes.
  'Presentación del proyecto educativo y entrevista con la dirección',
  'Talleres con expertos del movimiento de Nueva Educación',
  'Jordi Musons',
  'Director, Escola Sadako · Anfitrión',
  'Los talleres de la tarde con especialistas.',
  'Desayuno a media mañana en las escuelas.',
  'Almuerzos: en la Pasantía INSPIRA, durante la primera semana (Escola Virolai y Escola Sadako).',
  'En Mirada Profunda, todos los días del programa.',
  'acompañamiento para definir tu pregunta antes del viaje',
  'sesión online de seguimiento en abril',
  'Traslados colegio – aeropuerto de Santiago – colegio',
  'Almuerzos de la segunda semana (solo en la Pasantía INSPIRA)',
  'Pasajes y alojamiento, salvo que los coordines a través de FNE',
  // Ratified claims (P-02, P-03).
  '400+ Pasantes han viajado con FNE',
  '12 Escuelas catalanas en la red',
  'Fundación Nueva Educación es Agencia Técnica Educativa certificada por RPA Mineduc.',
  // Controller identity and contact.
  'Fundación Instituto Relacional',
  'RUT 65.166.503-5',
  'info@nuevaeducacion.org',
  '+56 9 4162 3577',
  '/pasantias',
];

/** October 2026 content that must not reach a January document. */
const OCTOBER_ONLY = [
  'Octubre',
  'octubre',
  'Fiesta Nacional',
  'Coral Regí',
  'Sandra Entrena',
  'Boris Mir',
  'Pepe Menéndez',
  'Mañana 1',
  'Los 13 objetivos',
  'Desayunos de hotel',
  'Instituto Relacional, barrio de Eixample',
  'Mussons',
];

describe('both documents — one shared January 2027 document each', () => {
  it('are PDF bytes', () => {
    expect(brochure.toString('ascii', 0, 5)).toBe('%PDF-');
    expect(ficha.toString('ascii', 0, 5)).toBe('%PDF-');
  });

  it('carry every shared public fact, for both programs', () => {
    for (const line of SHARED_PUBLIC_CONTENT) {
      expect([line, brochureText.includes(line)]).toEqual([line, true]);
      expect([line, fichaText.includes(line)]).toEqual([line, true]);
    }
  });

  it('carry nothing from the October cohort', () => {
    for (const retired of OCTOBER_ONLY) {
      expect([retired, brochureText.includes(retired)]).toEqual([retired, false]);
      expect([retired, fichaText.includes(retired)]).toEqual([retired, false]);
    }
  });

  it('lay every page out on A4, with no page-count cap on the ficha', () => {
    for (const size of [...brochureSizes, ...fichaSizes]) {
      expect(size.width).toBeCloseTo(A4.width, 0);
      expect(size.height).toBeCloseTo(A4.height, 0);
    }
    // A full brochure, not a leaflet; the ficha takes the pages its content
    // needs (the October 1–2 page budget would cut ratified January facts).
    expect(brochureSizes.length).toBeGreaterThanOrEqual(8);
    expect(fichaSizes.length).toBeGreaterThanOrEqual(2);
    expect(fichaSizes.length).toBeLessThan(brochureSizes.length);
  });

  it('print their own January cache version', () => {
    expect(brochureText).toContain('Versión 2027-01-v1');
    expect(fichaText).toContain('Versión 2027-01-v1');
  });

  it('never mention Madrid', () => {
    expect(brochureCompact).not.toMatch(/madrid/i);
    expect(fichaCompact).not.toMatch(/madrid/i);
  });
});

/** Every ratified commercial fact, as the brochure prints it (es-CL formatting). */
const BROCHURE_COMMERCIAL_CONTENT = [
  // Fees and the discount condition.
  'Programa (por persona)',
  '$2.500.000',
  '$2.000.000',
  'COLEGIOS CON PROGRAMA ANUAL DE ASESORÍA FNE',
  // Nights, arrival and the two returns.
  '12 · llegada domingo 17 de enero, regreso viernes 29 de enero',
  '13 · llegada domingo 17 de enero, regreso sábado 30 de enero',
  // Per-person ranges, both programs, standard and discounted.
  '$4.700.000 – $5.000.000',
  '$4.200.000 – $4.500.000',
  '$4.700.000 – $5.100.000',
  '$4.200.000 – $4.600.000',
  // Flight, lodging, exchange rate, rounding.
  '$1.500.000',
  'Alojamiento en Barcelona: entre €50 y €75 por persona por noche, en base a habitación doble',
  'Habitación individual: aproximadamente €100 por noche.',
  'tipo de cambio de referencia de €1 = $1.100',
  'redondeados a los $100.000 más cercanos',
  // Payment, places, validity.
  '50% al reservar y el 50% restante la semana antes del inicio de la pasantía',
  'Se confirman por orden de reserva.',
  'Precios vigentes para la cohorte de enero 2027.',
  // Team table, both ends of both programs.
  'Valores por equipo',
  'Equipo de 1',
  'Equipo de 10',
  '$47.000.000 – $50.000.000',
  '$42.000.000 – $45.000.000',
  '$47.000.000 – $51.000.000',
  '$42.000.000 – $46.000.000',
  '$14.100.000 – $15.300.000',
];

/**
 * Every amount October's Appendix A-8 retired, in currency context only — the
 * figures alone occur innocently in RUTs, phone numbers and addresses. Kept
 * from the October suite: a retired price is a number FNE would have to honour.
 */
const RETIRED_AMOUNT_PATTERNS: readonly RegExp[] = [
  /€\s*1?[.,]?560\b/,
  /\b1?[.,]?560\s*(?:€|EUR\b|euros?\b)/i,
  /€\s*1[.,]?000\b/,
  /\b1[.,]?000\s*(?:€|EUR\b|euros?\b)/i,
  /€\s*2[.,]?500\b/,
  /€\s*(?:70|120)\b/,
];

describe('generateBrochure — every ratified commercial fact (C006)', () => {
  it('prints each one, in es-CL currency format', () => {
    for (const line of BROCHURE_COMMERCIAL_CONTENT) {
      expect([line, brochureText.includes(line)]).toEqual([line, true]);
    }
  });

  it('prints the full team table: twenty rows, sizes 1 to 10 for each program', () => {
    expect(brochureText.match(/Equipo de \d+/g)).toHaveLength(20);
    for (let size = 1; size <= 10; size += 1) {
      expect(brochureText.match(new RegExp(`Equipo de ${size}(?!\\d)`, 'g'))).toHaveLength(2);
    }
  });

  it('never quotes a retired October price', () => {
    for (const pattern of RETIRED_AMOUNT_PATTERNS) {
      expect(brochureText).not.toMatch(pattern);
      expect(brochureCompact).not.toMatch(pattern);
    }
    expect(brochureText).not.toContain('al momento del acuerdo');
    expect(brochureText).not.toContain('30 días antes');
  });

  /** The guard above is only worth its line if it still fires. */
  it('the retired-amount guard matches real leaks and ignores innocent figures', () => {
    for (const leak of ['€560 por persona', 'total: €1.560', 'Programa € 1.000', '€2.500', '€70', '1.000 euros']) {
      expect(RETIRED_AMOUNT_PATTERNS.some((pattern) => pattern.test(leak))).toBe(true);
    }
    for (const innocent of ['RUT 65.166.503-5', '+56 9 4162 3577', 'Carlos Silva Vildósola 10448', '$2.500.000']) {
      expect(RETIRED_AMOUNT_PATTERNS.some((pattern) => pattern.test(innocent))).toBe(false);
    }
  });
});

/**
 * Every shape a price or a brochure-only fact could take in the ficha. The
 * figures are the January peso amounts, bounded so an unrelated number cannot
 * match, plus October's retired euro ones; the phrases exist only in
 * `cohort-commercial.ts` or the brochure's investment pages.
 */
const MONETARY_TOKENS: readonly RegExp[] = [
  /€/,
  /\$/,
  /\bEUR\b/i,
  /\bCLP\b/i,
  /\beuros?\b/i,
  /\bpesos?\b/i,
  /\b2[.,]?500(?:[.,]?000)?\b/,
  /\b2[.,]?000[.,]?000\b/,
  /\b1[.,]?500[.,]?000\b/,
  /\b[45][.,]?[0-9]00[.,]?000\b/,
  /\b1[.,]?000\b/,
  /\b1[.,]?100\b/,
  /\b100[.,]?000\b/,
  /\b70\b/,
  /\b120\b/,
  /por persona por noche/i,
  /habitación doble/i,
  /Precios vigentes/i,
  /al reservar/i,
  /restante/i,
  /ASESORÍA/i,
  /descuento/i,
  /Inversión/i,
  /Valores por equipo/i,
  /noches/i,
  /regreso/i,
  /llegada/i,
  /domingo 17 de enero|sábado 30 de enero/,
  new RegExp(COMMERCIAL_SENTINEL),
];

describe('generateFicha — open content, no prices (D-02)', () => {
  it('contains no monetary or brochure-only token of any kind', () => {
    for (const token of MONETARY_TOKENS) {
      expect([String(token), token.test(fichaText)]).toEqual([String(token), false]);
    }
    // Word boundaries do not survive whitespace removal, so the compact pass
    // only looks for the shapes that carry their own delimiters.
    expect(fichaCompact).not.toMatch(/€|\$|\bEUR\b|\bCLP\b/i);
  });

  it('offers the web and WhatsApp call to action', () => {
    expect(fichaText).toContain('/pasantias');
    expect(fichaText).toContain('+56 9 4162 3577');
    expect(fichaText).toContain('Los cupos de la cohorte de enero se confirman por orden de reserva.');
  });
});

describe('download filenames and versions (A4 headers), pinned independently', () => {
  it('are the January names, typed here rather than derived', () => {
    expect(BROCHURE_VERSION).toBe('2027-01-v1');
    expect(FICHA_VERSION).toBe('2027-01-v1');
    expect(BROCHURE_FILENAME).toBe('Pasantias-INSPIRA-Barcelona-enero-2027-2027-01-v1.pdf');
    expect(FICHA_FILENAME).toBe('Ficha-Pasantias-INSPIRA-Barcelona-enero-2027-2027-01-v1.pdf');
  });

  it('can never collide with an October name', () => {
    for (const october of [
      'Pasantias-INSPIRA-Barcelona-octubre-2026-2026-10-v5.pdf',
      'Ficha-Pasantias-INSPIRA-Barcelona-octubre-2026-2026-10-v2.pdf',
    ]) {
      expect([BROCHURE_FILENAME, FICHA_FILENAME]).not.toContain(october);
    }
    expect(BROCHURE_VERSION).not.toMatch(/^2026-10-/);
    expect(FICHA_VERSION).not.toMatch(/^2026-10-/);
  });

  it('are safe in both Content-Disposition forms', () => {
    expect(isRfc5987SafeFilename(BROCHURE_FILENAME)).toBe(true);
    expect(isRfc5987SafeFilename(FICHA_FILENAME)).toBe(true);
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
 * generator and the route that serves it are the production importers — the
 * route needs `BROCHURE_VERSION` for its cache key and `BROCHURE_FILENAME` for
 * its `Content-Disposition`; the test files exercise the split itself. Anything
 * else — the ficha, a page, a component, an e-mail template — is a price on its
 * way to a client bundle.
 */
const ALLOWED_COMMERCIAL_IMPORTERS = [
  'lib/pasantias/brochure.tsx',
  'pages/api/pasantias/brochure.ts',
  'lib/pasantias/__tests__/pdf.test.ts',
  '__tests__/lib/pasantias-cohort.test.ts',
  '__tests__/api/pasantias-pdf.test.ts',
].sort();

/** The two A4 routes, by the D-01 side of the fence each one sits on. */
const BROCHURE_ROUTE = 'pages/api/pasantias/brochure.ts';
const FICHA_ROUTE = 'pages/api/pasantias/ficha.ts';

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
  it('is exactly the brochure generator, its route and the tests that prove the split', () => {
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

  it('lets the brochure route reach the prices and never the ficha route', () => {
    const brochureRoute = readFileSync(join(REPO_ROOT, BROCHURE_ROUTE), 'utf8');
    const fichaRoute = readFileSync(join(REPO_ROOT, FICHA_ROUTE), 'utf8');

    expect(COMMERCIAL_IMPORT.test(brochureRoute)).toBe(true);
    expect(COMMERCIAL_IMPORT.test(fichaRoute)).toBe(false);
    expect(ALLOWED_COMMERCIAL_IMPORTERS).toContain(BROCHURE_ROUTE);
    expect(ALLOWED_COMMERCIAL_IMPORTERS).not.toContain(FICHA_ROUTE);
  });

  it('keeps the ficha generator and the e-mail module off the commercial side', () => {
    for (const file of ['lib/pasantias/ficha.tsx', 'lib/pasantias/emails.ts', 'components/pasantias/LeadForm.tsx', 'pages/pasantias.tsx']) {
      expect([file, COMMERCIAL_IMPORT.test(readFileSync(join(REPO_ROOT, file), 'utf8'))]).toEqual([file, false]);
    }
  });
});
