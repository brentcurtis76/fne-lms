import { describe, expect, it } from 'vitest';
import type {
  AssessmentTemplate,
  AssessmentModule,
  AssessmentIndicator,
  CreateTemplateRequest,
  UpdateTemplateRequest,
  CreateModuleRequest,
  UpdateModuleRequest,
  CreateIndicatorRequest,
  TransformationArea,
  TemplateStatus,
  IndicatorCategory,
  ScoringConfig,
} from '@/types/assessment-builder';
import {
  AREA_LABELS,
  AREA_STATUS,
  CATEGORY_LABELS,
  MATURITY_LEVELS,
  scoreToLevel,
  levelToScoreRange,
  requiresSubjects,
  getExpectedLevelByYear,
  getMaturityLevel,
  getMaturityLevelLabel,
  GRADE_LEVEL_LABELS,
  GRADES_REQUIRING_SUBJECTS,
} from '@/types/assessment-builder';

describe('Assessment Builder API Types', () => {
  describe('Area Constants', () => {
    it('should have correct labels for all 7 transformation areas', () => {
      expect(Object.keys(AREA_LABELS)).toHaveLength(7);
      expect(AREA_LABELS.personalizacion).toBe('Personalización');
      expect(AREA_LABELS.aprendizaje).toBe('Aprendizaje');
      expect(AREA_LABELS.evaluacion).toBe('Evaluación');
      expect(AREA_LABELS.proposito).toBe('Propósito');
      expect(AREA_LABELS.familias).toBe('Familias');
      expect(AREA_LABELS.trabajo_docente).toBe('Trabajo Docente');
      expect(AREA_LABELS.liderazgo).toBe('Liderazgo');
    });

    it('should mark first 3 areas as available and last 4 as coming soon', () => {
      expect(AREA_STATUS.personalizacion).toBe('available');
      expect(AREA_STATUS.aprendizaje).toBe('available');
      expect(AREA_STATUS.evaluacion).toBe('available');
      expect(AREA_STATUS.proposito).toBe('coming_soon');
      expect(AREA_STATUS.familias).toBe('coming_soon');
      expect(AREA_STATUS.trabajo_docente).toBe('coming_soon');
      expect(AREA_STATUS.liderazgo).toBe('coming_soon');
    });
  });

  describe('Category Constants', () => {
    it('should have all 3 indicator categories with correct labels', () => {
      expect(Object.keys(CATEGORY_LABELS)).toHaveLength(3);
      expect(CATEGORY_LABELS.cobertura).toBe('Cobertura');
      expect(CATEGORY_LABELS.frecuencia).toBe('Frecuencia');
      expect(CATEGORY_LABELS.profundidad).toBe('Profundidad');
    });
  });

  describe('Maturity Levels', () => {
    it('should have 5 levels from 0 to 4', () => {
      expect(MATURITY_LEVELS).toHaveLength(5);
      expect(MATURITY_LEVELS[0].value).toBe(0);
      expect(MATURITY_LEVELS[4].value).toBe(4);
    });

    it('should have correct Spanish labels for each level', () => {
      expect(MATURITY_LEVELS[0].label).toBe('Por Comenzar');
      expect(MATURITY_LEVELS[1].label).toBe('Incipiente');
      expect(MATURITY_LEVELS[2].label).toBe('En Desarrollo');
      expect(MATURITY_LEVELS[3].label).toBe('Avanzado');
      expect(MATURITY_LEVELS[4].label).toBe('Consolidado');
    });

    it('should have color properties for styling', () => {
      MATURITY_LEVELS.forEach((level) => {
        expect(level).toHaveProperty('color');
        expect(level).toHaveProperty('bgColor');
        expect(level).toHaveProperty('textColor');
      });
    });
  });

  describe('Score to Level Conversion', () => {
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

  describe('Level to Score Range', () => {
    it('should return correct score ranges for each level', () => {
      expect(levelToScoreRange(4)).toEqual({ min: 87.5, max: 100 });
      expect(levelToScoreRange(3)).toEqual({ min: 62.5, max: 87.5 });
      expect(levelToScoreRange(2)).toEqual({ min: 37.5, max: 62.5 });
      expect(levelToScoreRange(1)).toEqual({ min: 12.5, max: 37.5 });
      expect(levelToScoreRange(0)).toEqual({ min: 0, max: 12.5 });
    });
  });

  describe('Grade Level Requirements', () => {
    it('should require subjects for 5° básico and above', () => {
      expect(requiresSubjects('5_basico')).toBe(true);
      expect(requiresSubjects('6_basico')).toBe(true);
      expect(requiresSubjects('7_basico')).toBe(true);
      expect(requiresSubjects('8_basico')).toBe(true);
      expect(requiresSubjects('1_medio')).toBe(true);
      expect(requiresSubjects('4_medio')).toBe(true);
    });

    it('should not require subjects for 4° básico and below', () => {
      expect(requiresSubjects('1_basico')).toBe(false);
      expect(requiresSubjects('4_basico')).toBe(false);
      expect(requiresSubjects('pre_kinder')).toBe(false);
      expect(requiresSubjects('kinder')).toBe(false);
    });

    it('should have correct grades in GRADES_REQUIRING_SUBJECTS array', () => {
      expect(GRADES_REQUIRING_SUBJECTS).toContain('5_basico');
      expect(GRADES_REQUIRING_SUBJECTS).toContain('1_medio');
      expect(GRADES_REQUIRING_SUBJECTS).not.toContain('1_basico');
      expect(GRADES_REQUIRING_SUBJECTS).not.toContain('kinder');
    });
  });

  describe('Expected Level by Transformation Year', () => {
    it('should return correct expected levels for each year', () => {
      expect(getExpectedLevelByYear(1)).toBe(1); // Año 1: Incipiente
      expect(getExpectedLevelByYear(2)).toBe(1); // Año 2: Incipiente-En Desarrollo
      expect(getExpectedLevelByYear(3)).toBe(2); // Año 3: En Desarrollo
      expect(getExpectedLevelByYear(4)).toBe(3); // Año 4: Avanzado
      expect(getExpectedLevelByYear(5)).toBe(3); // Año 5: Avanzado-Consolidado
    });
  });

  describe('Maturity Level Helpers', () => {
    it('should get maturity level object by value', () => {
      const level0 = getMaturityLevel(0);
      expect(level0?.label).toBe('Por Comenzar');
      expect(level0?.color).toBe('gray');

      const level4 = getMaturityLevel(4);
      expect(level4?.label).toBe('Consolidado');
      expect(level4?.color).toBe('green');
    });

    it('should return undefined for invalid levels', () => {
      expect(getMaturityLevel(-1)).toBeUndefined();
      expect(getMaturityLevel(5)).toBeUndefined();
      expect(getMaturityLevel(100)).toBeUndefined();
    });

    it('should get maturity level label by value', () => {
      expect(getMaturityLevelLabel(0)).toBe('Por Comenzar');
      expect(getMaturityLevelLabel(4)).toBe('Consolidado');
      expect(getMaturityLevelLabel(-1)).toBe('Desconocido');
      expect(getMaturityLevelLabel(5)).toBe('Desconocido');
    });
  });

  describe('Grade Level Labels', () => {
    it('should have all 16 Chilean grade levels', () => {
      expect(Object.keys(GRADE_LEVEL_LABELS)).toHaveLength(16);
    });

    it('should have correct labels in Spanish', () => {
      expect(GRADE_LEVEL_LABELS['1_basico']).toBe('1° Básico');
      expect(GRADE_LEVEL_LABELS['1_medio']).toBe('1° Medio');
      expect(GRADE_LEVEL_LABELS.pre_kinder).toBe('Pre-Kinder');
      expect(GRADE_LEVEL_LABELS.kinder).toBe('Kinder');
    });
  });
});

describe('Template Request Types', () => {
  it('should allow creating valid CreateTemplateRequest', () => {
    const request: CreateTemplateRequest = {
      area: 'personalizacion',
      name: 'Evaluación de Personalización 2026',
      description: 'Template para evaluar la personalización',
    };

    expect(request.area).toBe('personalizacion');
    expect(request.name).toBe('Evaluación de Personalización 2026');
    expect(request.description).toBe('Template para evaluar la personalización');
  });

  it('should allow CreateTemplateRequest without optional description', () => {
    const request: CreateTemplateRequest = {
      area: 'aprendizaje',
      name: 'Evaluación de Aprendizaje',
    };

    expect(request.area).toBe('aprendizaje');
    expect(request.description).toBeUndefined();
  });

  it('should allow partial UpdateTemplateRequest', () => {
    const nameOnly: UpdateTemplateRequest = {
      name: 'Updated Name',
    };
    expect(nameOnly.name).toBe('Updated Name');
    expect(nameOnly.description).toBeUndefined();

    const descOnly: UpdateTemplateRequest = {
      description: 'Updated description',
    };
    expect(descOnly.description).toBe('Updated description');
    expect(descOnly.name).toBeUndefined();
  });

  it('should allow UpdateTemplateRequest with scoring_config', () => {
    const withConfig: UpdateTemplateRequest = {
      scoring_config: {
        level_thresholds: {
          consolidated: 90,
          advanced: 70,
          developing: 50,
          emerging: 25,
        },
      },
    };

    expect(withConfig.scoring_config?.level_thresholds?.consolidated).toBe(90);
  });
});

describe('Module Request Types', () => {
  it('should allow creating valid CreateModuleRequest', () => {
    const request: CreateModuleRequest = {
      template_id: 'template-123',
      name: 'Conocimiento del Estudiante',
      description: 'Módulo sobre conocimiento del estudiante',
      instructions: 'Complete los indicadores de este módulo',
      weight: 1.5,
    };

    expect(request.template_id).toBe('template-123');
    expect(request.name).toBe('Conocimiento del Estudiante');
    expect(request.weight).toBe(1.5);
  });

  it('should allow CreateModuleRequest with only required fields', () => {
    const request: CreateModuleRequest = {
      template_id: 'template-123',
      name: 'Módulo Básico',
    };

    expect(request.template_id).toBe('template-123');
    expect(request.description).toBeUndefined();
    expect(request.instructions).toBeUndefined();
    expect(request.weight).toBeUndefined();
  });

  it('should allow partial UpdateModuleRequest', () => {
    const nameOnly: UpdateModuleRequest = {
      name: 'Updated Module Name',
    };
    expect(nameOnly.name).toBe('Updated Module Name');

    const weightOnly: UpdateModuleRequest = {
      weight: 2.0,
    };
    expect(weightOnly.weight).toBe(2.0);
  });
});

describe('Indicator Request Types', () => {
  it('should allow creating valid CreateIndicatorRequest', () => {
    const request: CreateIndicatorRequest = {
      module_id: 'module-123',
      code: 'P1.1.1',
      name: 'Tutorías individuales',
      description: 'Indicador de tutorías',
      category: 'profundidad',
      level_0_descriptor: 'No implementado',
      level_1_descriptor: 'Implementación inicial',
      level_2_descriptor: 'En desarrollo',
      level_3_descriptor: 'Implementación avanzada',
      level_4_descriptor: 'Consolidado',
      weight: 1.0,
    };

    expect(request.module_id).toBe('module-123');
    expect(request.category).toBe('profundidad');
    expect(request.code).toBe('P1.1.1');
  });

  it('should allow CreateIndicatorRequest for cobertura category', () => {
    const request: CreateIndicatorRequest = {
      module_id: 'module-123',
      name: 'Indicador de cobertura',
      category: 'cobertura',
    };

    expect(request.category).toBe('cobertura');
    expect(request.frequency_config).toBeUndefined();
  });

  it('should allow CreateIndicatorRequest for frecuencia category with config', () => {
    const request: CreateIndicatorRequest = {
      module_id: 'module-123',
      name: 'Frecuencia de tutorías',
      category: 'frecuencia',
      frequency_config: {
        type: 'count',
        min: 0,
        max: 100,
        unit: 'veces por semestre',
      },
    };

    expect(request.category).toBe('frecuencia');
    expect(request.frequency_config?.type).toBe('count');
    expect(request.frequency_config?.unit).toBe('veces por semestre');
  });
});

describe('Entity Type Structures', () => {
  it('should allow creating valid AssessmentTemplate', () => {
    const template: AssessmentTemplate = {
      id: 'template-1',
      area: 'personalizacion',
      version: '1.0.0',
      name: 'Evaluación de Personalización',
      description: 'Template completo',
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

  it('should allow creating valid AssessmentModule', () => {
    const module: AssessmentModule = {
      id: 'module-1',
      template_id: 'template-1',
      name: 'Conocimiento del Estudiante',
      description: 'Módulo sobre conocimiento',
      instructions: 'Instrucciones del módulo',
      display_order: 1,
      weight: 1.0,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    expect(module.name).toBe('Conocimiento del Estudiante');
    expect(module.weight).toBe(1.0);
    expect(module.display_order).toBe(1);
  });

  it('should allow creating valid AssessmentIndicator', () => {
    const indicator: AssessmentIndicator = {
      id: 'indicator-1',
      module_id: 'module-1',
      code: 'P1.1.1',
      name: 'Tutorías individuales',
      description: 'Descripción del indicador',
      category: 'profundidad',
      display_order: 1,
      weight: 1.0,
      level_0_descriptor: 'Nivel 0',
      level_1_descriptor: 'Nivel 1',
      level_2_descriptor: 'Nivel 2',
      level_3_descriptor: 'Nivel 3',
      level_4_descriptor: 'Nivel 4',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    expect(indicator.category).toBe('profundidad');
    expect(indicator.level_4_descriptor).toBe('Nivel 4');
  });

  it('should allow all TemplateStatus values', () => {
    const statuses: TemplateStatus[] = ['draft', 'published', 'archived'];
    expect(statuses).toContain('draft');
    expect(statuses).toContain('published');
    expect(statuses).toContain('archived');
  });

  it('should allow all IndicatorCategory values', () => {
    const categories: IndicatorCategory[] = ['cobertura', 'frecuencia', 'profundidad'];
    expect(categories).toContain('cobertura');
    expect(categories).toContain('frecuencia');
    expect(categories).toContain('profundidad');
  });

  it('should allow all TransformationArea values', () => {
    const areas: TransformationArea[] = [
      'personalizacion',
      'aprendizaje',
      'evaluacion',
      'proposito',
      'familias',
      'trabajo_docente',
      'liderazgo',
    ];
    expect(areas).toHaveLength(7);
    areas.forEach((area) => {
      expect(AREA_LABELS[area]).toBeDefined();
    });
  });
});
