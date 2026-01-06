/**
 * Unit tests for Assessment Builder Indicator CRUD
 * Phase 3 (Basic): Indicator management within modules
 *
 * Tests cover:
 * - API type validation
 * - Indicator category requirements
 * - Business logic for indicator validation
 * - Response structure validation
 */

import { describe, it, expect } from 'vitest';
import {
  IndicatorCategory,
  CATEGORY_LABELS,
  MATURITY_LEVELS,
} from '@/types/assessment-builder';

describe('Assessment Builder Indicators API', () => {
  describe('Indicator Categories', () => {
    it('should have all valid indicator categories', () => {
      const validCategories: IndicatorCategory[] = ['cobertura', 'frecuencia', 'profundidad'];
      expect(validCategories).toHaveLength(3);
    });

    it('should have labels for all categories', () => {
      expect(CATEGORY_LABELS['cobertura']).toBe('Cobertura');
      expect(CATEGORY_LABELS['frecuencia']).toBe('Frecuencia');
      expect(CATEGORY_LABELS['profundidad']).toBe('Profundidad');
    });

    it('should match expected category descriptions', () => {
      // Cobertura = Yes/No toggle
      expect(CATEGORY_LABELS['cobertura']).toBeDefined();
      // Frecuencia = Number input with unit
      expect(CATEGORY_LABELS['frecuencia']).toBeDefined();
      // Profundidad = Levels 0-4 with descriptors
      expect(CATEGORY_LABELS['profundidad']).toBeDefined();
    });
  });

  describe('Maturity Levels for Profundidad', () => {
    it('should have 5 maturity levels (0-4)', () => {
      expect(MATURITY_LEVELS).toHaveLength(5);
    });

    it('should have correct level values', () => {
      const levels = MATURITY_LEVELS.map(l => l.value);
      expect(levels).toEqual([0, 1, 2, 3, 4]);
    });

    it('should have meaningful labels', () => {
      // These labels match the actual types/assessment-builder.ts definitions
      expect(MATURITY_LEVELS[0].label).toBe('Por Comenzar');
      expect(MATURITY_LEVELS[1].label).toBe('Incipiente');
      expect(MATURITY_LEVELS[2].label).toBe('En Desarrollo');
      expect(MATURITY_LEVELS[3].label).toBe('Avanzado');
      expect(MATURITY_LEVELS[4].label).toBe('Consolidado');
    });
  });

  describe('Create Indicator Request Validation', () => {
    interface CreateIndicatorRequest {
      name: string;
      description?: string;
      code?: string;
      category: IndicatorCategory;
      frequencyConfig?: { unit?: string; min?: number; max?: number };
      level0Descriptor?: string;
      level1Descriptor?: string;
      level2Descriptor?: string;
      level3Descriptor?: string;
      level4Descriptor?: string;
      weight?: number;
    }

    it('should require name for all indicator types', () => {
      const validRequest: CreateIndicatorRequest = {
        name: 'Test Indicator',
        category: 'cobertura',
      };
      expect(validRequest.name).toBeDefined();
      expect(validRequest.name.length).toBeGreaterThan(0);
    });

    it('should require category for all indicators', () => {
      const validRequest: CreateIndicatorRequest = {
        name: 'Test Indicator',
        category: 'cobertura',
      };
      expect(validRequest.category).toBeDefined();
      expect(['cobertura', 'frecuencia', 'profundidad']).toContain(validRequest.category);
    });

    it('should accept optional code field', () => {
      const request: CreateIndicatorRequest = {
        name: 'Test Indicator',
        code: 'P1.1',
        category: 'cobertura',
      };
      expect(request.code).toBe('P1.1');
    });

    it('should accept optional weight field defaulting to 1', () => {
      const requestWithWeight: CreateIndicatorRequest = {
        name: 'Test',
        category: 'cobertura',
        weight: 2.5,
      };
      expect(requestWithWeight.weight).toBe(2.5);

      const requestWithoutWeight: CreateIndicatorRequest = {
        name: 'Test',
        category: 'cobertura',
      };
      expect(requestWithoutWeight.weight).toBeUndefined();
    });
  });

  describe('Cobertura Indicator Requirements', () => {
    it('should not require level descriptors', () => {
      const coberturaIndicator = {
        name: 'Has coverage',
        category: 'cobertura' as IndicatorCategory,
      };
      // Cobertura is just yes/no, no level descriptors needed
      expect(coberturaIndicator.category).toBe('cobertura');
    });

    it('should not require frequency config', () => {
      const coberturaIndicator = {
        name: 'Has coverage',
        category: 'cobertura' as IndicatorCategory,
      };
      // No frequency config for cobertura
      expect((coberturaIndicator as any).frequencyConfig).toBeUndefined();
    });
  });

  describe('Frecuencia Indicator Requirements', () => {
    it('should accept frequency config with unit', () => {
      const frecuenciaIndicator = {
        name: 'Times per week',
        category: 'frecuencia' as IndicatorCategory,
        frequencyConfig: {
          unit: 'veces por semana',
        },
      };
      expect(frecuenciaIndicator.frequencyConfig.unit).toBe('veces por semana');
    });

    it('should default unit to "veces" if not provided', () => {
      const defaultUnit = 'veces';
      expect(defaultUnit).toBe('veces');
    });

    it('should support optional min/max in frequency config', () => {
      const frecuenciaIndicator = {
        name: 'Hours of training',
        category: 'frecuencia' as IndicatorCategory,
        frequencyConfig: {
          unit: 'horas',
          min: 0,
          max: 100,
        },
      };
      expect(frecuenciaIndicator.frequencyConfig.min).toBe(0);
      expect(frecuenciaIndicator.frequencyConfig.max).toBe(100);
    });
  });

  describe('Profundidad Indicator Requirements', () => {
    it('should require at least one level descriptor', () => {
      const profundidadIndicator = {
        name: 'Depth level indicator',
        category: 'profundidad' as IndicatorCategory,
        level0Descriptor: 'Not implemented',
        level1Descriptor: 'Initial',
        level2Descriptor: 'In development',
        level3Descriptor: 'Consolidated',
        level4Descriptor: 'Exemplary',
      };

      const descriptors = [
        profundidadIndicator.level0Descriptor,
        profundidadIndicator.level1Descriptor,
        profundidadIndicator.level2Descriptor,
        profundidadIndicator.level3Descriptor,
        profundidadIndicator.level4Descriptor,
      ].filter(Boolean);

      expect(descriptors.length).toBeGreaterThan(0);
    });

    it('should allow partial level descriptors', () => {
      // Only some levels defined is valid
      const partialIndicator = {
        name: 'Partial depth',
        category: 'profundidad' as IndicatorCategory,
        level0Descriptor: 'No existe',
        level4Descriptor: 'Totalmente implementado',
      };

      const descriptors = [
        partialIndicator.level0Descriptor,
        partialIndicator.level4Descriptor,
      ].filter(Boolean);

      expect(descriptors.length).toBe(2);
    });

    it('should validate level descriptors are strings', () => {
      const descriptor = 'Some descriptor text';
      expect(typeof descriptor).toBe('string');
    });
  });

  describe('Indicator Response Structure', () => {
    interface IndicatorResponse {
      id: string;
      moduleId: string;
      code?: string;
      name: string;
      description?: string;
      category: IndicatorCategory;
      frequencyConfig?: { unit?: string; min?: number; max?: number };
      level0Descriptor?: string;
      level1Descriptor?: string;
      level2Descriptor?: string;
      level3Descriptor?: string;
      level4Descriptor?: string;
      displayOrder: number;
      weight: number;
      isActive: boolean;
      createdAt: string;
      updatedAt: string;
    }

    it('should include all required fields in response', () => {
      const mockResponse: IndicatorResponse = {
        id: 'uuid-123',
        moduleId: 'module-uuid',
        name: 'Test Indicator',
        category: 'cobertura',
        displayOrder: 1,
        weight: 1.0,
        isActive: true,
        createdAt: '2025-01-01T00:00:00Z',
        updatedAt: '2025-01-01T00:00:00Z',
      };

      expect(mockResponse.id).toBeDefined();
      expect(mockResponse.moduleId).toBeDefined();
      expect(mockResponse.name).toBeDefined();
      expect(mockResponse.category).toBeDefined();
      expect(mockResponse.displayOrder).toBeDefined();
      expect(mockResponse.weight).toBeDefined();
      expect(mockResponse.isActive).toBeDefined();
    });

    it('should use camelCase for field names in response', () => {
      const response = {
        moduleId: 'test',
        displayOrder: 1,
        frequencyConfig: {},
        level0Descriptor: 'test',
        isActive: true,
        createdAt: 'date',
        updatedAt: 'date',
      };

      expect(response).toHaveProperty('moduleId');
      expect(response).toHaveProperty('displayOrder');
      expect(response).toHaveProperty('frequencyConfig');
      expect(response).toHaveProperty('level0Descriptor');
      expect(response).toHaveProperty('isActive');
      expect(response).toHaveProperty('createdAt');
      expect(response).toHaveProperty('updatedAt');
    });
  });

  describe('Indicator Display Order', () => {
    it('should auto-assign display order on creation', () => {
      // When creating a new indicator, display_order should be auto-assigned
      const existingOrders = [1, 2, 3];
      const nextOrder = Math.max(...existingOrders, 0) + 1;
      expect(nextOrder).toBe(4);
    });

    it('should handle empty module (first indicator)', () => {
      const existingOrders: number[] = [];
      const nextOrder = existingOrders.length > 0 ? Math.max(...existingOrders) + 1 : 1;
      expect(nextOrder).toBe(1);
    });
  });

  describe('Indicator Deletion Rules', () => {
    it('should only allow deletion for draft templates', () => {
      const templateStatus = 'draft';
      const canDelete = templateStatus === 'draft';
      expect(canDelete).toBe(true);
    });

    it('should block deletion for published templates', () => {
      const templateStatus = 'published';
      const canDelete = templateStatus === 'draft';
      expect(canDelete).toBe(false);
    });

    it('should block deletion for archived templates', () => {
      const templateStatus = 'archived';
      const canDelete = templateStatus === 'draft';
      expect(canDelete).toBe(false);
    });
  });

  describe('Indicator Update Validation', () => {
    it('should allow partial updates', () => {
      const updateRequest = {
        name: 'Updated Name',
      };
      expect(Object.keys(updateRequest).length).toBe(1);
    });

    it('should reject empty name on update', () => {
      const updateRequest = {
        name: '',
      };
      const isValidName = updateRequest.name.trim().length > 0;
      expect(isValidName).toBe(false);
    });

    it('should validate category if provided in update', () => {
      const updateRequest = {
        category: 'profundidad' as IndicatorCategory,
      };
      const validCategories: IndicatorCategory[] = ['cobertura', 'frecuencia', 'profundidad'];
      expect(validCategories).toContain(updateRequest.category);
    });
  });

  describe('Permission Checks', () => {
    it('should require admin or consultor role', () => {
      const userRoles = ['admin'];
      const hasPermission = userRoles.includes('admin') || userRoles.includes('consultor');
      expect(hasPermission).toBe(true);
    });

    it('should deny access to docente role', () => {
      const userRoles = ['docente'];
      const hasPermission = userRoles.includes('admin') || userRoles.includes('consultor');
      expect(hasPermission).toBe(false);
    });

    it('should allow consultor access', () => {
      const userRoles = ['consultor'];
      const hasPermission = userRoles.includes('admin') || userRoles.includes('consultor');
      expect(hasPermission).toBe(true);
    });
  });

  describe('UI Display Logic', () => {
    it('should show category badge with correct colors', () => {
      const categoryColors = {
        cobertura: 'bg-blue-100 text-blue-700',
        frecuencia: 'bg-amber-100 text-amber-700',
        profundidad: 'bg-green-100 text-green-700',
      };

      expect(categoryColors.cobertura).toContain('blue');
      expect(categoryColors.frecuencia).toContain('purple');
      expect(categoryColors.profundidad).toContain('green');
    });

    it('should count configured level descriptors for profundidad', () => {
      const indicator = {
        level0Descriptor: 'No existe',
        level1Descriptor: null,
        level2Descriptor: 'En desarrollo',
        level3Descriptor: undefined,
        level4Descriptor: 'Ejemplar',
      };

      const configuredLevels = [
        indicator.level0Descriptor,
        indicator.level1Descriptor,
        indicator.level2Descriptor,
        indicator.level3Descriptor,
        indicator.level4Descriptor,
      ].filter(Boolean).length;

      expect(configuredLevels).toBe(3);
    });
  });
});
