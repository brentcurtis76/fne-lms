/**
 * Cache-or-generate serving for the two Pasantías PDFs (D-05).
 *
 * Both routes — `/api/pasantias/brochure` and `/api/pasantias/ficha` — do the
 * same four things in the same order, and they have to keep doing them the same
 * way: the download contract is public, and a divergence between the two would
 * be a bug nobody sees until a reader gets the wrong header. Hence one handler
 * factory parameterised by document, cache version, filename and generator.
 *
 * MANUAL OVERRIDE (D-05, and the reason the cache is read before anything else)
 * — whatever object sits at the cache path is served AS-IS. The generator only
 * runs on a miss. That is not an accident of caching: it is the supported way
 * the owner publishes a hand-designed brochure (Decision Log 2026-08-02), which
 * is uploaded to the cache path after per-file approval and then served
 * verbatim, unversioned by anything this code does.
 *
 * D-01: this module must never import `cohort-commercial.ts`. The commercial
 * filename and version arrive as plain parameters, so the ficha route's import
 * graph stays free of prices — proved by the allowlist test in
 * `lib/pasantias/__tests__/pdf.test.ts`.
 */
import type { NextApiRequest, NextApiResponse } from 'next';
import { handleMethodNotAllowed } from '../../api-auth';
import { RATE_LIMITS, withRateLimit } from '../../rateLimit';
import { downloadFile, uploadFile } from '../../propuestas/storage';
import { buildContentDisposition } from './filenames';

/** Prefix of both cache keys inside the `propuestas` bucket. */
export const PASANTIAS_CACHE_PREFIX = 'pasantias';

/** `Cache-Control` max-age for both documents, in seconds. */
export const PDF_MAX_AGE_SECONDS = 3600;

/** The two documents A4 serves; also the `<name>` half of the cache key. */
export type PasantiasDocument = 'brochure' | 'ficha';

export interface PasantiasPdfRoute {
  document: PasantiasDocument;
  /** Cache version — `BROCHURE_VERSION` or `FICHA_VERSION`. */
  version: string;
  /** Download filename; must satisfy `isRfc5987SafeFilename`. */
  filename: string;
  /** A3's generator, called only on a cache miss. */
  generate: () => Promise<Buffer>;
}

/** D-05's cache key: `pasantias/<name>-<VERSION>.pdf` in the `propuestas` bucket. */
export function pasantiasCachePath(document: PasantiasDocument, version: string): string {
  return `${PASANTIAS_CACHE_PREFIX}/${document}-${version}.pdf`;
}

function describe(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/**
 * Build the API handler for one document.
 *
 * The rate limit is best-effort dampening only (D-04): the durable cost control
 * is the cache above it, since a hit costs one bucket read and no rendering.
 */
export function createPasantiasPdfHandler(route: PasantiasPdfRoute) {
  const path = pasantiasCachePath(route.document, route.version);

  async function handler(req: NextApiRequest, res: NextApiResponse): Promise<void> {
    if (req.method !== 'GET') {
      handleMethodNotAllowed(res, ['GET']);
      return;
    }

    let pdf: Buffer | null = null;

    try {
      pdf = await downloadFile(path);
    } catch (err) {
      // A miss and an unreachable bucket look the same from here, and the
      // response is the same either way: generate it now.
      console.log(`[pasantias-pdf] cache miss for ${path}: ${describe(err)}`);
    }

    if (!pdf) {
      try {
        // Deliberately generated WITHOUT the request: the bytes are cached in a
        // bucket every deployment shares, so the URL they print must not depend
        // on which deployment happened to miss the cache first. `app-url.ts`
        // resolves the configured origin (D-09) and never the Host header in
        // production.
        pdf = await route.generate();
      } catch (err) {
        console.error(`[pasantias-pdf] could not generate ${route.document}: ${describe(err)}`);
        res.status(500).json({
          error: 'No se pudo generar el documento. Intente nuevamente en unos minutos.',
        });
        return;
      }

      try {
        await uploadFile(path, pdf, 'application/pdf');
      } catch (err) {
        // A broken bucket must not break the download: we already hold the
        // bytes, so the request still succeeds and only the caching is lost.
        console.error(`[pasantias-pdf] could not cache ${path}: ${describe(err)}`);
      }
    }

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', buildContentDisposition(route.filename));
    res.setHeader('Cache-Control', `public, max-age=${PDF_MAX_AGE_SECONDS}`);
    res.setHeader('Content-Length', pdf.length);
    res.status(200).end(pdf);
  }

  return withRateLimit(handler, RATE_LIMITS.readonly, `pasantias-${route.document}`);
}
