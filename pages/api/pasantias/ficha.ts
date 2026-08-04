/**
 * GET /api/pasantias/ficha — the open Pasantías INSPIRA Barcelona ficha.
 *
 * Cache-or-generate against the `propuestas` bucket (D-05), keyed by
 * `FICHA_VERSION`. **Whatever sits at the cache path is served as-is** — the
 * generator runs only on a miss, which is D-05's manual-override path: an
 * approved file uploaded to `pasantias/ficha-<VERSION>.pdf` is served verbatim.
 *
 * Public and price-free by construction (D-02): the document this route serves
 * is rendered from `cohort-public.ts` only, and this route imports nothing from
 * `cohort-commercial.ts` — asserted by the D-01 allowlist test in
 * `lib/pasantias/__tests__/pdf.test.ts`.
 */
import { FICHA_FILENAME, FICHA_VERSION } from '@/lib/pasantias/pdf/filenames';
import { generateFicha } from '@/lib/pasantias/ficha';
import { createPasantiasPdfHandler } from '@/lib/pasantias/pdf/serve';

// Two pages with embedded fonts — cheaper than the brochure, same cold-cache
// shape, so it gets the same budget rather than the platform default.
export const config = { maxDuration: 60 };

export default createPasantiasPdfHandler({
  document: 'ficha',
  version: FICHA_VERSION,
  filename: FICHA_FILENAME,
  generate: () => generateFicha(),
});
