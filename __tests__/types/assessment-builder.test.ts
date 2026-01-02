import { describe, expect, it } from 'vitest';
import {
  // Types
  type TransformationArea,
  type TemplateStatus,
  type IndicatorCategory,
  type QuestionType,
  type InstanceStatus,
  type GradeLevel,
  type ScoringConfig,
  type FrequencyConfig,
  type AssessmentTemplate,
  type AssessmentModule,
  type AssessmentIndicator,
  type SchoolTransversalContext,
  // Constants
  MATURITY_LEVELS,
  AREA_LABELS,
  AREA_STATUS,
  CATEGORY_LABELS,
  CATEGORY_DESCRIPTIONS,
  GRADE_LEVEL_LABELS,
  GRADE_LEVEL_CATEGORIES,
  GRADES_REQUIRING_SUBJECTS,
  // Helper functions
  getMaturityLevel,
  getMaturityLevelLabel,
  scoreToLevel,
  levelToScoreRange,
  requiresSubjects,
  getExpectedLevelByYear,
} from '@/types/assessment-builder';

describe('Assessment Builder Types', () => {
  describe('Constants', () => {
    describe('MATURITY_LEVELS', () => {
      it('should have 5 levels from 0 to 4', () => {
        expect(MATURITY_LEVELS).toHaveLength(5);
        expect(MATURITY_LEVELS[0].value).toBe(0);
        expect(MATURITY_LEVELS[4].value).toBe(4);
      });

      it('should have correct labels in Spanish', () => {
        expect(MATURITY_LEVELS[0].label).toBe('Por Comenzar');
        expect(MATURITY_LEVELS[1].label).toBe('Incipiente');
        expect(MATURITY_LEVELS[2].label).toBe('En Desarrollo');
        expect(MATURITY_LEVELS[3].label).toBe('Avanzado');
        expect(MATURITY_LEVELS[4].label).toBe('Consolidado');
      });

      it('should have color properties for each level', () => {
        MATURITY_LEVELS.forEach((level) => {
          expect(level).toHaveProperty('color');
          expect(level).toHaveProperty('bgColor');
          expect(level).toHaveProperty('textColor');
        });
      });
    });

    describe('AREA_LABELS', () => {
      it('should have all 7 transformation areas', () => {
        const areas: TransformationArea[] = [
          'personalizacion',
          'aprendizaje',
          'evaluacion',
          'proposito',
          'familias',
          'trabajo_docente',
          'liderazgo',
        ];
        areas.forEach((area) => {
          expect(AREA_LABELS).toHaveProperty(area);
          expect(typeof AREA_LABELS[area]).toBe('string');
        });
      });

      it('should have Spanish labels', () => {
        expect(AREA_LABELS.personalizacion).toBe('Personalización');
        expect(AREA_LABELS.aprendizaje).toBe('Aprendizaje');
        expect(AREA_LABELS.evaluacion).toBe('Evaluación');
      });
    });

    describe('AREA_STATUS', () => {
      it('should mark first 3 areas as available', () => {
        expect(AREA_STATUS.personalizacion).toBe('available');
        expect(AREA_STATUS.aprendizaje).toBe('available');
        expect(AREA_STATUS.evaluacion).toBe('available');
      });

      it('should mark last 4 areas as coming_soon', () => {
        expect(AREA_STATUS.proposito).toBe('coming_soon');
        expect(AREA_STATUS.familias).toBe('coming_soon');
        expect(AREA_STATUS.trabajo_docente).toBe('coming_soon');
        expect(AREA_STATUS.liderazgo).toBe('coming_soon');
      });
    });

    describe('CATEGORY_LABELS and CATEGORY_DESCRIPTIONS', () => {
      it('should have all 3 indicator categories', () => {
        const categories: IndicatorCategory[] = ['cobertura', 'frecuencia', 'profundidad'];
        categories.forEach((cat) => {
          expect(CATEGORY_LABELS).toHaveProperty(cat);
          expect(CATEGORY_DESCRIPTIONS).toHaveProperty(cat);
        });
      });

      it('should have correct Spanish labels', () => {
        expect(CATEGORY_LABELS.cobertura).toBe('Cobertura');
        expect(CATEGORY_LABELS.frecuencia).toBe('Frecuencia');
        expect(CATEGORY_LABELS.profundidad).toBe('Profundidad');
      });
    });

    describe('GRADE_LEVEL_LABELS', () => {
      it('should have all Chilean grade levels', () => {
        expect(Object.keys(GRADE_LEVEL_LABELS)).toHaveLength(16);
        expect(GRADE_LEVEL_LABELS['1_basico']).toBe('1° Básico');
        expect(GRADE_LEVEL_LABELS['1_medio']).toBe('1° Medio');
        expect(GRADE_LEVEL_LABELS.pre_kinder).toBe('Pre-Kinder');
      });
    });

    describe('GRADE_LEVEL_CATEGORIES', () => {
      it('should have preescolar, basica, and media categories', () => {
        expect(GRADE_LEVEL_CATEGORIES).toHaveProperty('preescolar');
        expect(GRADE_LEVEL_CATEGORIES).toHaveProperty('basica');
        expect(GRADE_LEVEL_CATEGORIES).toHaveProperty('media');
      });

      it('should have correct number of grades per category', () => {
        expect(GRADE_LEVEL_CATEGORIES.preescolar).toHaveLength(4);
        expect(GRADE_LEVEL_CATEGORIES.basica).toHaveLength(8);
        expect(GRADE_LEVEL_CATEGORIES.media).toHaveLength(4);
      });
    });

    describe('GRADES_REQUIRING_SUBJECTS', () => {
      it('should include 5° básico and above', () => {
        expect(GRADES_REQUIRING_SUBJECTS).toContain('5_basico');
        expect(GRADES_REQUIRING_SUBJECTS).toContain('8_basico');
        expect(GRADES_REQUIRING_SUBJECTS).toContain('1_medio');
        expect(GRADES_REQUIRING_SUBJECTS).toContain('4_medio');
      });

      it('should not include 1°-4° básico', () => {
        expect(GRADES_REQUIRING_SUBJECTS).not.toContain('1_basico');
        expect(GRADES_REQUIRING_SUBJECTS).not.toContain('4_basico');
      });

      it('should not include preescolar', () => {
        expect(GRADES_REQUIRING_SUBJECTS).not.toContain('pre_kinder');
        expect(GRADES_REQUIRING_SUBJECTS).not.toContain('kinder');
      });
    });
  });

  describe('Helper Functions', () => {
    describe('getMaturityLevel', () => {
      it('should return correct level object for valid levels', () => {
        const level0 = getMaturityLevel(0);
        expect(level0?.label).toBe('Por Comenzar');

        const level4 = getMaturityLevel(4);
        expect(level4?.label).toBe('Consolidado');
      });

      it('should return undefined for invalid levels', () => {
        expect(getMaturityLevel(-1)).toBeUndefined();
        expect(getMaturityLevel(5)).toBeUndefined();
        expect(getMaturityLevel(100)).toBeUndefined();
      });
    });

    describe('getMaturityLevelLabel', () => {
      it('should return correct label for valid levels', () => {
        expect(getMaturityLevelLabel(0)).toBe('Por Comenzar');
        expect(getMaturityLevelLabel(1)).toBe('Incipiente');
        expect(getMaturityLevelLabel(2)).toBe('En Desarrollo');
        expect(getMaturityLevelLabel(3)).toBe('Avanzado');
        expect(getMaturityLevelLabel(4)).toBe('Consolidado');
      });

      it('should return "Desconocido" for invalid levels', () => {
        expect(getMaturityLevelLabel(-1)).toBe('Desconocido');
        expect(getMaturityLevelLabel(5)).toBe('Desconocido');
      });
    });

    describe('scoreToLevel', () => {
      it('should convert scores to correct levels using default thresholds', () => {
        // Level 4 (Consolidated): >= 87.5
        expect(scoreToLevel(100)).toBe(4);
        expect(scoreToLevel(87.5)).toBe(4);

        // Level 3 (Advanced): >= 62.5
        expect(scoreToLevel(87.4)).toBe(3);
        expect(scoreToLevel(62.5)).toBe(3);

        // Level 2 (Developing): >= 37.5
        expect(scoreToLevel(62.4)).toBe(2);
        expect(scoreToLevel(37.5)).toBe(2);

        // Level 1 (Emerging): >= 12.5
        expect(scoreToLevel(37.4)).toBe(1);
        expect(scoreToLevel(12.5)).toBe(1);

        // Level 0 (Not Started): < 12.5
        expect(scoreToLevel(12.4)).toBe(0);
        expect(scoreToLevel(0)).toBe(0);
      });

      it('should use custom thresholds when provided', () => {
        const customConfig: ScoringConfig = {
          level_thresholds: {
            consolidated: 90,
            advanced: 70,
            developing: 50,
            emerging: 25,
          },
          default_weights: { module: 1, indicator: 1 },
        };

        expect(scoreToLevel(90, customConfig)).toBe(4);
        expect(scoreToLevel(89, customConfig)).toBe(3);
        expect(scoreToLevel(70, customConfig)).toBe(3);
        expect(scoreToLevel(69, customConfig)).toBe(2);
        expect(scoreToLevel(50, customConfig)).toBe(2);
        expect(scoreToLevel(49, customConfig)).toBe(1);
        expect(scoreToLevel(25, customConfig)).toBe(1);
        expect(scoreToLevel(24, customConfig)).toBe(0);
      });
    });

    describe('levelToScoreRange', () => {
      it('should return correct score ranges for each level', () => {
        expect(levelToScoreRange(4)).toEqual({ min: 87.5, max: 100 });
        expect(levelToScoreRange(3)).toEqual({ min: 62.5, max: 87.5 });
        expect(levelToScoreRange(2)).toEqual({ min: 37.5, max: 62.5 });
        expect(levelToScoreRange(1)).toEqual({ min: 12.5, max: 37.5 });
        expect(levelToScoreRange(0)).toEqual({ min: 0, max: 12.5 });
      });

      it('should use custom thresholds when provided', () => {
        const customConfig: ScoringConfig = {
          level_thresholds: {
            consolidated: 90,
            advanced: 70,
            developing: 50,
            emerging: 25,
          },
          default_weights: { module: 1, indicator: 1 },
        };

        expect(levelToScoreRange(4, customConfig)).toEqual({ min: 90, max: 100 });
        expect(levelToScoreRange(3, customConfig)).toEqual({ min: 70, max: 90 });
      });
    });

    describe('requiresSubjects', () => {
      it('should return true for 5° básico and above', () => {
        expect(requiresSubjects('5_basico')).toBe(true);
        expect(requiresSubjects('6_basico')).toBe(true);
        expect(requiresSubjects('7_basico')).toBe(true);
        expect(requiresSubjects('8_basico')).toBe(true);
        expect(requiresSubjects('1_medio')).toBe(true);
        expect(requiresSubjects('2_medio')).toBe(true);
        expect(requiresSubjects('3_medio')).toBe(true);
        expect(requiresSubjects('4_medio')).toBe(true);
      });

      it('should return false for 4° básico and below', () => {
        expect(requiresSubjects('1_basico')).toBe(false);
        expect(requiresSubjects('2_basico')).toBe(false);
        expect(requiresSubjects('3_basico')).toBe(false);
        expect(requiresSubjects('4_basico')).toBe(false);
      });

      it('should return false for preescolar', () => {
        expect(requiresSubjects('medio_menor')).toBe(false);
        expect(requiresSubjects('medio_mayor')).toBe(false);
        expect(requiresSubjects('pre_kinder')).toBe(false);
        expect(requiresSubjects('kinder')).toBe(false);
      });
    });

    describe('getExpectedLevelByYear', () => {
      it('should return correct expected levels for each transformation year', () => {
        expect(getExpectedLevelByYear(1)).toBe(1); // Año 1: Incipiente
        expect(getExpectedLevelByYear(2)).toBe(1); // Año 2: Incipiente-En Desarrollo
        expect(getExpectedLevelByYear(3)).toBe(2); // Año 3: En Desarrollo
        expect(getExpectedLevelByYear(4)).toBe(3); // Año 4: Avanzado
        expect(getExpectedLevelByYear(5)).toBe(3); // Año 5: Avanzado-Consolidado
      });
    });
  });

  describe('Type Structures', () => {
    it('should allow creating a valid AssessmentTemplate object', () => {
      const template: AssessmentTemplate = {
        id: 'template-1',
        area: 'personalizacion',
        version: '1.0.0',
        name: 'Evaluación de Personalización',
        status: 'draft',
        scoring_config: {
          level_thresholds: {
            consolidated: 87.5,
            advanced: 62.5,
            developing: 37.5,
            emerging: 12.5,
          },
          default_weights: {
            module: 1.0,
            indicator: 1.0,
          },
        },
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      expect(template.area).toBe('personalizacion');
      expect(template.status).toBe('draft');
      expect(template.scoring_config.level_thresholds.consolidated).toBe(87.5);
    });

    it('should allow creating a valid AssessmentModule object', () => {
      const module: AssessmentModule = {
        id: 'module-1',
        template_id: 'template-1',
        name: 'Conocimiento del Estudiante',
        description: 'Módulo sobre conocimiento del estudiante',
        display_order: 1,
        weight: 1.0,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      expect(module.name).toBe('Conocimiento del Estudiante');
      expect(module.weight).toBe(1.0);
    });

    it('should allow creating a valid AssessmentIndicator object', () => {
      const indicator: AssessmentIndicator = {
        id: 'indicator-1',
        module_id: 'module-1',
        code: 'P1.1.1',
        name: 'Tutorías individuales',
        category: 'profundidad',
        display_order: 1,
        weight: 1.0,
        level_0_descriptor: 'No implementado',
        level_1_descriptor: 'Implementación inicial',
        level_2_descriptor: 'En desarrollo',
        level_3_descriptor: 'Implementación avanzada',
        level_4_descriptor: 'Consolidado',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      expect(indicator.category).toBe('profundidad');
      expect(indicator.level_4_descriptor).toBe('Consolidado');
    });

    it('should allow creating a valid SchoolTransversalContext object', () => {
      const context: SchoolTransversalContext = {
        id: 'context-1',
        school_id: 1,
        total_students: 500,
        grade_levels: ['1_basico', '2_basico', '3_basico'],
        courses_per_level: {
          '1_basico': 2,
          '2_basico': 2,
          '3_basico': 2,
        } as Record<GradeLevel, number>,
        implementation_year_2026: 3,
        period_system: 'semestral',
        programa_inicia_completed: true,
        programa_inicia_hours: 40,
        programa_inicia_year: 2024,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      expect(context.total_students).toBe(500);
      expect(context.implementation_year_2026).toBe(3);
      expect(context.period_system).toBe('semestral');
    });

    it('should allow FrequencyConfig with different types', () => {
      const countConfig: FrequencyConfig = {
        type: 'count',
        min: 0,
        max: 100,
        unit: 'veces por semestre',
      };

      const percentageConfig: FrequencyConfig = {
        type: 'percentage',
        min: 0,
        max: 100,
        step: 5,
      };

      const scaleConfig: FrequencyConfig = {
        type: 'scale',
        min: 1,
        max: 5,
      };

      expect(countConfig.type).toBe('count');
      expect(percentageConfig.type).toBe('percentage');
      expect(scaleConfig.type).toBe('scale');
    });
  });
});
