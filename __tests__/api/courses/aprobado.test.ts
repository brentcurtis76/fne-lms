import { describe, it, expect } from 'vitest';
import {
  getCompletionStatus,
  checkAprobadoEligibility,
} from '../../../lib/utils/aprobadoCheck';

describe('getCompletionStatus', () => {
  it('returns in_progress when lessons are not complete', () => {
    expect(
      getCompletionStatus({
        allLessonsComplete: false,
        totalAssignments: 3,
        passedAssignments: 3,
      })
    ).toBe('in_progress');
  });

  it('returns completado when lessons complete but assignments not met', () => {
    expect(
      getCompletionStatus({
        allLessonsComplete: true,
        totalAssignments: 5,
        passedAssignments: 2,
      })
    ).toBe('completado');
  });

  it('returns aprobado when lessons complete and assignments meet default ratio', () => {
    expect(
      getCompletionStatus({
        allLessonsComplete: true,
        totalAssignments: 5,
        passedAssignments: 3,
      })
    ).toBe('aprobado');
  });

  it('auto-aprobado: 0 assignments and lessons complete', () => {
    expect(
      getCompletionStatus({
        allLessonsComplete: true,
        totalAssignments: 0,
        passedAssignments: 0,
      })
    ).toBe('aprobado');
  });

  it('edge: passed > total still returns aprobado', () => {
    expect(
      getCompletionStatus({
        allLessonsComplete: true,
        totalAssignments: 3,
        passedAssignments: 5,
      })
    ).toBe('aprobado');
  });

  it('edge: passed just below default 0.6 ratio returns completado', () => {
    // 2/4 = 0.5 < 0.6
    expect(
      getCompletionStatus({
        allLessonsComplete: true,
        totalAssignments: 4,
        passedAssignments: 2,
      })
    ).toBe('completado');
  });

  it('respects custom passingRatio', () => {
    // 2/4 = 0.5 >= 0.5
    expect(
      getCompletionStatus({
        allLessonsComplete: true,
        totalAssignments: 4,
        passedAssignments: 2,
        passingRatio: 0.5,
      })
    ).toBe('aprobado');
  });
});

describe('checkAprobadoEligibility', () => {
  it('returns false when lessons are not complete', () => {
    expect(
      checkAprobadoEligibility({
        allLessonsComplete: false,
        totalAssignments: 0,
        passedAssignments: 0,
      })
    ).toBe(false);
  });

  it('returns true for auto-aprobado (0 assignments, lessons done)', () => {
    expect(
      checkAprobadoEligibility({
        allLessonsComplete: true,
        totalAssignments: 0,
        passedAssignments: 0,
      })
    ).toBe(true);
  });

  it('returns false when feedback is missing (passed < threshold)', () => {
    // 1/5 = 0.2 < 0.6
    expect(
      checkAprobadoEligibility({
        allLessonsComplete: true,
        totalAssignments: 5,
        passedAssignments: 1,
      })
    ).toBe(false);
  });

  it('returns true at exactly the threshold boundary', () => {
    // 3/5 = 0.6 >= 0.6
    expect(
      checkAprobadoEligibility({
        allLessonsComplete: true,
        totalAssignments: 5,
        passedAssignments: 3,
      })
    ).toBe(true);
  });

  it('edge: passedAssignments > totalAssignments returns true', () => {
    expect(
      checkAprobadoEligibility({
        allLessonsComplete: true,
        totalAssignments: 3,
        passedAssignments: 5,
      })
    ).toBe(true);
  });

  it('edge: assignmentsWithFeedback < assignmentsTotal returns false', () => {
    // Simulates scenario where feedback count hasn't met the ratio
    // 2/10 = 0.2 < 0.6
    expect(
      checkAprobadoEligibility({
        allLessonsComplete: true,
        totalAssignments: 10,
        passedAssignments: 2,
      })
    ).toBe(false);
  });
});
