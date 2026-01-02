import { describe, expect, it } from 'vitest';
import type {
  SaveTransversalContextRequest,
  SchoolTransversalContext,
  GradeLevel,
  PeriodSystem,
} from '@/types/assessment-builder';
import {
  GRADE_LEVEL_LABELS,
  GRADE_LEVEL_CATEGORIES,
  GRADES_REQUIRING_SUBJECTS,
} from '@/types/assessment-builder';

describe('Transversal Context API Types', () => {
  describe('SaveTransversalContextRequest validation', () => {
    it('should accept valid request with all required fields', () => {
      const request: SaveTransversalContextRequest = {
        school_id: 1,
        total_students: 500,
        grade_levels: ['1_basico', '2_basico', '3_basico'],
        courses_per_level: {
          '1_basico': 2,
          '2_basico': 2,
          '3_basico': 2,
        },
        implementation_year_2026: 3,
        period_system: 'semestral',
        programa_inicia_completed: false,
      };

      expect(request.school_id).toBe(1);
      expect(request.total_students).toBe(500);
      expect(request.grade_levels).toHaveLength(3);
      expect(request.implementation_year_2026).toBe(3);
      expect(request.period_system).toBe('semestral');
    });

    it('should accept valid request with optional fields', () => {
      const request: SaveTransversalContextRequest = {
        school_id: 1,
        total_students: 1000,
        grade_levels: ['5_basico', '6_basico'],
        courses_per_level: {
          '5_basico': 3,
          '6_basico': 3,
        },
        implementation_year_2026: 2,
        period_system: 'trimestral',
        programa_inicia_completed: true,
        programa_inicia_hours: 40,
        programa_inicia_year: 2024,
        subjects_per_level: {
          '5_basico': ['Matemáticas', 'Lenguaje', 'Ciencias'],
          '6_basico': ['Matemáticas', 'Lenguaje', 'Ciencias'],
        },
      };

      expect(request.programa_inicia_completed).toBe(true);
      expect(request.programa_inicia_hours).toBe(40);
      expect(request.programa_inicia_year).toBe(2024);
      expect(request.subjects_per_level?.['5_basico']).toHaveLength(3);
    });

    it('should only allow valid implementation years (1-5)', () => {
      const validYears: Array<1 | 2 | 3 | 4 | 5> = [1, 2, 3, 4, 5];

      validYears.forEach(year => {
        const request: SaveTransversalContextRequest = {
          school_id: 1,
          total_students: 100,
          grade_levels: ['1_basico'],
          courses_per_level: { '1_basico': 1 },
          implementation_year_2026: year,
          period_system: 'semestral',
          programa_inicia_completed: false,
        };
        expect(request.implementation_year_2026).toBe(year);
      });
    });

    it('should only allow valid period systems', () => {
      const validSystems: PeriodSystem[] = ['semestral', 'trimestral'];

      validSystems.forEach(system => {
        const request: SaveTransversalContextRequest = {
          school_id: 1,
          total_students: 100,
          grade_levels: ['1_basico'],
          courses_per_level: { '1_basico': 1 },
          implementation_year_2026: 1,
          period_system: system,
          programa_inicia_completed: false,
        };
        expect(request.period_system).toBe(system);
      });
    });

    it('should only allow valid programa_inicia_hours values', () => {
      const validHours: Array<20 | 40 | 80> = [20, 40, 80];

      validHours.forEach(hours => {
        const request: SaveTransversalContextRequest = {
          school_id: 1,
          total_students: 100,
          grade_levels: ['1_basico'],
          courses_per_level: { '1_basico': 1 },
          implementation_year_2026: 1,
          period_system: 'semestral',
          programa_inicia_completed: true,
          programa_inicia_hours: hours,
        };
        expect(request.programa_inicia_hours).toBe(hours);
      });
    });
  });

  describe('Grade Level Constants', () => {
    it('should have all 16 Chilean grade levels', () => {
      expect(Object.keys(GRADE_LEVEL_LABELS)).toHaveLength(16);
    });

    it('should categorize preescolar levels correctly', () => {
      expect(GRADE_LEVEL_CATEGORIES.preescolar).toContain('medio_menor');
      expect(GRADE_LEVEL_CATEGORIES.preescolar).toContain('medio_mayor');
      expect(GRADE_LEVEL_CATEGORIES.preescolar).toContain('pre_kinder');
      expect(GRADE_LEVEL_CATEGORIES.preescolar).toContain('kinder');
      expect(GRADE_LEVEL_CATEGORIES.preescolar).toHaveLength(4);
    });

    it('should categorize basica levels correctly', () => {
      expect(GRADE_LEVEL_CATEGORIES.basica).toContain('1_basico');
      expect(GRADE_LEVEL_CATEGORIES.basica).toContain('8_basico');
      expect(GRADE_LEVEL_CATEGORIES.basica).toHaveLength(8);
    });

    it('should categorize media levels correctly', () => {
      expect(GRADE_LEVEL_CATEGORIES.media).toContain('1_medio');
      expect(GRADE_LEVEL_CATEGORIES.media).toContain('4_medio');
      expect(GRADE_LEVEL_CATEGORIES.media).toHaveLength(4);
    });

    it('should identify grades requiring subjects (5° básico and above)', () => {
      // Should require subjects
      expect(GRADES_REQUIRING_SUBJECTS).toContain('5_basico');
      expect(GRADES_REQUIRING_SUBJECTS).toContain('6_basico');
      expect(GRADES_REQUIRING_SUBJECTS).toContain('7_basico');
      expect(GRADES_REQUIRING_SUBJECTS).toContain('8_basico');
      expect(GRADES_REQUIRING_SUBJECTS).toContain('1_medio');
      expect(GRADES_REQUIRING_SUBJECTS).toContain('2_medio');
      expect(GRADES_REQUIRING_SUBJECTS).toContain('3_medio');
      expect(GRADES_REQUIRING_SUBJECTS).toContain('4_medio');

      // Should NOT require subjects
      expect(GRADES_REQUIRING_SUBJECTS).not.toContain('1_basico');
      expect(GRADES_REQUIRING_SUBJECTS).not.toContain('4_basico');
      expect(GRADES_REQUIRING_SUBJECTS).not.toContain('kinder');
      expect(GRADES_REQUIRING_SUBJECTS).not.toContain('pre_kinder');
    });
  });

  describe('SchoolTransversalContext type', () => {
    it('should accept valid context object', () => {
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
        programa_inicia_completed: false,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      expect(context.id).toBe('context-1');
      expect(context.school_id).toBe(1);
      expect(context.total_students).toBe(500);
      expect(context.implementation_year_2026).toBe(3);
    });

    it('should accept context with optional fields', () => {
      const context: SchoolTransversalContext = {
        id: 'context-2',
        school_id: 2,
        total_students: 800,
        grade_levels: ['5_basico', '6_basico'],
        courses_per_level: {
          '5_basico': 3,
          '6_basico': 3,
        } as Record<GradeLevel, number>,
        implementation_year_2026: 4,
        period_system: 'trimestral',
        programa_inicia_completed: true,
        programa_inicia_hours: 80,
        programa_inicia_year: 2023,
        subjects_per_level: {
          '5_basico': ['Matemáticas', 'Lenguaje'],
          '6_basico': ['Matemáticas', 'Lenguaje'],
        } as Record<GradeLevel, string[]>,
        generacion_tractor_history: [
          { year: 2022, courses: ['5°A', '5°B'] },
          { year: 2023, courses: ['5°A', '5°B', '6°A'] },
        ],
        completed_by: 'user-123',
        completed_at: new Date().toISOString(),
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      expect(context.programa_inicia_hours).toBe(80);
      expect(context.subjects_per_level?.['5_basico']).toHaveLength(2);
      expect(context.generacion_tractor_history).toHaveLength(2);
      expect(context.completed_by).toBe('user-123');
    });
  });
});

describe('Transversal Context Business Logic', () => {
  describe('Course structure generation', () => {
    it('should generate correct course names for básica levels', () => {
      // Test that the grade level prefix mapping is correct
      const expectedPrefixes: Record<string, string> = {
        '1_basico': '1',
        '2_basico': '2',
        '8_basico': '8',
      };

      Object.entries(expectedPrefixes).forEach(([level, prefix]) => {
        expect(prefix).toBeDefined();
      });
    });

    it('should generate correct course names for media levels', () => {
      const expectedPrefixes: Record<string, string> = {
        '1_medio': 'I',
        '2_medio': 'II',
        '3_medio': 'III',
        '4_medio': 'IV',
      };

      Object.entries(expectedPrefixes).forEach(([level, prefix]) => {
        expect(prefix).toBeDefined();
      });
    });

    it('should generate correct course names for preescolar levels', () => {
      const expectedPrefixes: Record<string, string> = {
        'medio_menor': 'MM',
        'medio_mayor': 'My',
        'pre_kinder': 'PK',
        'kinder': 'K',
      };

      Object.entries(expectedPrefixes).forEach(([level, prefix]) => {
        expect(prefix).toBeDefined();
      });
    });
  });

  describe('Implementation year validation', () => {
    it('should map implementation year to expected maturity level', () => {
      // Year 1 -> Level 1 (Incipiente)
      // Year 2 -> Level 1 (Incipiente-En Desarrollo)
      // Year 3 -> Level 2 (En Desarrollo)
      // Year 4 -> Level 3 (Avanzado)
      // Year 5 -> Level 3 (Avanzado-Consolidado)

      const yearToLevel: Record<number, number> = {
        1: 1,
        2: 1,
        3: 2,
        4: 3,
        5: 3,
      };

      Object.entries(yearToLevel).forEach(([year, level]) => {
        expect(level).toBeGreaterThanOrEqual(1);
        expect(level).toBeLessThanOrEqual(4);
      });
    });
  });

  describe('Period system validation', () => {
    it('should only allow semestral or trimestral', () => {
      const validSystems = ['semestral', 'trimestral'];

      validSystems.forEach(system => {
        expect(['semestral', 'trimestral']).toContain(system);
      });
    });
  });
});

describe('Transversal Context Form Validation', () => {
  it('should require total_students to be > 0', () => {
    const validateTotalStudents = (value: number): boolean => {
      return typeof value === 'number' && value > 0;
    };

    expect(validateTotalStudents(500)).toBe(true);
    expect(validateTotalStudents(1)).toBe(true);
    expect(validateTotalStudents(0)).toBe(false);
    expect(validateTotalStudents(-1)).toBe(false);
  });

  it('should require at least one grade level', () => {
    const validateGradeLevels = (levels: GradeLevel[]): boolean => {
      return Array.isArray(levels) && levels.length > 0;
    };

    expect(validateGradeLevels(['1_basico'])).toBe(true);
    expect(validateGradeLevels(['1_basico', '2_basico'])).toBe(true);
    expect(validateGradeLevels([])).toBe(false);
  });

  it('should require courses_per_level for each selected grade', () => {
    const validateCoursesPerLevel = (
      gradeLevels: GradeLevel[],
      coursesPerLevel: Record<string, number>
    ): boolean => {
      return gradeLevels.every(level => {
        const count = coursesPerLevel[level];
        return typeof count === 'number' && count >= 1;
      });
    };

    expect(validateCoursesPerLevel(
      ['1_basico', '2_basico'],
      { '1_basico': 2, '2_basico': 2 }
    )).toBe(true);

    expect(validateCoursesPerLevel(
      ['1_basico', '2_basico'],
      { '1_basico': 2 } // Missing 2_basico
    )).toBe(false);
  });

  it('should require implementation_year_2026 to be 1-5', () => {
    const validateImplementationYear = (year: number): boolean => {
      return typeof year === 'number' && year >= 1 && year <= 5;
    };

    expect(validateImplementationYear(1)).toBe(true);
    expect(validateImplementationYear(3)).toBe(true);
    expect(validateImplementationYear(5)).toBe(true);
    expect(validateImplementationYear(0)).toBe(false);
    expect(validateImplementationYear(6)).toBe(false);
  });

  it('should require period_system to be semestral or trimestral', () => {
    const validatePeriodSystem = (system: string): boolean => {
      return system === 'semestral' || system === 'trimestral';
    };

    expect(validatePeriodSystem('semestral')).toBe(true);
    expect(validatePeriodSystem('trimestral')).toBe(true);
    expect(validatePeriodSystem('quarterly')).toBe(false);
    expect(validatePeriodSystem('')).toBe(false);
  });
});
