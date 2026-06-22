// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { fmtAmount, currencyKeyboard } from '../../../lib/bots/messages';

describe('fmtAmount', () => {
  it('formats GBP with the £ symbol and en-GB number conventions', () => {
    const out = fmtAmount(1234.5, 'GBP');
    expect(out).toContain('£');
    // en-GB: comma thousands separator, dot decimal, two fraction digits
    expect(out).toMatch(/£1,234\.50/);
  });

  it('leaves USD, EUR and CLP formatting unchanged', () => {
    expect(fmtAmount(45.5, 'USD')).toContain('US$');
    expect(fmtAmount(45.5, 'EUR')).toContain('€');
    expect(fmtAmount(12990, 'CLP')).toContain('$');
  });
});

describe('currencyKeyboard', () => {
  it('offers a GBP (£) button alongside CLP, USD and EUR', () => {
    const buttons = currencyKeyboard('11111111-1111-4111-8111-111111111111').flat();
    const labels = buttons.map((b) => b.label);
    expect(labels).toEqual(expect.arrayContaining(['CLP', 'US$', '€', '£']));

    const gbp = buttons.find((b) => b.label === '£');
    expect(gbp).toBeDefined();
    expect(gbp?.data).toMatch(/^cu:.*:GBP$/);
  });
});
