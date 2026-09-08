import { describe, it, expect } from 'vitest';
import { resolveCoberturaGate } from '@/lib/services/assessment-builder/coberturaGatePolicy';

interface CamelInd {
  id: string;
  category: string;
  displayOrder?: number | null;
}

function camelOpts(indicators: CamelInd[], responses: Record<string, boolean | null | undefined>) {
  return {
    indicators,
    getId: (i: CamelInd) => i.id,
    getCategory: (i: CamelInd) => i.category,
    getDisplayOrder: (i: CamelInd) => i.displayOrder,
    getCoverageValue: (id: string) => responses[id],
  };
}

describe('resolveCoberturaGate — no gate', () => {
  it('non-cobertura first indicator: no gate, all active indicators applicable', () => {
    const inds: CamelInd[] = [
      { id: 'i1', category: 'profundidad', displayOrder: 1 },
      { id: 'i2', category: 'frecuencia', displayOrder: 2 },
    ];
    const result = resolveCoberturaGate(camelOpts(inds, {}));
    expect(result.hasGate).toBe(false);
    expect(result.state).toBe('none');
    expect(result.applicable.map((i) => i.id)).toEqual(['i1', 'i2']);
    expect(result.gatedOut).toEqual([]);
  });

  it('empty indicator list: no gate, nothing applicable', () => {
    const result = resolveCoberturaGate(camelOpts([], {}));
    expect(result.hasGate).toBe(false);
    expect(result.state).toBe('none');
    expect(result.orderedActive).toEqual([]);
    expect(result.applicable).toEqual([]);
  });
});

describe('resolveCoberturaGate — gate states', () => {
  const inds: CamelInd[] = [
    { id: 'cob', category: 'cobertura', displayOrder: 1 },
    { id: 'frec', category: 'frecuencia', displayOrder: 2 },
    { id: 'prof', category: 'profundidad', displayOrder: 3 },
  ];

  it('unanswered cobertura: only cobertura applicable, rest gated out', () => {
    const result = resolveCoberturaGate(camelOpts(inds, {}));
    expect(result.hasGate).toBe(true);
    expect(result.state).toBe('unanswered');
    expect(result.applicable.map((i) => i.id)).toEqual(['cob']);
    expect(result.gatedOut.map((i) => i.id)).toEqual(['frec', 'prof']);
  });

  it('cobertura Sí: all active indicators applicable', () => {
    const result = resolveCoberturaGate(camelOpts(inds, { cob: true }));
    expect(result.state).toBe('yes');
    expect(result.applicable.map((i) => i.id)).toEqual(['cob', 'frec', 'prof']);
    expect(result.gatedOut).toEqual([]);
  });

  it('cobertura No: only cobertura applicable, downstream gated out', () => {
    const result = resolveCoberturaGate(camelOpts(inds, { cob: false }));
    expect(result.state).toBe('no');
    expect(result.applicable.map((i) => i.id)).toEqual(['cob']);
    expect(result.gatedOut.map((i) => i.id)).toEqual(['frec', 'prof']);
  });

  it('Sí → downstream answered → then changed to No: downstream still gated out (stale answers ignored)', () => {
    // Simulates stale saved answers for frec/prof — the gate only inspects the
    // cobertura response; presence of other saved values must not affect it.
    const result = resolveCoberturaGate(camelOpts(inds, { cob: false, frec: true as unknown as boolean }));
    expect(result.state).toBe('no');
    expect(result.applicable.map((i) => i.id)).toEqual(['cob']);
    expect(result.gatedOut.map((i) => i.id)).toEqual(['frec', 'prof']);
  });

  it('missing/null cobertura value fails closed as unanswered', () => {
    const result = resolveCoberturaGate(camelOpts(inds, { cob: null }));
    expect(result.state).toBe('unanswered');
    expect(result.applicable.map((i) => i.id)).toEqual(['cob']);
  });

  it('malformed (non-boolean) cobertura value fails closed as unanswered', () => {
    const result = resolveCoberturaGate(camelOpts(inds, { cob: 'yes' as unknown as boolean }));
    expect(result.state).toBe('unanswered');
    expect(result.applicable.map((i) => i.id)).toEqual(['cob']);
  });
});

