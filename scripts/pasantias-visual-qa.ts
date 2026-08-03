/**
 * Visual QA renders for the Pasantías PDFs (Phase A3, criterion [A4]).
 *
 * Renders the brochure and the ficha, then rasterises EVERY page to PNG at
 * 144 DPI under `docs/plan/evidence/a3/` so the phase's layout evidence lives in
 * the repository instead of a chat transcript. Text extraction proves what the
 * documents say; only a picture proves nothing is clipped, overflowing or
 * missing an accent.
 *
 * Usage (from the repo root):
 *   NEXT_PUBLIC_BASE_URL=https://nuevaeducacion.org npx tsx scripts/pasantias-visual-qa.ts
 *
 * The base URL matters: the printed call to action resolves through
 * `lib/utils/app-url.ts` (D-09), so a run without it renders the local origin
 * and the evidence would show `localhost:3000/pasantias`.
 *
 * Requires poppler's `pdftoppm` on PATH (`brew install poppler`). This is a
 * developer tool, not a CI gate — CI has no poppler and needs none: the
 * committed PNGs are the artifact.
 */
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readdirSync, rmSync, unlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { generateBrochure } from '../lib/pasantias/brochure';
import { generateFicha } from '../lib/pasantias/ficha';

const DPI = 144;
const OUTPUT_DIR = join(process.cwd(), 'docs', 'plan', 'evidence', 'a3');

function requirePdftoppm(): void {
  try {
    execFileSync('pdftoppm', ['-v'], { stdio: 'pipe' });
  } catch {
    throw new Error(
      'pdftoppm not found on PATH. Install poppler (macOS: `brew install poppler`) and re-run.'
    );
  }
}

/** Rasterise one PDF; returns the PNG filenames written, in page order. */
function rasterise(pdf: Buffer, slug: string, workDir: string): string[] {
  const pdfPath = join(workDir, `${slug}.pdf`);
  writeFileSync(pdfPath, pdf);

  // poppler pads the page suffix to the width of the last page number, so a
  // ten-page document lands as `brochure-01.png` … `brochure-10.png`.
  execFileSync('pdftoppm', [
    '-png',
    '-r',
    String(DPI),
    '-forcenum',
    pdfPath,
    join(OUTPUT_DIR, slug),
  ]);

  return readdirSync(OUTPUT_DIR)
    .filter((name) => name.startsWith(`${slug}-`) && name.endsWith('.png'))
    .sort();
}

async function main(): Promise<void> {
  requirePdftoppm();
  mkdirSync(OUTPUT_DIR, { recursive: true });

  // Start from a clean slate so a shorter document cannot leave orphan pages
  // from a previous run lying around as stale evidence.
  for (const name of readdirSync(OUTPUT_DIR)) {
    if (name.endsWith('.png')) unlinkSync(join(OUTPUT_DIR, name));
  }

  const workDir = mkdtempSync(join(tmpdir(), 'pasantias-visual-qa-'));
  try {
    const [brochure, ficha] = await Promise.all([generateBrochure(), generateFicha()]);

    const written = [
      ...rasterise(brochure, 'brochure', workDir),
      ...rasterise(ficha, 'ficha', workDir),
    ];

    for (const name of written) {
      console.log(`  ${join('docs', 'plan', 'evidence', 'a3', name)}`);
    }
    console.log(`\npasantias-visual-qa: ${written.length} page(s) at ${DPI} DPI.`);
  } finally {
    rmSync(workDir, { recursive: true, force: true });
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
