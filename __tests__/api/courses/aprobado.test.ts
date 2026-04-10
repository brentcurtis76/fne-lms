import { describe, it, expect } from 'vitest';
import {
  getCompletionStatus,
  checkAprobadoEligibility,
} from '../../../lib/utils/aprobadoCheck';

describe('getCompletionStatus', () => {
  it('returns in_progress when progress < 100', () => {
    expect(
      getCompletionStatus({
        progressPercentage: 80,
        assignmentsTotal: 3,
        assignmentsSubmitted: 3,
        assignmentsWithFeedback: 3,
      })
    ).toBe('in_progress');
  });

  it('returns completado when progress 100 but assignments not all submitted+feedback', () => {
    expect(
      getCompletionStatus({
        progressPercentage: 100,
        assignmentsTotal: 5,
        assignmentsSubmitted: 2,
        assignmentsWithFeedback: 2,
      })
    ).toBe('completado');
  });

  it('returns aprobado when progress 100 and all submitted+feedback', () => {
    expect(
      getCompletionStatus({
        progressPercentage: 100,
        assignmentsTotal: 5,
        assignmentsSubmitted: 5,
        assignmentsWithFeedback: 5,
      })
    ).toBe('aprobado');
  });

  it('auto-aprobado: 0 assignments and progress 100', () => {
    expect(
      getCompletionStatus({
        progressPercentage: 100,
        assignmentsTotal: 0,
        assignmentsSubmitted: 0,
        assignmentsWithFeedback: 0,
      })
    ).toBe('aprobado');
  });

  it('returns completado when submitted meets total but feedback does not', () => {
    expect(
      getCompletionStatus({
        progressPercentage: 100,
        assignmentsTotal: 5,
        assignmentsSubmitted: 5,
        assignmentsWithFeedback: 3,
      })
    ).toBe('completado');
  });

  it('returns completado when feedback meets total but submitted does not', () => {
    expect(
      getCompletionStatus({
        progressPercentage: 100,
        assignmentsTotal: 5,
        assignmentsSubmitted: 3,
        assignmentsWithFeedback: 5,
      })
    ).toBe('completado');
  });
});

describe('checkAprobadoEligibility', () => {
  it('returns false when progress < 100', () => {
    expect(
      checkAprobadoEligibility({
        progressPercentage: 50,
        assignmentsTotal: 0,
        assignmentsSubmitted: 0,
        assignmentsWithFeedback: 0,
      })
    ).toBe(false);
  });

  it('returns true for auto-aprobado (0 assignments, progress 100)', () => {
    expect(
      checkAprobadoEligibility({
        progressPercentage: 100,
        assignmentsTotal: 0,
        assignmentsSubmitted: 0,
        assignmentsWithFeedback: 0,
      })
    ).toBe(true);
  });

  it('returns false when not all submitted and feedback', () => {
    expect(
      checkAprobadoEligibility({
        progressPercentage: 100,
        assignmentsTotal: 5,
        assignmentsSubmitted: 3,
        assignmentsWithFeedback: 2,
      })
    ).toBe(false);
  });

  it('returns true when all submitted and all have feedback', () => {
    expect(
      checkAprobadoEligibility({
        progressPercentage: 100,
        assignmentsTotal: 5,
        assignmentsSubmitted: 5,
        assignmentsWithFeedback: 5,
      })
    ).toBe(true);
  });
});
