/**
 * Shared, browser/server-safe policy for the cobertura gate.
 *
 * A module's first indicator (by stable display order among its already
 * "effective active" indicators) may be a cobertura indicator. When it is,
 * that single response controls whether the module's downstream indicators
 * apply at all: unanswered or "No" restricts applicability to the cobertura
 * indicator alone; "Sí" (or no gate) makes every active indicator applicable.
 *
 * Callers are responsible for establishing the "effective active" indicator
 * set first (year-aware expectations, or the legacy traspaso/detalle
 * exclusion) — this module only resolves the gate over whatever list it is
 * given, so camelCase and snake_case consumers can share one implementation
 * via small accessor functions.
 *
 * No React, Supabase, DB, environment, or browser-only imports.
 */

export type CoberturaGateState = 'none' | 'unanswered' | 'yes' | 'no';

export interface ResolveCoberturaGateOptions<T> {
  /** Already active-filtered indicators (year-aware or legacy), unsorted. */
  indicators: T[];
  getId: (indicator: T) => string;
  getCategory: (indicator: T) => string;
  getDisplayOrder: (indicator: T) => number | null | undefined;
  /** Look up the cobertura response value for a given indicator id. */
  getCoverageValue: (indicatorId: string) => boolean | null | undefined;
}

export interface CoberturaGateResult<T> {
  /** Active indicators, stable-sorted by display order. */
  orderedActive: T[];
  /** Indicators that apply given the resolved gate state. */
  applicable: T[];
  /** Active indicators excluded by a closed/unanswered gate. */
  gatedOut: T[];
  hasGate: boolean;
  state: CoberturaGateState;
}

export function resolveCoberturaGate<T>(
  opts: ResolveCoberturaGateOptions<T>
): CoberturaGateResult<T> {
  const { indicators, getId, getCategory, getDisplayOrder, getCoverageValue } = opts;

  const entries = indicators.map((item, index) => ({ item, index }));
  entries.sort((a, b) => {
    const ao = getDisplayOrder(a.item);
    const bo = getDisplayOrder(b.item);
    const aValid = typeof ao === 'number' && Number.isFinite(ao);
    const bValid = typeof bo === 'number' && Number.isFinite(bo);
    if (aValid && bValid && ao !== bo) return (ao as number) - (bo as number);
    if (aValid && !bValid) return -1;
    if (!aValid && bValid) return 1;
    return a.index - b.index;
  });

  const orderedActive = entries.map((e) => e.item);

  if (orderedActive.length === 0) {
    return { orderedActive, applicable: [], gatedOut: [], hasGate: false, state: 'none' };
  }

  const gateIndicator = orderedActive[0];
  const hasGate = getCategory(gateIndicator) === 'cobertura';

  if (!hasGate) {
    return { orderedActive, applicable: orderedActive, gatedOut: [], hasGate: false, state: 'none' };
  }

  const raw = getCoverageValue(getId(gateIndicator));
  const value: boolean | undefined = raw === true ? true : raw === false ? false : undefined;

  if (value === true) {
    return { orderedActive, applicable: orderedActive, gatedOut: [], hasGate: true, state: 'yes' };
  }

  const applicable = [gateIndicator];
  const gatedOut = orderedActive.slice(1);

  if (value === false) {
    return { orderedActive, applicable, gatedOut, hasGate: true, state: 'no' };
  }

  return { orderedActive, applicable, gatedOut, hasGate: true, state: 'unanswered' };
}
