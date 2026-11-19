import { describe, it, expect } from 'vitest';
import { isPaid, isOverdue, monthLabel } from '../../../lib/contracts/cuota-status';
import { todayInChile } from '../../../lib/uf-service';

// GES-3.3 / GES-3.12 / GES-3.4: one reader for what counts as paid ("the
// invoice decides", 17 Nov 2026), what is overdue (by the calendar day in
// Chile) and the month titles. All values are invented.

describe('isPaid — the invoice decides', () => {
  it('factura_pagada true with an invoice → paid', () => {
    expect(isPaid({ factura_pagada: true, factura_url: 'cuota_x_1.pdf' })).toBe(true);
  });
  it('the old mark pagada true alone → NOT paid', () => {
    expect(isPaid({ pagada: true, factura_pagada: false, factura_url: 'cuota_x_1.pdf' } as any)).toBe(false);
    expect(isPaid({ pagada: true } as any)).toBe(false);
  });
  it('factura_pagada true without an invoice → not paid', () => {
    expect(isPaid({ factura_pagada: true, factura_url: null })).toBe(false);
    expect(isPaid({ factura_pagada: true, factura_url: '' })).toBe(false);
    expect(isPaid({ factura_pagada: true })).toBe(false);
  });
});

describe('isOverdue — by the calendar day in Chile', () => {
  // 2026-11-20T01:00Z is 22:00 on 19 Nov in Chile (UTC-3 in November).
  const at2200Chile = todayInChile(new Date('2026-11-20T01:00:00Z'));

  it('reads today in Chile at 22:00 as the 19th (the helper the reader is given)', () => {
    expect(at2200Chile).toBe('2026-11-19');
  });
  it('due today, at 22:00 Chile time → not overdue', () => {
    expect(isOverdue({ fecha_vencimiento: '2026-11-19' }, at2200Chile)).toBe(false);
  });
  it('due yesterday, unpaid → overdue', () => {
    expect(isOverdue({ fecha_vencimiento: '2026-11-18' }, at2200Chile)).toBe(true);
  });
  it('due yesterday, paid by its invoice → not overdue', () => {
    expect(
      isOverdue({ fecha_vencimiento: '2026-11-18', factura_pagada: true, factura_url: 'cuota_x_1.pdf' }, at2200Chile),
    ).toBe(false);
  });
  it('due yesterday, marked the old way only → overdue (the old mark is not read)', () => {
    expect(isOverdue({ fecha_vencimiento: '2026-11-18', pagada: true } as any, at2200Chile)).toBe(true);
  });
  it('a due date stored with a time part is compared by its calendar day', () => {
    expect(isOverdue({ fecha_vencimiento: '2026-11-19T00:00:00+00:00' }, '2026-11-19')).toBe(false);
  });
});

describe('monthLabel — built from the parts', () => {
  it('«2026-11» → «noviembre de 2026»', () => {
    expect(monthLabel('2026-11')).toBe('noviembre de 2026');
  });
  it('«2027-01» → «enero de 2027»', () => {
    expect(monthLabel('2027-01')).toBe('enero de 2027');
  });
});