describe('resolveCoberturaGate — ordering', () => {
  it('shuffled input is sorted by displayOrder before gate detection', () => {
    const inds: CamelInd[] = [
      { id: 'prof', category: 'profundidad', displayOrder: 3 },
      { id: 'cob', category: 'cobertura', displayOrder: 1 },
      { id: 'frec', category: 'frecuencia', displayOrder: 2 },
    ];
    const result = resolveCoberturaGate(camelOpts(inds, { cob: true }));
    expect(result.orderedActive.map((i) => i.id)).toEqual(['cob', 'frec', 'prof']);
    expect(result.hasGate).toBe(true);
  });

  it('equal displayOrder falls back to original index (stable)', () => {
    const inds: CamelInd[] = [
      { id: 'a', category: 'cobertura', displayOrder: 1 },
      { id: 'b', category: 'frecuencia', displayOrder: 1 },
      { id: 'c', category: 'profundidad', displayOrder: 1 },
    ];
    const result = resolveCoberturaGate(camelOpts(inds, { a: true }));
    expect(result.orderedActive.map((i) => i.id)).toEqual(['a', 'b', 'c']);
  });

  it('missing displayOrder falls back to original index and sorts after numbered items', () => {
    const inds: CamelInd[] = [
      { id: 'no-order-1', category: 'profundidad', displayOrder: undefined },
      { id: 'cob', category: 'cobertura', displayOrder: 1 },
      { id: 'no-order-2', category: 'frecuencia', displayOrder: null },
    ];
    const result = resolveCoberturaGate(camelOpts(inds, { cob: true }));
    // Numbered indicator (displayOrder=1) sorts first; unordered ones keep their
    // relative original order and sort after.
    expect(result.orderedActive.map((i) => i.id)).toEqual(['cob', 'no-order-1', 'no-order-2']);
    expect(result.hasGate).toBe(true);
  });

  it('all indicators missing displayOrder: preserves original array order', () => {
    const inds: CamelInd[] = [
      { id: 'cob', category: 'cobertura' },
      { id: 'frec', category: 'frecuencia' },
      { id: 'prof', category: 'profundidad' },
    ];
    const result = resolveCoberturaGate(camelOpts(inds, { cob: false }));
    expect(result.orderedActive.map((i) => i.id)).toEqual(['cob', 'frec', 'prof']);
    expect(result.applicable.map((i) => i.id)).toEqual(['cob']);
  });
});

describe('resolveCoberturaGate — caller-side active filtering (year-inactive / legacy exclusions)', () => {
  it('a nominally-first indicator excluded by the caller (year-inactive) lets a later cobertura become the gate', () => {
    // Caller is responsible for excluding inactive indicators before calling the
    // policy (step 1). Here the caller already dropped an inactive profundidad
    // indicator that would otherwise have been first.
    const inds: CamelInd[] = [
      { id: 'cob', category: 'cobertura', displayOrder: 2 },
      { id: 'frec', category: 'frecuencia', displayOrder: 3 },
    ];
    const result = resolveCoberturaGate(camelOpts(inds, {}));
    expect(result.hasGate).toBe(true);
    expect(result.orderedActive.map((i) => i.id)).toEqual(['cob', 'frec']);
  });

  it('inactive downstream indicators excluded by the caller never appear in gatedOut or applicable', () => {
    const inds: CamelInd[] = [
      { id: 'cob', category: 'cobertura', displayOrder: 1 },
      { id: 'frec', category: 'frecuencia', displayOrder: 2 },
      // A third, year-inactive indicator was already excluded by the caller.
    ];
    const result = resolveCoberturaGate(camelOpts(inds, { cob: false }));
    expect(result.gatedOut.map((i) => i.id)).toEqual(['frec']);
    expect(result.orderedActive).toHaveLength(2);
  });

  it('legacy snapshot (no displayOrder, traspaso/detalle already excluded by caller): gate still resolves', () => {
    const inds: CamelInd[] = [
      { id: 'cob', category: 'cobertura' },
      { id: 'frec', category: 'frecuencia' },
    ];
    const result = resolveCoberturaGate(camelOpts(inds, { cob: true }));
    expect(result.hasGate).toBe(true);
    expect(result.state).toBe('yes');
    expect(result.applicable.map((i) => i.id)).toEqual(['cob', 'frec']);
  });
});

describe('resolveCoberturaGate — snake_case accessor shape (server consumers)', () => {
  interface SnakeInd {
    id: string;
    category: string;
    display_order?: number | null;
  }

  it('works identically via snake_case accessors', () => {
    const inds: SnakeInd[] = [
      { id: 'frec', category: 'frecuencia', display_order: 2 },
      { id: 'cob', category: 'cobertura', display_order: 1 },
    ];
    const responses: Record<string, boolean | null> = { cob: false };
    const result = resolveCoberturaGate({
      indicators: inds,
      getId: (i) => i.id,
      getCategory: (i) => i.category,
      getDisplayOrder: (i) => i.display_order,
      getCoverageValue: (id) => responses[id],
    });
    expect(result.orderedActive.map((i) => i.id)).toEqual(['cob', 'frec']);
    expect(result.state).toBe('no');
    expect(result.applicable.map((i) => i.id)).toEqual(['cob']);
  });
});
