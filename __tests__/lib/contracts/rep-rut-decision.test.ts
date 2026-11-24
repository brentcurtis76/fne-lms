import { describe, it, expect } from 'vitest';
import { decideRepRut, freshReadNeeded, isUsableRepRut, type FreshRead, type RepRutContext } from '../../../lib/contracts/rep-rut-decision';

/**
 * F22e: the one decision on the representative's RUT (lib/contracts/rep-rut-decision.ts).
 * Every combination of the form's value and the fresh read, per context. All data invented.
 *
 * Codes: `A:<w>` allowed, with <w> what is written into clientes.rut_representante
 * (`-` = the column is left out, otherwise the key of the value written) and, after `/`,
 * the key of what the form holds afterwards when it changes. `R:<refusal>` refused,
 * nothing written.
 */

const V = {
  real: '12.345.678-5',
  filler: '11.111.111-1',
  empty: '',
  null: null,
  undef: undefined,
  spaces: '   ',
  freshReal: '7.654.321-6',
} as const;
type Key = keyof typeof V;

const FORMS: Key[] = ['real', 'filler', 'empty', 'null', 'undef', 'spaces'];
const FRESH: Array<[string, FreshRead]> = [
  ['not needed', { state: 'not-needed' }],
  ['pending', { state: 'pending' }],
  ['failed', { state: 'failed' }],
  ['real', { state: 'answered', value: V.freshReal }],
  ['filler', { state: 'answered', value: V.filler }],
  ["''", { state: 'answered', value: '' }],
  ['null', { state: 'answered', value: null }],
  ['spaces', { state: 'answered', value: '   ' }],
];

// One line per form value; columns in the order of FRESH.
const TABLE: Record<'new-client' | 'existing-client' | 'promote', Record<Key, string[]>> = {
  'new-client': {
    real:   ['A:real', 'A:real', 'A:real', 'A:real', 'A:real', 'A:real', 'A:real', 'A:real'],
    filler: ['R:filler', 'R:filler', 'R:filler', 'R:filler', 'R:filler', 'R:filler', 'R:filler', 'R:filler'],
    empty:  ['R:missing', 'R:missing', 'R:missing', 'R:missing', 'R:missing', 'R:missing', 'R:missing', 'R:missing'],
    null:   ['R:missing', 'R:missing', 'R:missing', 'R:missing', 'R:missing', 'R:missing', 'R:missing', 'R:missing'],
    undef:  ['R:missing', 'R:missing', 'R:missing', 'R:missing', 'R:missing', 'R:missing', 'R:missing', 'R:missing'],
    spaces: ['R:missing', 'R:missing', 'R:missing', 'R:missing', 'R:missing', 'R:missing', 'R:missing', 'R:missing'],
    freshReal: [],
  },
  // An existing client chosen for a new contract or draft: the form holds the listed value.
  'existing-client': {
    real:   ['A:-', 'A:-', 'R:client-filler', 'A:-', 'R:client-filler', 'A:-', 'A:-', 'A:-'],
    filler: ['R:client-filler', 'R:client-filler', 'R:client-filler', 'A:-', 'R:client-filler', 'A:-', 'A:-', 'A:-'],
    empty:  ['A:-', 'A:-', 'R:client-filler', 'A:-', 'R:client-filler', 'A:-', 'A:-', 'A:-'],
    null:   ['A:-', 'A:-', 'R:client-filler', 'A:-', 'R:client-filler', 'A:-', 'A:-', 'A:-'],
    undef:  ['A:-', 'A:-', 'R:client-filler', 'A:-', 'R:client-filler', 'A:-', 'A:-', 'A:-'],
    spaces: ['A:-', 'A:-', 'R:client-filler', 'A:-', 'R:client-filler', 'A:-', 'A:-', 'A:-'],
    freshReal: [],
  },
  // A draft turned into a contract, its field untouched (the form holds the held value).
  promote: {
    real:   ['A:real', 'A:real', 'R:client-filler', 'A:real', 'R:client-filler', 'A:real', 'A:real', 'A:real'],
    filler: ['R:client-filler', 'R:client-filler', 'R:client-filler', 'A:freshReal/freshReal', 'R:client-filler', 'A:-/empty', 'A:-/empty', 'A:-/empty'],
    empty:  ['A:-', 'A:-', 'R:client-filler', 'A:freshReal/freshReal', 'R:client-filler', 'A:-', 'A:-', 'A:-'],
    null:   ['A:-', 'A:-', 'R:client-filler', 'A:freshReal/freshReal', 'R:client-filler', 'A:-', 'A:-', 'A:-'],
    undef:  ['A:-', 'A:-', 'R:client-filler', 'A:freshReal/freshReal', 'R:client-filler', 'A:-', 'A:-', 'A:-'],
    spaces: ['A:-', 'A:-', 'R:client-filler', 'A:freshReal/freshReal', 'R:client-filler', 'A:-', 'A:-', 'A:-'],
    freshReal: [],
  },
};

