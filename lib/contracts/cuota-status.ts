/**
 * GES-3.3 / GES-3.12 / GES-3.4: the one reader of a cuota's state for the
 * cash flow and the contract's details window. Pure: no clock, no network.
 *
 * - Paid: "the invoice decides" (Brent, 17 Nov 2026). A cuota counts as paid
 *   only when its invoice is marked paid (`factura_pagada`) AND it has an
 *   invoice (`factura_url`). The older mark `pagada` is not read.
 * - Overdue: its due date, as a calendar date, is before today's date in
 *   Chile (give `todayInChile(new Date())` from lib/uf-service), and it is
 *   not paid.
 * - Month titles: built from the year and month parts, never from
 *   `new Date('YYYY-MM-01')` (UTC midnight, the day before in Chile).
 */

export interface CuotaPaymentFields {
  fecha_vencimiento?: string | null;
  factura_url?: string | null;
  factura_pagada?: boolean | null;
}

/** Paid only when the invoice is marked paid and the cuota has an invoice. */
export function isPaid(cuota: CuotaPaymentFields): boolean {
  return cuota.factura_pagada === true && typeof cuota.factura_url === 'string' && cuota.factura_url !== '';
}

/** The due date's calendar day ('YYYY-MM-DD'), whatever time part is stored. */
function dueDay(cuota: CuotaPaymentFields): string {
  return (cuota.fecha_vencimiento ?? '').slice(0, 10);
}

/** The due date is before `today` (a 'YYYY-MM-DD' calendar day in Chile). */
export function isPastDue(cuota: CuotaPaymentFields, today: string): boolean {
  const due = dueDay(cuota);
  return due !== '' && due < today;
}

/** Past its due date (by the day in Chile) and not paid. */
export function isOverdue(cuota: CuotaPaymentFields, today: string): boolean {
  return isPastDue(cuota, today) && !isPaid(cuota);
}

/** 'YYYY-MM' → «noviembre de 2026», from the parts. */
export function monthLabel(month: string): string {
  const [y, m] = month.split('-').map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString('es-CL', { year: 'numeric', month: 'long' });
}
