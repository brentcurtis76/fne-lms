/**
 * GET /api/pasantias/brochure — the full Pasantías INSPIRA Barcelona brochure.
 *
 * Cache-or-generate against the `propuestas` bucket (D-05), keyed by
 * `BROCHURE_VERSION`. **Whatever sits at the cache path is served as-is** — the
 * generator runs only on a miss. That is D-05's manual-override path and the
 * way the owner's hand-designed brochure is published (Decision Log
 * 2026-08-02): upload the approved file to `pasantias/brochure-<VERSION>.pdf`
 * and this route serves those exact bytes, with the generated brochure staying
 * as the data-faithful fallback.
 *
 * UI-gated but publicly shareable by owner decision — this route is
 * deliberately unauthenticated, and the prices it serves are allowed inside PDF
 * bytes and nowhere else (D-02).
 *
 * D-01: one of the two files in the repository permitted to import
 * `cohort-commercial.ts` (the other is the generator it calls). The ficha route
 * must never appear in that allowlist.
 */
import { BROCHURE_FILENAME, BROCHURE_VERSION } from '@/lib/pasantias/cohort-commercial';
import { generateBrochure } from '@/lib/pasantias/brochure';
import { createPasantiasPdfHandler } from '@/lib/pasantias/pdf/serve';

// Rendering ten pages with embedded fonts is well over the default budget on a
// cold cache; matches pages/api/licitaciones/[id]/generate-propuesta.ts.
export const config = { maxDuration: 60 };

export default createPasantiasPdfHandler({
  document: 'brochure',
  version: BROCHURE_VERSION,
  filename: BROCHURE_FILENAME,
  generate: () => generateBrochure(),
});
