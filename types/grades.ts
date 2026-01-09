/**
 * Chilean Grade System Constants
 * Used for transformation assessment grade selection
 */

export const CHILEAN_GRADES = [
  'Pre-Kinder',
  'Kinder',
  '1° Básico',
  '2° Básico',
  '3° Básico',
  '4° Básico',
  '5° Básico',
  '6° Básico',
  '7° Básico',
  '8° Básico',
  '1° Medio',
  '2° Medio',
  '3° Medio',
  '4° Medio',
] as const;

export type ChileanGrade = typeof CHILEAN_GRADES[number];

/**
 * Grade categories for grouped display
 */
export const GRADE_CATEGORIES = {
  preescolar: {
    label: 'Preescolar',
    grades: ['Pre-Kinder', 'Kinder'] as const,
  },
  basica: {
    label: 'Educación Básica',
    grades: [
      '1° Básico',
      '2° Básico',
      '3° Básico',
      '4° Básico',
      '5° Básico',
      '6° Básico',
      '7° Básico',
      '8° Básico',
    ] as const,
  },
  media: {
    label: 'Educación Media',
    grades: ['1° Medio', '2° Medio', '3° Medio', '4° Medio'] as const,
  },
} as const;

export type GradeCategory = keyof typeof GRADE_CATEGORIES;

/**
 * Helper to get all grades in a category
 */
export function getGradesByCategory(category: GradeCategory): readonly ChileanGrade[] {
  return GRADE_CATEGORIES[category].grades;
}

/**
 * Helper to determine which category a grade belongs to
 */
export function getGradeCategory(grade: ChileanGrade): GradeCategory {
  for (const [key, value] of Object.entries(GRADE_CATEGORIES)) {
    if ((value.grades as readonly string[]).includes(grade)) {
      return key as GradeCategory;
    }
  }
  return 'basica'; // fallback
}

/**
 * Format grades array for display
 * e.g., ["1° Básico", "2° Básico", "3° Básico"] -> "1° - 3° Básico"
 */
export function formatGradesDisplay(grades: ChileanGrade[]): string {
  if (grades.length === 0) return 'Sin grados seleccionados';
  if (grades.length === 1) return grades[0];
  if (grades.length === CHILEAN_GRADES.length) return 'Todos los grados';

  // Group by category
  const byCategory: Record<GradeCategory, ChileanGrade[]> = {
    preescolar: [],
    basica: [],
    media: [],
  };

  grades.forEach(grade => {
    const category = getGradeCategory(grade);
    byCategory[category].push(grade);
  });

  const parts: string[] = [];

  // Format each category
  Object.entries(byCategory).forEach(([category, categoryGrades]) => {
    if (categoryGrades.length === 0) return;

    const allInCategory = GRADE_CATEGORIES[category as GradeCategory].grades;
    if (categoryGrades.length === allInCategory.length) {
      // All grades in this category
      parts.push(GRADE_CATEGORIES[category as GradeCategory].label);
    } else if (categoryGrades.length <= 2) {
      parts.push(categoryGrades.join(', '));
    } else {
      // Range format
      const sorted = categoryGrades.sort(
        (a, b) => CHILEAN_GRADES.indexOf(a) - CHILEAN_GRADES.indexOf(b)
      );
      parts.push(`${sorted[0]} - ${sorted[sorted.length - 1]}`);
    }
  });

  return parts.join(', ');
}
