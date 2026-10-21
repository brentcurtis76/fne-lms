/**
 * Pasantías INSPIRA Barcelona — COMMERCIAL cohort data (D-01, D-02).
 *
 * SERVER ONLY. The single legitimate importer of this module is the server-side
 * brochure generator (and the brochure route that names its cache version); its
 * numbers are allowed to appear in brochure PDF bytes and nowhere else. Never
 * import this from a page, a component, an API response body, an e-mail
 * template, the ficha or anything that ends up in a client bundle —
 * `scripts/check-price-leak.mjs` fails the build if it does, and the whole point
 * of the public/commercial split is that the failure is mechanical rather than a
 * matter of anyone remembering.
 *
 * Values transcribed from the `commercial` block of the ratified January 2027
 * contract (`docs/plan/pasantias-january-contract.md`, exposure
 * `brochure-only`). Programme fees and per-person totals are in Chilean pesos;
 * Barcelona lodging is quoted in euros. October 2026 euro prices (Appendix A-8)
 * are retired and no longer live here; the leak guard keeps hunting them under
 * its permanent retired-amount rule.
 */
import { COHORT_ID, type ProgramId } from './cohort-public';

/**
 * Marker string that exists for one reason: to be searched for. The leak guard
 * scans the built client bundles for it, so any path that drags this module
 * into the browser becomes a red build instead of a published price list.
 */
export const COMMERCIAL_SENTINEL = '__INSPIRA_COMMERCIAL__';

/** Programme fees and per-person totals are Chilean pesos. */
export const COMMERCIAL_CURRENCY = 'CLP';

/** An inclusive `[min, max]` range in pesos. */
export type ClpRange = readonly [number, number];

export interface ProgramPricing {
  /** Programme fee per person. */
  feeClp: number;
  /** Programme fee per person under {@link DISCOUNT_CONDITION}. */
  discountedFeeClp: number;
  /** Lodging nights from {@link ARRIVAL_DATE} to `returnDate`. */
  nights: number;
  /** Return date (ISO). */
  returnDate: string;
  /** Page 14: per-person totals (fee + flight + lodging nights), rounded. */
  perPersonClp: { standard: ClpRange; discounted: ClpRange };
}

/** `commercial.programs`, both programs. */
export const PROGRAM_PRICING: Readonly<Record<ProgramId, ProgramPricing>> = {
  inspira: {
    feeClp: 2500000,
    discountedFeeClp: 2000000,
    nights: 12,
    returnDate: '2027-01-29',
    perPersonClp: { standard: [4700000, 5000000], discounted: [4200000, 4500000] },
  },
  'mirada-profunda': {
    feeClp: 2500000,
    discountedFeeClp: 2000000,
    nights: 13,
    returnDate: '2027-01-30',
    perPersonClp: { standard: [4700000, 5100000], discounted: [4200000, 4600000] },
  },
};

/** `commercial.discountCondition`, verbatim as the brochure prints it. */
export const DISCOUNT_CONDITION = 'COLEGIOS CON PROGRAMA ANUAL DE ASESORÍA FNE';

/** `commercial.arrivalDate` — both programs arrive the day before they start. */
export const ARRIVAL_DATE = '2027-01-17';

/** `commercial.lodgingEur`. */
export const LODGING_EUR = {
  /** Per person per night, sharing a double room. */
  doublePerPersonPerNight: { min: 50, max: 75 },
  /** Per night, single room, approximate. */
  singlePerNightApprox: 100,
} as const;

/** `commercial.flightClpApprox` — approximate return flight per person. */
export const FLIGHT_CLP_APPROX = 1500000;

/** `commercial.eurClp` — the reference rate the totals use: €1 = $1.100. */
export const EUR_CLP = 1100;

/** `commercial.totalsRoundedToClp` — totals are rounded to the nearest $100.000. */
export const TOTALS_ROUNDED_TO_CLP = 100000;