const rows = (Object.keys(TABLE) as Array<keyof typeof TABLE>).flatMap(context =>
  FORMS.flatMap(form => FRESH.map(([freshName, fresh], i) => ({ context, form, freshName, fresh, code: TABLE[context][form][i] }))),
);

describe('decideRepRut — every form value × fresh read, per context', () => {
  it('the table is complete', () => {
    expect(rows).toHaveLength(3 * 6 * 8);
    for (const r of rows) expect(r.code).toBeDefined();
  });

  it.each(rows)('$context · form $form · fresh $freshName → $code', ({ context, form, fresh, code }) => {
    const value = V[form];
    const d = decideRepRut({ context: context as RepRutContext, form: value, held: value, fresh });
    const [verdict, rest] = code.split(':');
    if (verdict === 'R') {
      expect(d.allow).toBe(false);
      expect(d.refusal).toBe(rest);
      expect(d.write).toEqual({ kind: 'left-out' });
      return;
    }
    const [written, after] = rest.split('/');
    expect(d.allow).toBe(true);
    expect(d.refusal).toBeUndefined();
    expect(d.write).toEqual(written === '-' ? { kind: 'left-out' } : { kind: 'value', value: V[written as Key] });
    expect(d.formValue).toBe(after ? V[after as Key] : value ?? '');
    // the filler is never written
    if (d.write.kind === 'value') expect(d.write.value).not.toBe(V.filler);
  });
});

describe('decideRepRut — a changed field (the edit rule, for edit and promote)', () => {
  const at = (context: RepRutContext, form: string, held: string | undefined, fresh: FreshRead = { state: 'not-needed' }) =>
    decideRepRut({ context, form, held, fresh });

  it.each(['edit', 'promote'] as RepRutContext[])('%s: the filler typed over a real RUT is refused', context => {
    expect(at(context, V.filler, V.real)).toMatchObject({ allow: false, refusal: 'filler' });
  });
  it.each(['edit', 'promote'] as RepRutContext[])('%s: an invalid RUT typed is refused', context => {
    expect(at(context, '12.345.678-0', V.real)).toMatchObject({ allow: false, refusal: 'invalid' });
  });
  it('edit: an untouched stored filler saves and is written as before', () => {
    expect(at('edit', V.filler, V.filler)).toEqual({ allow: true, write: { kind: 'value', value: V.filler }, formValue: V.filler });
  });
  it('edit: another spelling of the filler over a stored filler saves', () => {
    expect(at('edit', '11111111-1', V.filler)).toMatchObject({ allow: true });
  });
  it('edit: a real RUT typed over the filler is written', () => {
    expect(at('edit', V.real, V.filler)).toEqual({ allow: true, write: { kind: 'value', value: V.real }, formValue: V.real });
  });
  it('edit: an emptied field saves and is written, as before', () => {
    expect(at('edit', '', V.real)).toEqual({ allow: true, write: { kind: 'value', value: '' }, formValue: '' });
  });
  it('promote: a real RUT typed over a held filler, the stored value still the filler: refused', () => {
    expect(at('promote', V.real, V.filler, { state: 'answered', value: V.filler })).toMatchObject({ allow: false, refusal: 'client-filler' });
  });
  it('promote: a real RUT typed wins over the fresh one', () => {
    expect(at('promote', V.real, V.filler, { state: 'answered', value: V.freshReal })).toEqual({
      allow: true, write: { kind: 'value', value: V.real }, formValue: V.real,
    });
  });
  it('promote: an emptied field is not written over the stored value', () => {
    expect(at('promote', '', V.real)).toEqual({ allow: true, write: { kind: 'left-out' }, formValue: '' });
  });
});

describe('freshReadNeeded and isUsableRepRut', () => {
  it.each([
    [V.real, false], [V.filler, true], ['11111111-1', true], ['', false], ['   ', false], [null, false], [undefined, true],
  ])('freshReadNeeded(%j) → %s', (held, needed) => {
    expect(freshReadNeeded(held)).toBe(needed);
  });
  it.each([
    [V.real, true], [V.filler, false], ['', false], ['   ', false], [null, false], [undefined, false],
  ])('isUsableRepRut(%j) → %s', (value, usable) => {
    expect(isUsableRepRut(value)).toBe(usable);
  });
});
