/**
 * Contact surface shared by both Pasantías PDFs.
 *
 * The WhatsApp number is Appendix A-11 (owner-confirmed 2026-07-31). It is kept
 * here rather than in a cohort module because it is not cohort data — it does
 * not change when the cohort does.
 */
import { buildAbsoluteUrl } from '../../utils/app-url';

/** Shape `buildAbsoluteUrl` accepts — re-declared so callers need not import it. */
export type PdfRequestLike = { headers?: { host?: string | string[] } } | null | undefined;

export interface PasantiasPdfOptions {
  /** Incoming request, when one exists, so the link matches the deployment. */
  req?: PdfRequestLike;
}

/** Appendix A-11. Rendered with spaces — it is read by a human, not dialled. */
export const PASANTIAS_WHATSAPP = '+56 9 4162 3577';

/** The landing page A6a builds; the CTA of both documents points at it. */
export const PASANTIAS_PAGE_PATH = '/pasantias';

/**
 * The landing-page URL as it is printed in a PDF: resolved through
 * `lib/utils/app-url.ts` (D-09), then stripped of its scheme, because a brochure
 * shows `nuevaeducacion.org/pasantias` and not the `https://` a browser needs.
 */
export function buildPasantiasWebUrl(req?: PdfRequestLike): string {
  return buildAbsoluteUrl(PASANTIAS_PAGE_PATH, req).replace(/^https?:\/\//, '');
}
