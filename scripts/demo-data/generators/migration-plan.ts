/**
 * Migration Plan Generator
 * Creates demo migration plan entries and transversal context
 */

import { SupabaseClient } from '@supabase/supabase-js';
import { DEMO_CONFIG } from '../config';
import type { GradeLevel } from '../../../types/assessment-builder';

export interface DemoMigrationPlanData {
  entriesCount: number;
  transformationYear: number;
  contextId: string | null;
}

// Grade levels in order (matching the ab_grades table)
const GRADE_LEVELS: GradeLevel[] = [
  'medio_menor',
  'medio_mayor',
  'pre_kinder',
  'kinder',
  '1_basico',
  '2_basico',
  '3_basico',
  '4_basico',
  '5_basico',
  '6_basico',
  '7_basico',
  '8_basico',
  '1_medio',
  '2_medio',
  '3_medio',
  '4_medio',
];

export async function createDemoMigrationPlan(
  supabase: SupabaseClient,
  schoolId: number
): Promise<DemoMigrationPlanData> {
  console.log('  Creating demo migration plan...');

  // First, get all grades from ab_grades table
  const { data: grades, error: gradesError } = await supabase
    .from('ab_grades')
    .select('id, name, sort_order, is_always_gt')
    .order('sort_order');

  if (gradesError) {
    console.error(`Failed to fetch grades: ${gradesError.message}`);
    return { entriesCount: 0, transformationYear: DEMO_CONFIG.TRANSFORMATION_YEAR, contextId: null };
  }

  if (!grades || grades.length === 0) {
    console.warn('No grades found in ab_grades table. Skipping migration plan creation.');
    return { entriesCount: 0, transformationYear: DEMO_CONFIG.TRANSFORMATION_YEAR, contextId: null };
  }

  console.log(`    Found ${grades.length} grades in ab_grades table`);

  // Create school transversal context with transformation year
  const { data: context, error: contextError } = await supabase
    .from('school_transversal_context')
    .insert({
      school_id: schoolId,
      total_students: 450,
      grade_levels: GRADE_LEVELS,
      courses_per_level: GRADE_LEVELS.reduce((acc, level) => {
        acc[level] = level.includes('medio') ? 1 : 2; // 1 course for media, 2 for others
        return acc;
      }, {} as Record<string, number>),
      implementation_year_2026: DEMO_CONFIG.TRANSFORMATION_YEAR,
      programa_inicia_completed: true,
      programa_inicia_hours: 40,
      programa_inicia_year: 2023,
      period_system: 'semestral'
    })
    .select()
    .single();

  if (contextError) {
    console.error(`Failed to create transversal context: ${contextError.message}`);
  } else {
    console.log(`    Transversal context created (Year ${DEMO_CONFIG.TRANSFORMATION_YEAR} of transformation)`);
  }

  // Create migration plan entries for all 5 years
  const entries: Array<{
    school_id: number;
    year_number: number;
    grade_id: number;
    generation_type: 'GT' | 'GI';
  }> = [];

  for (let year = 1; year <= 5; year++) {
    for (const grade of grades) {
      // Determine generation type based on grade and year
      let generationType: 'GT' | 'GI';

      if (grade.is_always_gt) {
        // Grades marked as always GT (typically PreK-2nd grade)
        generationType = 'GT';
      } else {
        // For other grades, transition from GI to GT progressively
        // Year 1: mostly GI, Year 5: all GT
        // The threshold moves up by ~3 grades each year
        const gtThreshold = 6 + (year * 2); // Starts at grade 8, increases each year
        generationType = grade.sort_order <= gtThreshold ? 'GT' : 'GI';
      }

      entries.push({
        school_id: schoolId,
        year_number: year,
        grade_id: grade.id,
        generation_type: generationType
      });
    }
  }

  // Insert all entries
  const { error: insertError } = await supabase
    .from('ab_migration_plan')
    .insert(entries);

  if (insertError) {
    console.error(`Failed to create migration plan entries: ${insertError.message}`);
    return {
      entriesCount: 0,
      transformationYear: DEMO_CONFIG.TRANSFORMATION_YEAR,
      contextId: context?.id || null
    };
  }

  console.log(`    Created ${entries.length} migration plan entries (5 years x ${grades.length} grades)`);

  // Count GT vs GI for current year
  const currentYearEntries = entries.filter(e => e.year_number === DEMO_CONFIG.TRANSFORMATION_YEAR);
  const gtCount = currentYearEntries.filter(e => e.generation_type === 'GT').length;
  const giCount = currentYearEntries.filter(e => e.generation_type === 'GI').length;
  console.log(`    Year ${DEMO_CONFIG.TRANSFORMATION_YEAR}: ${gtCount} GT grades, ${giCount} GI grades`);

  return {
    entriesCount: entries.length,
    transformationYear: DEMO_CONFIG.TRANSFORMATION_YEAR,
    contextId: context?.id || null
  };
}
