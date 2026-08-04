/**
 * Pasantías INSPIRA Barcelona — COMMERCIAL cohort data (D-01, D-02).
 *
 * SERVER ONLY. The single legitimate importer of this module is the server-side
 * brochure generator (phase A3); its numbers are allowed to appear in brochure
 * PDF bytes and nowhere else. Never import this from a page, a component, an
 * API response body, an e-mail template or anything that ends up in a client
 * bundle — `scripts/check-price-leak.mjs` fails the build if it does, and the
 * whole point of the public/commercial split is that the failure is mechanical
 * rather than a matter of anyone remembering.
 *
 * Values transcribed from PLAN.md Appendix A-8.
 */
import { COHORT_ID, COHORT_LABEL } from './cohort-public';

/**
 * Marker string that exists for one reason: to be searched for. The leak guard
 * scans the built client bundles for it, so any path that drags this module
 * into the browser becomes a red build instead of a published price list.
 */
export const COMMERCIAL_SENTINEL = '__INSPIRA_COMMERCIAL__';

/** Every amount in this module is in euros. */
export const COMMERCIAL_CURRENCY = 'EUR';

export interface CohortPriceItem {
  /** Stable key; not user-facing. */
  id: string;
  /** es-CL label as it reads in the brochure. */
  label: string;
  /** Amount in {@link COMMERCIAL_CURRENCY}, as a whole number of euros. */
  amount: number;
  /** True when the item is not part of the base programme. */
  optional?: boolean;
}

/**
 * Appendix A-8 — the programme fee. It is the only fixed amount of the base
 * investment: lodging is quoted as a per-night range (see below), so there is
 * no second item to add and deliberately no combined total anywhere.
 *
 * Repriced by the owner on 2026-08-02 together with the canonical designed
 * brochure: €1.000 → €2.500 por persona. The old figure is not merely stale —
 * it is a price the programme is no longer sold at, so `check-price-leak.mjs`
 * hunts for it as a retired amount alongside the live one.
 */
export const COHORT_PRICE_ITEMS: readonly CohortPriceItem[] = [
  { id: 'programa', label: 'Programa', amount: 2500 },
] as const;

/**
 * Appendix A-8, amended by the owner on 2026-07-31: Barcelona lodging is not a
 * package any more but a range that depends on the type of accommodation the
 * participant chooses, so the brochure quotes a per-person-per-night band and
 * lets the reader do the arithmetic for their own stay. No night count is
 * quoted (A-16), which is the other reason a "total" cannot be computed here.
 */
export const COHORT_LODGING_PER_NIGHT_EUR = { min: 70, max: 120 } as const;

/**
 * es-CL brochure line for the lodging band. Derived so copy and data cannot
 * drift. The base-doble clause is the owner's 2026-08-02 precision (A-7/A-8):
 * the band is the rate one person pays sharing a double room, not the room's
 * price, which is the reading a bare "por persona por noche" invites.
 */
export const COHORT_LODGING_NOTE = `Alojamiento en Barcelona: entre €${COHORT_LODGING_PER_NIGHT_EUR.min} y €${COHORT_LODGING_PER_NIGHT_EUR.max} por persona por noche, en base a habitación doble — el monto es por persona, no por habitación — según el tipo de alojamiento.`;

/** Appendix A-8 — the cohort does not run below this many participants. */
export const COHORT_MIN_PARTICIPANTS = 5;

/** Appendix A-8 — share of the total paid when the agreement is signed. */
export const COHORT_DEPOSIT_PERCENT = 50;

/** Appendix A-8 — days before the start by which the balance must be paid. */
export const COHORT_BALANCE_DUE_DAYS_BEFORE = 30;

/** es-CL payment terms line for the brochure. */
export const COHORT_PAYMENT_TERMS = `${COHORT_DEPOSIT_PERCENT}% al momento del acuerdo y el saldo ${COHORT_BALANCE_DUE_DAYS_BEFORE} días antes del inicio.`;

/**
 * Appendix A-8 — validity is expressed by cohort, not by a calendar date. A
 * fixed "válido hasta …" is how the previous brochure ended up looking expired
 * while it was still the current offer.
 */
export const COHORT_PRICE_VALIDITY = `Precios vigentes para la cohorte ${COHORT_LABEL}.`;

/**
 * Cache key for the generated brochure (D-05). Bump this whenever any value in
 * this module or any brochure copy changes — the `propuestas` bucket is keyed
 * by it, so a stale key serves a stale PDF.
 *
 * v3: the 2026-08-02 repricing (€2.500) and the replaced includes/excludes.
 * Both are brochure copy, so leaving the key at v2 is exactly the case this
 * comment exists for — A4 would keep serving a cached €1.000 brochure.
 *
 * v4: the Appendix A-6 expert titles finally propagated into `cohort-public.ts`
 * (2026-08-04). The brochure prints all eight roles, so a cached v3 PDF would
 * keep handing readers four people titled "Experto invitado".
 */
export const BROCHURE_VERSION = '2026-10-v4';

/** Download filename. ASCII only, so the RFC 5987 header in A4 stays simple. */
export const BROCHURE_FILENAME = `Pasantias-INSPIRA-Barcelona-${COHORT_ID}-${BROCHURE_VERSION}.pdf`;

/**
 * Everything the brochure generator needs, in one object — and the shape every
 * consumer should import, because it carries {@link COMMERCIAL_SENTINEL} with
 * it. A consumer that reaches past this and imports a single price constant can
 * still be tree-shaken free of the sentinel, which is exactly why the leak guard
 * also scans for the amounts themselves rather than trusting the marker alone.
 */
export const COHORT_COMMERCIAL = {
  sentinel: COMMERCIAL_SENTINEL,
  currency: COMMERCIAL_CURRENCY,
  items: COHORT_PRICE_ITEMS,
  lodgingPerNightEur: COHORT_LODGING_PER_NIGHT_EUR,
  lodgingNote: COHORT_LODGING_NOTE,
  minParticipants: COHORT_MIN_PARTICIPANTS,
  depositPercent: COHORT_DEPOSIT_PERCENT,
  balanceDueDaysBefore: COHORT_BALANCE_DUE_DAYS_BEFORE,
  paymentTerms: COHORT_PAYMENT_TERMS,
  validity: COHORT_PRICE_VALIDITY,
  brochureVersion: BROCHURE_VERSION,
  brochureFilename: BROCHURE_FILENAME,
} as const;
