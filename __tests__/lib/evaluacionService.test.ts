// @vitest-environment node

/**
 * Unit tests for lib/evaluacionService.ts
 * Tests pure calculation functions with PRD example data and edge cases.
 * No database connections required — pure functions only.
 */

import { describe, it, expect } from 'vitest';
import {
  calculateEconomicScores,
  calculateWeightedScores,
  rankATEs,
} from '../../lib/evaluacionService';

// -------------------------------------------------------
// calculateEconomicScores
// -------------------------------------------------------

describe('calculateEconomicScores', () => {
  it('PRD example: ATE B (20M) gets 75 when ATE A is lowest (15M)', () => {
    const result = calculateEconomicScores([
      { id: 'ate-a', monto_propuesto: 15_000_000 },
      { id: 'ate-b', monto_propuesto: 20_000_000 },
      { id: 'ate-c', monto_propuesto: 18_000_000 },
    ]);
    const ateB = result.find(r => r.id === 'ate-b');
    expect(ateB?.puntaje_economico).toBe(75);
  });

  it('PRD example: ATE A (cheapest at 15M) gets 100', () => {
    const result = calculateEconomicScores([
      { id: 'ate-a', monto_propuesto: 15_000_000 },
      { id: 'ate-b', monto_propuesto: 20_000_000 },
      { id: 'ate-c', monto_propuesto: 18_000_000 },
    ]);
    const ateA = result.find(r => r.id === 'ate-a');
    expect(ateA?.puntaje_economico).toBe(100);
  });

  it('PRD example: ATE C (18M) gets 83.3', () => {
    const result = calculateEconomicScores([
      { id: 'ate-a', monto_propuesto: 15_000_000 },
      { id: 'ate-b', monto_propuesto: 20_000_000 },
      { id: 'ate-c', monto_propuesto: 18_000_000 },
    ]);
    const ateC = result.find(r => r.id === 'ate-c');
    expect(ateC?.puntaje_economico).toBe(83.3);
  });

  it('edge case: single ATE always gets 100', () => {
    const result = calculateEconomicScores([
      { id: 'ate-solo', monto_propuesto: 50_000_000 },
    ]);
    expect(result).toHaveLength(1);
    expect(result[0].puntaje_economico).toBe(100);
  });

  it('edge case: all ATEs same price → all get 100', () => {
    const result = calculateEconomicScores([
      { id: 'ate-1', monto_propuesto: 10_000_000 },
      { id: 'ate-2', monto_propuesto: 10_000_000 },
      { id: 'ate-3', monto_propuesto: 10_000_000 },
    ]);
    for (const r of result) {
      expect(r.puntaje_economico).toBe(100);
    }
  });

  it('throws if any ATE has monto_propuesto <= 0', () => {
    expect(() =>
      calculateEconomicScores([
        { id: 'ate-1', monto_propuesto: 10_000_000 },
        { id: 'ate-2', monto_propuesto: 0 },
      ])
    ).toThrow();
  });

  it('returns empty array for empty input', () => {
    expect(calculateEconomicScores([])).toEqual([]);
  });
});

// -------------------------------------------------------
// calculateWeightedScores
// -------------------------------------------------------

describe('calculateWeightedScores', () => {
  it('PRD example: ATE A (tech=85, econ=100, 70/30) → total 89.5', () => {
    const result = calculateWeightedScores(85, 100, 70, 30);
    expect(result.puntaje_tecnico_ponderado).toBe(59.5); // 85 * 0.70
    expect(result.puntaje_economico_ponderado).toBe(30);  // 100 * 0.30
    expect(result.puntaje_total).toBe(89.5);
  });

  it('PRD example: ATE B (tech=96, econ=75, 70/30) → total 89.7', () => {
    const result = calculateWeightedScores(96, 75, 70, 30);
    expect(result.puntaje_tecnico_ponderado).toBe(67.2); // 96 * 0.70
    expect(result.puntaje_economico_ponderado).toBe(22.5); // 75 * 0.30
    expect(result.puntaje_total).toBe(89.7);
  });

  it('PRD example: ATE C (tech=78, econ=83.3, 70/30) → total ~79.6', () => {
    const result = calculateWeightedScores(78, 83.3, 70, 30);
    // 78 * 0.70 = 54.6, 83.3 * 0.30 = 25.0 (rounded), total ~79.6
    expect(result.puntaje_total).toBe(79.6);
  });

  it('edge case: 50/50 split', () => {
    const result = calculateWeightedScores(80, 60, 50, 50);
    expect(result.puntaje_tecnico_ponderado).toBe(40);
    expect(result.puntaje_economico_ponderado).toBe(30);
    expect(result.puntaje_total).toBe(70);
  });

  it('rounds all outputs to 1 decimal place', () => {
    const result = calculateWeightedScores(99, 99, 70, 30);
    const decimals = (n: number) => (n.toString().split('.')[1] || '').length;
    expect(decimals(result.puntaje_total)).toBeLessThanOrEqual(1);
  });
});

// -------------------------------------------------------
// rankATEs
// -------------------------------------------------------

describe('rankATEs', () => {
  it('PRD example: ATE B (89.7) ranks 1st, ATE A (89.5) ranks 2nd', () => {
    const result = rankATEs([
      { id: 'ate-a', puntaje_total: 89.5 },
      { id: 'ate-b', puntaje_total: 89.7 },
      { id: 'ate-c', puntaje_total: 79.6 },
    ]);
    const ateB = result.find(r => r.id === 'ate-b');
    const ateA = result.find(r => r.id === 'ate-a');
    const ateC = result.find(r => r.id === 'ate-c');
    expect(ateB?.rank).toBe(1);
    expect(ateB?.es_ganador).toBe(true);
    expect(ateA?.rank).toBe(2);
    expect(ateA?.es_ganador).toBe(false);
    expect(ateC?.rank).toBe(3);
    expect(ateC?.es_ganador).toBe(false);
  });

  it('edge case: tie at rank 1 — both get rank 1 and es_ganador = true', () => {
    const result = rankATEs([
      { id: 'ate-1', puntaje_total: 90 },
      { id: 'ate-2', puntaje_total: 90 },
      { id: 'ate-3', puntaje_total: 80 },
    ]);
    const ate1 = result.find(r => r.id === 'ate-1');
    const ate2 = result.find(r => r.id === 'ate-2');
    expect(ate1?.rank).toBe(1);
    expect(ate2?.rank).toBe(1);
    expect(ate1?.es_ganador).toBe(true);
    expect(ate2?.es_ganador).toBe(true);
  });

  it('returns empty array for empty input', () => {
    expect(rankATEs([])).toEqual([]);
  });

  it('single ATE gets rank 1 and es_ganador = true', () => {
    const result = rankATEs([{ id: 'ate-solo', puntaje_total: 75 }]);
    expect(result[0].rank).toBe(1);
    expect(result[0].es_ganador).toBe(true);
  });

  it('returns correct number of items', () => {
    const input = [
      { id: 'a', puntaje_total: 80 },
      { id: 'b', puntaje_total: 70 },
      { id: 'c', puntaje_total: 90 },
    ];
    expect(rankATEs(input)).toHaveLength(3);
  });
});
