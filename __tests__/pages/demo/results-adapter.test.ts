// @vitest-environment node
/**
 * B-01 remediation R1 — the REAL demo results adapter path.
 *
 * These cases feed the page's own `transformObjectiveForScoring` /
 * `transformModuleForScoring` / `transformResponses` (the exact functions the
 * demo results page uses) into `calculateDemoScores`, so the adapter cannot
 * silently drop the metadata the shared cobertura-gate policy needs.
 *
 * Both scenarios are the ones Codex reproduced against the real adapter:
 *  A. an INACTIVE first cobertura carrying a stale `false` answer must not
 *     gate an active downstream indicator.
 *  B. shuffled raw input order must be resolved by display order.
 */
import { describe, it, expect } from 'vitest';
import {
  transformResponses,
  transformModuleForScoring,
  transformObjectiveForScoring,
} from '@/pages/demo/assessments/[templateId]/results';
import {
  calculateDemoScores,
  type DemoScoringInput,
} from '@/lib/services/assessment-builder/clientScoringService';
import type { ScoringConfig } from '@/types/assessment-builder';
import type { ResponseData } from '@/components/assessment';

const SCORING_CONFIG: ScoringConfig = {
  level_thresholds: { consolidated: 87.5, advanced: 62.5, developing: 37.5, emerging: 12.5 },
  default_weights: { objective: 1, module: 1, indicator: 1 },
};

/** Shape stored in sessionStorage by the demo form (camelCase, from the demo API). */
const storedModule = (indicators: any[]) => ({
  id: 'm1',
  name: 'Módulo 1',
  weight: 1,
  indicators,
});

function scoreThroughAdapter(
  mods: any[],
  objs: any[],
  responses: Record<string, ResponseData>
) {
  const input: DemoScoringInput = {
    objectives: objs.map(transformObjectiveForScoring as any),
    modules: mods.map(transformModuleForScoring as any),
    responses: transformResponses(responses),
    expectations: [],
    scoringConfig: SCORING_CONFIG,
    transformationYear: 1,
    generationType: 'GT',
    templateName: 'Demo',
    templateArea: 'evaluacion',
  };
  return calculateDemoScores(input);
}

describe('demo results adapter — active-year metadata and display order survive the transform', () => {
  it('A: an inactive first cobertura with a stale No answer does not gate the active frecuencia', () => {
    const mods = [storedModule([
      { id: 'cob', name: 'Cobertura', category: 'cobertura', weight: 1, displayOrder: 1, isActiveThisYear: false },
      { id: 'frec', name: 'Frecuencia', category: 'frecuencia', weight: 1, displayOrder: 2, isActiveThisYear: true, frequencyConfig: { type: 'count', min: 0, max: 100 } },
    ])];

    const result = scoreThroughAdapter(mods, [], {
      cob: { coverageValue: false },
      frec: { frequencyValue: 100 },
    });

    expect(result.moduleScores[0].indicators.map((i) => i.indicatorId)).toEqual(['frec']);
    expect(result.totalScore).toBe(100);
  });

  it('B: raw order [frecuencia, cobertura] with display orders 2 and 1 resolves the gate on cobertura', () => {
    const mods = [storedModule([
      { id: 'frec', name: 'Frecuencia', category: 'frecuencia', weight: 1, displayOrder: 2, isActiveThisYear: true, frequencyConfig: { type: 'count', min: 0, max: 100 } },
      { id: 'cob', name: 'Cobertura', category: 'cobertura', weight: 1, displayOrder: 1, isActiveThisYear: true },
    ])];

    const result = scoreThroughAdapter(mods, [], {
      cob: { coverageValue: false },
      frec: { frequencyValue: 100 },
    });

    expect(result.moduleScores[0].indicators.map((i) => i.indicatorId)).toEqual(['cob']);
    expect(result.totalScore).toBe(0);
  });

  it('the same correction applies through the objective-hierarchy adapter', () => {
    const objs = [{
      id: 'obj1',
      name: 'Objetivo 1',
      weight: 1,
      modules: [storedModule([
        { id: 'cob', name: 'Cobertura', category: 'cobertura', weight: 1, displayOrder: 1, isActiveThisYear: false },
        { id: 'frec', name: 'Frecuencia', category: 'frecuencia', weight: 1, displayOrder: 2, isActiveThisYear: true, frequencyConfig: { type: 'count', min: 0, max: 100 } },
      ])],
    }];

    const result = scoreThroughAdapter([], objs, {
      cob: { coverageValue: false },
      frec: { frequencyValue: 100 },
    });

    expect(result.objectiveScores![0].modules[0].indicators.map((i) => i.indicatorId)).toEqual(['frec']);
    expect(result.totalScore).toBe(100);
  });

  it('a wholly inactive module never reaches the weighted denominator through the adapter', () => {
    const mods = [
      { id: 'm1', name: 'Activo', weight: 1, indicators: [
        { id: 'a1', name: 'Cobertura', category: 'cobertura', weight: 1, displayOrder: 1, isActiveThisYear: true },
      ] },
      { id: 'm2', name: 'Inactivo', weight: 1, indicators: [
        { id: 'b1', name: 'Cobertura', category: 'cobertura', weight: 1, displayOrder: 1, isActiveThisYear: false },
      ] },
    ];

    const result = scoreThroughAdapter(mods, [], {
      a1: { coverageValue: true },
      b1: { coverageValue: false },
    });

    expect(result.moduleScores.map((m) => m.moduleId)).toEqual(['m1']);
    expect(result.totalScore).toBe(100);
  });

  it('stored payloads without displayOrder / isActiveThisYear keep the documented legacy behaviour', () => {
    const mods = [storedModule([
      { id: 'cob', name: 'Cobertura', category: 'cobertura', weight: 1 },
      { id: 'frec', name: 'Frecuencia', category: 'frecuencia', weight: 1, frequencyConfig: { type: 'count', min: 0, max: 100 } },
    ])];

    const result = scoreThroughAdapter(mods, [], {
      cob: { coverageValue: true },
      frec: { frequencyValue: 50 },
    });

    expect(result.moduleScores[0].indicators.map((i) => i.indicatorId)).toEqual(['cob', 'frec']);
    expect(result.totalScore).toBe(75);
  });

  it('the adapter does not mutate the stored payload it is given', () => {
    const mods = [storedModule([
      { id: 'frec', name: 'Frecuencia', category: 'frecuencia', weight: 1, displayOrder: 2, isActiveThisYear: true },
      { id: 'cob', name: 'Cobertura', category: 'cobertura', weight: 1, displayOrder: 1, isActiveThisYear: true },
    ])];
    const responses = { cob: { coverageValue: false }, frec: { frequencyValue: 100 } };
    const snapshot = JSON.stringify({ mods, responses });

    scoreThroughAdapter(mods, [], responses);

    expect(JSON.stringify({ mods, responses })).toBe(snapshot);
  });
});
