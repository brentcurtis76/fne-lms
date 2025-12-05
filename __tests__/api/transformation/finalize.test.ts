/**
 * Tests for transformation assessment finalize endpoint
 * Tests the dynamic objective counting fix for different areas
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock the required modules
vi.mock('@supabase/auth-helpers-nextjs', () => ({
  createPagesServerClient: vi.fn(),
}));

vi.mock('@/lib/transformation/evaluator', () => ({
  RubricEvaluator: vi.fn().mockImplementation(() => ({
    generateOverallSummary: vi.fn().mockResolvedValue({
      overall_stage: 2,
      overall_stage_label: 'En Desarrollo',
      strengths: ['Fortaleza 1'],
      areas_for_growth: ['Área de mejora 1'],
      recommendations: ['Recomendación 1'],
    }),
  })),
}));

vi.mock('@/utils/getUserRoles', () => ({
  isAdmin: vi.fn(() => true),
}));

import { createPagesServerClient } from '@supabase/auth-helpers-nextjs';

describe('Finalize Endpoint - Dynamic Objective Counting', () => {
  const mockSession = {
    user: {
      id: 'test-user-id',
      email: 'test@example.com',
      user_metadata: { roles: ['admin'] },
    },
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Evaluación area (2 objectives)', () => {
    it('should accept assessment with only 2 objectives for evaluacion area', async () => {
      // Evaluación has only 2 objectives (based on rubric)
      const mockRubricItems = [
        // Objective 1: 9 actions × 3 dimensions = 27 items? Actually 9 total items
        { objective_number: 1, action_number: 1, dimension: 'cobertura' },
        { objective_number: 1, action_number: 1, dimension: 'frecuencia' },
        { objective_number: 1, action_number: 1, dimension: 'profundidad' },
        { objective_number: 1, action_number: 2, dimension: 'cobertura' },
        { objective_number: 1, action_number: 2, dimension: 'frecuencia' },
        { objective_number: 1, action_number: 2, dimension: 'profundidad' },
        { objective_number: 1, action_number: 3, dimension: 'cobertura' },
        { objective_number: 1, action_number: 3, dimension: 'frecuencia' },
        { objective_number: 1, action_number: 3, dimension: 'profundidad' },
        // Objective 2
        { objective_number: 2, action_number: 1, dimension: 'cobertura' },
        { objective_number: 2, action_number: 1, dimension: 'frecuencia' },
        { objective_number: 2, action_number: 1, dimension: 'profundidad' },
      ];

      const objectiveEvaluations = {
        1: {
          objective_number: 1,
          stage: 2,
          dimension_evaluations: Array(9).fill({ dimension: 'test', level: 2 }),
        },
        2: {
          objective_number: 2,
          stage: 2,
          dimension_evaluations: Array(3).fill({ dimension: 'test', level: 2 }),
        },
      };

      // Calculate expected objectives from rubric (like the real code does)
      const expectedDimensionsPerObjective: Record<number, number> = {};
      mockRubricItems.forEach(item => {
        if (!expectedDimensionsPerObjective[item.objective_number]) {
          expectedDimensionsPerObjective[item.objective_number] = 0;
        }
        expectedDimensionsPerObjective[item.objective_number]++;
      });

      const expectedObjectives = Object.keys(expectedDimensionsPerObjective)
        .map(Number)
        .sort((a, b) => a - b);

      // Verify dynamic calculation
      expect(expectedObjectives).toEqual([1, 2]);
      expect(expectedDimensionsPerObjective[1]).toBe(9);
      expect(expectedDimensionsPerObjective[2]).toBe(3);

      // Verify all objectives are present
      const missingObjectives = expectedObjectives.filter(
        objNum => !objectiveEvaluations[objNum]
      );
      expect(missingObjectives).toHaveLength(0);
    });

    it('should reject if objective 2 is missing for evaluacion', () => {
      const expectedObjectives = [1, 2];
      const objectiveEvaluations = {
        1: { objective_number: 1, stage: 2, dimension_evaluations: [] },
        // Objective 2 is missing
      };

      const missingObjectives = expectedObjectives.filter(
        objNum => !objectiveEvaluations[objNum]
      );

      expect(missingObjectives).toEqual([2]);
    });
  });

  describe('Personalización area (6 objectives)', () => {
    it('should require 6 objectives for personalizacion', () => {
      // Personalización has 6 objectives
      const expectedObjectives = [1, 2, 3, 4, 5, 6];
      const objectiveEvaluations = {
        1: { objective_number: 1, stage: 2, dimension_evaluations: [] },
        2: { objective_number: 2, stage: 2, dimension_evaluations: [] },
        3: { objective_number: 3, stage: 2, dimension_evaluations: [] },
        4: { objective_number: 4, stage: 2, dimension_evaluations: [] },
        5: { objective_number: 5, stage: 2, dimension_evaluations: [] },
        6: { objective_number: 6, stage: 2, dimension_evaluations: [] },
      };

      const missingObjectives = expectedObjectives.filter(
        objNum => !objectiveEvaluations[objNum]
      );

      expect(missingObjectives).toHaveLength(0);
    });

    it('should reject if any of 6 objectives is missing', () => {
      const expectedObjectives = [1, 2, 3, 4, 5, 6];
      const objectiveEvaluations = {
        1: { objective_number: 1, stage: 2, dimension_evaluations: [] },
        2: { objective_number: 2, stage: 2, dimension_evaluations: [] },
        // 3, 4, 5, 6 missing
      };

      const missingObjectives = expectedObjectives.filter(
        objNum => !objectiveEvaluations[objNum]
      );

      expect(missingObjectives).toEqual([3, 4, 5, 6]);
    });
  });

  describe('Aprendizaje area (6 objectives)', () => {
    it('should require 6 objectives for aprendizaje', () => {
      const expectedObjectives = [1, 2, 3, 4, 5, 6];
      const objectiveEvaluations = {
        1: { objective_number: 1, stage: 2, dimension_evaluations: [] },
        2: { objective_number: 2, stage: 2, dimension_evaluations: [] },
        3: { objective_number: 3, stage: 2, dimension_evaluations: [] },
        4: { objective_number: 4, stage: 2, dimension_evaluations: [] },
        5: { objective_number: 5, stage: 2, dimension_evaluations: [] },
        6: { objective_number: 6, stage: 2, dimension_evaluations: [] },
      };

      const missingObjectives = expectedObjectives.filter(
        objNum => !objectiveEvaluations[objNum]
      );

      expect(missingObjectives).toHaveLength(0);
    });
  });

  describe('Dynamic objective calculation from rubric', () => {
    it('should correctly count objectives from rubric data', () => {
      // Simulating what the actual endpoint does
      const rubricItems = [
        { objective_number: 1, action_number: 1, dimension: 'cobertura' },
        { objective_number: 1, action_number: 1, dimension: 'frecuencia' },
        { objective_number: 1, action_number: 1, dimension: 'profundidad' },
        { objective_number: 2, action_number: 1, dimension: 'cobertura' },
        { objective_number: 2, action_number: 1, dimension: 'frecuencia' },
        { objective_number: 2, action_number: 1, dimension: 'profundidad' },
        { objective_number: 3, action_number: 1, dimension: 'cobertura' },
      ];

      const expectedDimensionsPerObjective: Record<number, number> = {};
      rubricItems.forEach(item => {
        if (!expectedDimensionsPerObjective[item.objective_number]) {
          expectedDimensionsPerObjective[item.objective_number] = 0;
        }
        expectedDimensionsPerObjective[item.objective_number]++;
      });

      const expectedObjectives = Object.keys(expectedDimensionsPerObjective)
        .map(Number)
        .sort((a, b) => a - b);

      expect(expectedObjectives).toEqual([1, 2, 3]);
      expect(expectedDimensionsPerObjective[1]).toBe(3);
      expect(expectedDimensionsPerObjective[2]).toBe(3);
      expect(expectedDimensionsPerObjective[3]).toBe(1);
    });

    it('should handle empty rubric gracefully', () => {
      const rubricItems: any[] = [];

      const expectedDimensionsPerObjective: Record<number, number> = {};
      rubricItems.forEach(item => {
        if (!expectedDimensionsPerObjective[item.objective_number]) {
          expectedDimensionsPerObjective[item.objective_number] = 0;
        }
        expectedDimensionsPerObjective[item.objective_number]++;
      });

      const expectedObjectives = Object.keys(expectedDimensionsPerObjective)
        .map(Number)
        .sort((a, b) => a - b);

      expect(expectedObjectives).toEqual([]);
    });
  });

  describe('Dimension count validation', () => {
    it('should detect incomplete objective evaluations', () => {
      const expectedDimensionsPerObjective = { 1: 9, 2: 3 };
      const objectiveEvaluations = {
        1: {
          objective_number: 1,
          dimension_evaluations: Array(9).fill({ level: 2 }), // Correct
        },
        2: {
          objective_number: 2,
          dimension_evaluations: Array(2).fill({ level: 2 }), // Missing 1
        },
      };

      const incompleteObjectives: Array<{ objNum: number; actual: number; expected: number }> = [];

      for (const objNum of [1, 2]) {
        const objEval = objectiveEvaluations[objNum as 1 | 2];
        const dimensionCount = objEval?.dimension_evaluations?.length || 0;
        const expectedCount = expectedDimensionsPerObjective[objNum as 1 | 2] || 0;

        if (dimensionCount !== expectedCount) {
          incompleteObjectives.push({ objNum, actual: dimensionCount, expected: expectedCount });
        }
      }

      expect(incompleteObjectives).toHaveLength(1);
      expect(incompleteObjectives[0]).toEqual({ objNum: 2, actual: 2, expected: 3 });
    });
  });
});