/** `commercial.teamSizes` — page 15 prices teams of 1 to 10 people. */
export const TEAM_SIZES = { min: 1, max: 10 } as const;

/** `commercial.payment`, verbatim. */
export const PAYMENT_TERMS =
  '50% al reservar y el 50% restante la semana antes del inicio de la pasantía';

/** `commercial.places`, verbatim. */
export const PLACES_TERMS = 'Se confirman por orden de reserva.';

/**
 * es-CL brochure line for lodging. Written out rather than composed: the leak
 * guard's copy check looks for literal fragments of this sentence, and a
 * template built from parts would reach a bundle in pieces. The figures are
 * pinned against {@link LODGING_EUR} by `__tests__/lib/pasantias-cohort.test.ts`.
 */
export const LODGING_NOTE =
  'Alojamiento en Barcelona: entre €50 y €75 por persona por noche, en base a habitación doble — el monto es por persona, no por habitación. Habitación individual: aproximadamente €100 por noche.';

/** How the per-person totals are built (contract §5 observation and `commercial`). */
export const TOTALS_NOTE =
  'Los totales por persona suman el programa, el pasaje aéreo aproximado y las noches de alojamiento en habitación doble, con un tipo de cambio de referencia de €1 = $1.100, redondeados a los $100.000 más cercanos.';

/** Page 15: team rows are the per-person values times the team size. */
export const TEAM_NOTE =
  'Valores por equipo: el valor por persona multiplicado por el número de integrantes.';

/** Validity is expressed by cohort, never by a calendar date. */
export const PRICE_VALIDITY = 'Precios vigentes para la cohorte de enero 2027.';

/** One row of the page-15 team table. */
export interface TeamRow {
  size: number;
  standard: ClpRange;
  discounted: ClpRange;
}

/**
 * The team table for one program: per-person ranges times each team size from
 * {@link TEAM_SIZES}.min to .max. Derived because the brochure defines it that
 * way; the test pins the resulting figures as literals independently.
 */
export function teamRows(program: ProgramId): TeamRow[] {
  const { standard, discounted } = PROGRAM_PRICING[program].perPersonClp;
  const rows: TeamRow[] = [];
  for (let size = TEAM_SIZES.min; size <= TEAM_SIZES.max; size += 1) {
    rows.push({
      size,
      standard: [standard[0] * size, standard[1] * size],
      discounted: [discounted[0] * size, discounted[1] * size],
    });
  }
  return rows;
}

/**
 * Cache key for the generated brochure (D-05). Bump this whenever any value in
 * this module or any brochure copy changes — the `propuestas` bucket is keyed
 * by it, so a stale key serves a stale PDF.
 *
 * `2027-01-v1`: the January 2027 two-program brochure (PASANT-B003). A new key
 * is what keeps every October object (`2026-10-v1` … `2026-10-v5`) from being
 * served for January. The corrected designed brochure is published at
 * `pasantias/brochure-2027-01-v1.pdf` by Brent before the deployment that ships
 * this value (contract §7, release obligation R-08); until then the generated
 * brochure below is the data-faithful fallback.
 */
export const BROCHURE_VERSION = '2027-01-v1';

/** Download filename. ASCII only, so the RFC 5987 header stays simple. */
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
  programs: PROGRAM_PRICING,
  discountCondition: DISCOUNT_CONDITION,
  arrivalDate: ARRIVAL_DATE,
  lodgingEur: LODGING_EUR,
  flightClpApprox: FLIGHT_CLP_APPROX,
  eurClp: EUR_CLP,
  totalsRoundedToClp: TOTALS_ROUNDED_TO_CLP,
  teamSizes: TEAM_SIZES,
  payment: PAYMENT_TERMS,
  places: PLACES_TERMS,
  lodgingNote: LODGING_NOTE,
  totalsNote: TOTALS_NOTE,
  teamNote: TEAM_NOTE,
  validity: PRICE_VALIDITY,
  brochureVersion: BROCHURE_VERSION,
  brochureFilename: BROCHURE_FILENAME,
} as const;
