/**
 * Auto-Assignment Service for Assessment Builder
 *
 * When a docente is assigned to a course, this service automatically creates
 * assessment instances for all published templates (one per vía de transformación).
 *
 * Key features:
 * - Matches templates to courses by grade (school_course_structure.grade_level -> ab_grades.name)
 * - Determines GT/GI generation type from Migration Plan (ab_migration_plan)
 * - Stores generation_type on assessment instances for proper expectation matching
 *
 * NOTE: This service uses supabaseAdmin to bypass RLS restrictions.
 * RLS policies block inserts to assessment_instances and assessment_instance_assignees
 * from regular authenticated users.
 */

import { supabaseAdmin } from '@/lib/supabaseAdmin';
import type { GenerationType } from '@/types/assessment-builder';

export interface AutoAssignmentResult {
  success: boolean;
  instancesCreated: number;
  instancesSkipped: number;
  errors: string[];
  warnings: string[];
  details: {
    templateId: string;
    templateName: string;
    area: string;
    gradeId?: number;
    gradeName?: string;
    generationType?: GenerationType;
    instanceId?: string;
    status: 'created' | 'already_exists' | 'error' | 'no_matching_grade';
    error?: string;
  }[];
}

/**
 * Triggers auto-assignment of assessment instances when a docente is assigned to a course.
 *
 * For each published template matching the course's grade:
 * 1. Get the course's grade_level and match to ab_grades
 * 2. Find templates matching that grade_id
 * 3. Look up Migration Plan to determine GT/GI for current year
 * 4. Check if an instance already exists for this course_structure_id
 * 5. If not, create a new assessment instance with generation_type
 * 6. Create an assignee record linking the docente to the instance
 *
 * NOTE: Uses supabaseAdmin internally to bypass RLS restrictions.
 * The supabase parameter is kept for backwards compatibility but ignored.
 */
export async function triggerAutoAssignment(
  _supabase: any, // Kept for backwards compatibility, uses supabaseAdmin instead
  docenteId: string,
  courseStructureId: string,
  schoolId: number,
  assignedBy: string
): Promise<AutoAssignmentResult> {
  const result: AutoAssignmentResult = {
    success: true,
    instancesCreated: 0,
    instancesSkipped: 0,
    errors: [],
    warnings: [],
    details: [],
  };

  try {
    // Get school context to determine transformation year
    const { data: schoolContext, error: contextError } = await supabaseAdmin
      .from('school_transversal_context')
      .select('implementation_year_2026')
      .eq('school_id', schoolId)
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    if (contextError || !schoolContext) {
      result.errors.push('No se encontró el contexto transversal de la escuela');
      result.success = false;
      return result;
    }

    const transformationYear = schoolContext.implementation_year_2026 as 1 | 2 | 3 | 4 | 5;

    // Get the course structure to find grade_level
    const { data: courseStructure, error: courseError } = await supabaseAdmin
      .from('school_course_structure')
      .select('id, grade_level')
      .eq('id', courseStructureId)
      .single();

    if (courseError || !courseStructure) {
      result.errors.push('No se encontró la estructura del curso');
      result.success = false;
      return result;
    }

    const courseGradeLevel = courseStructure.grade_level;

    // Match grade_level text to ab_grades table
    const { data: gradeData, error: gradeError } = await supabaseAdmin
      .from('ab_grades')
      .select('id, name, is_always_gt')
      .eq('name', courseGradeLevel)
      .single();

    if (gradeError || !gradeData) {
      // Grade not found in ab_grades - log warning but continue with no grade filter
      result.warnings.push(`No se encontró el nivel "${courseGradeLevel}" en ab_grades. Buscando templates sin filtro de nivel.`);
    }

    const courseGradeId = gradeData?.id || null;
    const isAlwaysGT = gradeData?.is_always_gt ?? true;

    // Determine generation_type from Migration Plan (only if grade is not always_gt)
    let generationType: GenerationType = 'GT';

    if (!isAlwaysGT && courseGradeId) {
      const { data: migrationPlanEntry, error: mpError } = await supabaseAdmin
        .from('ab_migration_plan')
        .select('generation_type')
        .eq('school_id', schoolId)
        .eq('year_number', transformationYear)
        .eq('grade_id', courseGradeId)
        .single();

      if (mpError || !migrationPlanEntry) {
        // No migration plan entry - default to GT and warn
        result.warnings.push(
          `No se encontró plan de migración para nivel "${courseGradeLevel}" en año ${transformationYear}. Usando GT por defecto.`
        );
      } else {
        generationType = migrationPlanEntry.generation_type as GenerationType;
      }
    }

    // Get published templates matching the course's grade (or all if no grade match)
    let templatesQuery = supabaseAdmin
      .from('assessment_templates')
      .select(`
        id,
        name,
        area,
        grade_id,
        grade:ab_grades (
          id,
          name,
          is_always_gt
        ),
        assessment_template_snapshots (
          id,
          version,
          created_at
        )
      `)
      .eq('status', 'published')
      .order('area');

    // Filter by grade_id if we have a valid course grade
    if (courseGradeId) {
      templatesQuery = templatesQuery.eq('grade_id', courseGradeId);
    }

    const { data: templates, error: templatesError } = await templatesQuery;

    if (templatesError) {
      result.errors.push(`Error fetching templates: ${templatesError.message}`);
      result.success = false;
      return result;
    }

    if (!templates || templates.length === 0) {
      // No published templates for this grade - this is OK
      if (courseGradeId) {
        result.warnings.push(`No hay templates publicados para el nivel "${courseGradeLevel}"`);
      }
      return result;
    }

    // Process each template
    for (const template of templates) {
      const templateGrade = (template as any).grade;
      const templateDetail: AutoAssignmentResult['details'][0] = {
        templateId: template.id,
        templateName: template.name,
        area: template.area,
        gradeId: template.grade_id || undefined,
        gradeName: templateGrade?.name,
        generationType,
        status: 'created',
      };

      try {
        // Get the latest snapshot for this template
        const snapshots = (template as any).assessment_template_snapshots || [];
        const latestSnapshot = snapshots.sort((a: any, b: any) =>
          new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
        )[0];

        if (!latestSnapshot) {
          templateDetail.status = 'error';
          templateDetail.error = 'No snapshot available for published template';
          result.errors.push(`Template ${template.name}: No snapshot available`);
          result.details.push(templateDetail);
          continue;
        }

        // Check if instance already exists for this course structure
        const { data: existingInstance } = await supabaseAdmin
          .from('assessment_instances')
          .select('id')
          .eq('course_structure_id', courseStructureId)
          .eq('template_snapshot_id', latestSnapshot.id)
          .single();

        if (existingInstance) {
          // Instance already exists - check if docente is already assigned
          const { data: existingAssignee } = await supabaseAdmin
            .from('assessment_instance_assignees')
            .select('id')
            .eq('instance_id', existingInstance.id)
            .eq('user_id', docenteId)
            .single();

          if (existingAssignee) {
            templateDetail.status = 'already_exists';
            templateDetail.instanceId = existingInstance.id;
            result.instancesSkipped++;
          } else {
            // Add docente as assignee to existing instance
            await supabaseAdmin
              .from('assessment_instance_assignees')
              .insert({
                instance_id: existingInstance.id,
                user_id: docenteId,
                can_edit: true,
                can_submit: true,
                assigned_by: assignedBy,
              });

            templateDetail.status = 'created';
            templateDetail.instanceId = existingInstance.id;
            result.instancesCreated++;
          }
        } else {
          // Create new instance with generation_type
          const { data: newInstance, error: instanceError } = await supabaseAdmin
            .from('assessment_instances')
            .insert({
              template_snapshot_id: latestSnapshot.id,
              school_id: schoolId,
              course_structure_id: courseStructureId,
              transformation_year: transformationYear,
              generation_type: generationType,
              status: 'pending',
              assigned_by: assignedBy,
            })
            .select()
            .single();

          if (instanceError || !newInstance) {
            templateDetail.status = 'error';
            templateDetail.error = instanceError?.message || 'Failed to create instance';
            result.errors.push(`Template ${template.name}: ${templateDetail.error}`);
            result.details.push(templateDetail);
            continue;
          }

          // Create assignee record
          const { error: assigneeError } = await supabaseAdmin
            .from('assessment_instance_assignees')
            .insert({
              instance_id: newInstance.id,
              user_id: docenteId,
              can_edit: true,
              can_submit: true,
              assigned_by: assignedBy,
            });

          if (assigneeError) {
            templateDetail.status = 'error';
            templateDetail.error = `Instance created but assignee failed: ${assigneeError.message}`;
            result.errors.push(`Template ${template.name}: ${templateDetail.error}`);
          } else {
            templateDetail.instanceId = newInstance.id;
            result.instancesCreated++;
          }
        }
      } catch (err: any) {
        templateDetail.status = 'error';
        templateDetail.error = err.message;
        result.errors.push(`Template ${template.name}: ${err.message}`);
      }

      result.details.push(templateDetail);
    }

    result.success = result.errors.length === 0;
    return result;
  } catch (err: any) {
    result.success = false;
    result.errors.push(`Unexpected error: ${err.message}`);
    return result;
  }
}

/**
 * Creates new assessment instances for all existing assignees when a template is updated.
 *
 * This is called when a new version of a template is published and we want existing
 * docentes to receive the updated version without having to re-assign them manually.
 *
 * Since templates can be duplicated (creating a new template_id), this function searches
 * by AREA instead of template_id. It finds all instances for templates in the same area
 * and creates new instances linked to the new snapshot.
 *
 * For each existing instance in the same AREA (from any template):
 * 1. Get all assignees of that instance
 * 2. Create a new instance with the LATEST snapshot (the one just published)
 * 3. Link all assignees to the new instance
 * 4. Preserve the original generation_type from the old instance
 *
 * NOTE: Uses supabaseAdmin internally to bypass RLS restrictions.
 */
export async function upgradeExistingAssignments(
  templateId: string,
  newSnapshotId: string,
  upgradedBy: string
): Promise<AutoAssignmentResult> {
  const result: AutoAssignmentResult = {
    success: true,
    instancesCreated: 0,
    instancesSkipped: 0,
    errors: [],
    warnings: [],
    details: [],
  };

  try {
    // First, get this template's area
    const { data: currentTemplate, error: templateError } = await supabaseAdmin
      .from('assessment_templates')
      .select('area')
      .eq('id', templateId)
      .single();

    if (templateError || !currentTemplate) {
      result.errors.push('No se pudo obtener el área del template');
      result.success = false;
      return result;
    }

    const area = currentTemplate.area;

    // Get ALL templates in the same area (including archived/old versions)
    const { data: areaTemplates, error: areaTemplatesError } = await supabaseAdmin
      .from('assessment_templates')
      .select('id')
      .eq('area', area);

    if (areaTemplatesError || !areaTemplates || areaTemplates.length === 0) {
      return result;
    }

    const templateIds = areaTemplates.map(t => t.id);

    // Get ALL snapshots for templates in this area (excluding the new one)
    const { data: oldSnapshots, error: snapshotsError } = await supabaseAdmin
      .from('assessment_template_snapshots')
      .select('id')
      .in('template_id', templateIds)
      .neq('id', newSnapshotId);

    if (snapshotsError || !oldSnapshots || oldSnapshots.length === 0) {
      // No old snapshots - nothing to upgrade
      return result;
    }

    const oldSnapshotIds = oldSnapshots.map(s => s.id);

    // Get all instances linked to old snapshots WITH their assignees
    const { data: oldInstances, error: instancesError } = await supabaseAdmin
      .from('assessment_instances')
      .select(`
        id,
        school_id,
        course_structure_id,
        transformation_year,
        generation_type,
        assessment_instance_assignees (
          user_id,
          can_edit,
          can_submit,
          assigned_by
        )
      `)
      .in('template_snapshot_id', oldSnapshotIds)
      .neq('status', 'completed'); // Don't upgrade completed instances

    if (instancesError || !oldInstances || oldInstances.length === 0) {
      // No old instances to upgrade
      return result;
    }

    // Group instances by unique course_structure_id (or school_id if course is null)
    const instanceMap = new Map<string, any>();
    for (const instance of oldInstances) {
      const key = instance.course_structure_id
        ? `course_${instance.course_structure_id}`
        : `school_${instance.school_id}`;

      // Only keep one instance per course/school (in case multiple old versions exist)
      if (!instanceMap.has(key)) {
        instanceMap.set(key, instance);
      }
    }

    // Create new instances with the new snapshot for each unique course/school
    for (const [key, oldInstance] of instanceMap) {
      const assignees = (oldInstance as any).assessment_instance_assignees || [];

      if (assignees.length === 0) {
        continue;
      }

      try {
        // Check if instance already exists for this course/school with the NEW snapshot
        let existingQuery = supabaseAdmin
          .from('assessment_instances')
          .select('id')
          .eq('template_snapshot_id', newSnapshotId)
          .eq('school_id', oldInstance.school_id);

        if (oldInstance.course_structure_id) {
          existingQuery = existingQuery.eq('course_structure_id', oldInstance.course_structure_id);
        } else {
          existingQuery = existingQuery.is('course_structure_id', null);
        }

        const { data: existingNew } = await existingQuery.maybeSingle();

        if (existingNew) {
          result.instancesSkipped++;
          continue;
        }

        // Create new instance (preserve generation_type from old instance)
        const { data: newInstance, error: createError } = await supabaseAdmin
          .from('assessment_instances')
          .insert({
            template_snapshot_id: newSnapshotId,
            school_id: oldInstance.school_id,
            course_structure_id: oldInstance.course_structure_id,
            transformation_year: oldInstance.transformation_year,
            generation_type: oldInstance.generation_type || 'GT',
            status: 'pending',
            assigned_by: upgradedBy,
          })
          .select()
          .single();

        if (createError || !newInstance) {
          result.errors.push(`Error creating instance for ${key}: ${createError?.message}`);
          continue;
        }

        // Assign all the same users to the new instance
        const assigneeInserts = assignees.map((a: any) => ({
          instance_id: newInstance.id,
          user_id: a.user_id,
          can_edit: a.can_edit,
          can_submit: a.can_submit,
          assigned_by: upgradedBy,
        }));

        const { error: assigneeError } = await supabaseAdmin
          .from('assessment_instance_assignees')
          .insert(assigneeInserts);

        if (assigneeError) {
          result.errors.push(`Error assigning users for ${key}: ${assigneeError.message}`);
        } else {
          result.instancesCreated++;
          result.details.push({
            templateId,
            templateName: key,
            area: '',
            instanceId: newInstance.id,
            status: 'created',
          });
        }
      } catch (err: any) {
        result.errors.push(`Error processing ${key}: ${err.message}`);
      }
    }

    result.success = result.errors.length === 0;
    return result;
  } catch (err: any) {
    result.success = false;
    result.errors.push(`Unexpected error: ${err.message}`);
    return result;
  }
}

/**
 * Creates assessment instances for a school when context is completed.
 * This is called after the transversal questionnaire is saved.
 * Unlike triggerAutoAssignment, this creates instances at the school level,
 * not the course level (for directivo-only assessments).
 *
 * For school-level instances, we default to GT since they are not tied to a
 * specific course/grade. Scoring will use GT expectations.
 *
 * NOTE: Uses supabaseAdmin internally to bypass RLS restrictions.
 */
export async function createSchoolLevelInstances(
  _supabase: any, // Kept for backwards compatibility, uses supabaseAdmin instead
  schoolId: number,
  transformationYear: 1 | 2 | 3 | 4 | 5,
  createdBy: string
): Promise<AutoAssignmentResult> {
  const result: AutoAssignmentResult = {
    success: true,
    instancesCreated: 0,
    instancesSkipped: 0,
    errors: [],
    warnings: [],
    details: [],
  };

  try {
    // Get all published templates
    const { data: templates, error: templatesError } = await supabaseAdmin
      .from('assessment_templates')
      .select(`
        id,
        name,
        area,
        assessment_template_snapshots (
          id,
          version,
          created_at
        )
      `)
      .eq('status', 'published');

    if (templatesError || !templates) {
      result.errors.push(`Error fetching templates: ${templatesError?.message}`);
      result.success = false;
      return result;
    }

    for (const template of templates) {
      const templateDetail: AutoAssignmentResult['details'][0] = {
        templateId: template.id,
        templateName: template.name,
        area: template.area,
        status: 'created',
      };

      try {
        const snapshots = (template as any).assessment_template_snapshots || [];
        const latestSnapshot = snapshots.sort((a: any, b: any) =>
          new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
        )[0];

        if (!latestSnapshot) {
          templateDetail.status = 'error';
          templateDetail.error = 'No snapshot available';
          result.details.push(templateDetail);
          continue;
        }

        // Check if school-level instance exists
        const { data: existingInstance } = await supabaseAdmin
          .from('assessment_instances')
          .select('id')
          .eq('school_id', schoolId)
          .eq('template_snapshot_id', latestSnapshot.id)
          .is('course_structure_id', null)
          .single();

        if (existingInstance) {
          templateDetail.status = 'already_exists';
          templateDetail.instanceId = existingInstance.id;
          result.instancesSkipped++;
        } else {
          // School-level instances default to GT
          const { data: newInstance, error: instanceError } = await supabaseAdmin
            .from('assessment_instances')
            .insert({
              template_snapshot_id: latestSnapshot.id,
              school_id: schoolId,
              transformation_year: transformationYear,
              generation_type: 'GT',
              status: 'pending',
              assigned_by: createdBy,
            })
            .select()
            .single();

          if (instanceError || !newInstance) {
            templateDetail.status = 'error';
            templateDetail.error = instanceError?.message;
          } else {
            templateDetail.instanceId = newInstance.id;
            result.instancesCreated++;
          }
        }
      } catch (err: any) {
        templateDetail.status = 'error';
        templateDetail.error = err.message;
      }

      result.details.push(templateDetail);
    }

    result.success = result.errors.length === 0;
    return result;
  } catch (err: any) {
    result.success = false;
    result.errors.push(`Unexpected error: ${err.message}`);
    return result;
  }
}

/**
 * Updates the snapshot for a published template when it's edited.
 * This ensures docentes see the updated data immediately.
 *
 * Called when editing a published template's:
 * - Template info (name, description)
 * - Modules
 * - Indicators
 * - Expectations
 *
 * @param templateId - The template being edited
 * @param updatedBy - User ID who made the edit
 * @returns Object with success status and updated snapshot info
 */
export async function updatePublishedTemplateSnapshot(
  templateId: string,
  updatedBy: string
): Promise<{ success: boolean; error?: string; snapshotId?: string; version?: string }> {
  try {
    // Get the template
    const { data: template, error: templateError } = await supabaseAdmin
      .from('assessment_templates')
      .select('*')
      .eq('id', templateId)
      .single();

    if (templateError || !template) {
      return { success: false, error: 'Template not found' };
    }

    // Only update snapshots for published templates
    if (template.status !== 'published') {
      return { success: true }; // No-op for non-published templates
    }

    // Get the most recent snapshot for this template
    const { data: existingSnapshot, error: snapshotError } = await supabaseAdmin
      .from('assessment_template_snapshots')
      .select('id, version')
      .eq('template_id', templateId)
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    if (snapshotError || !existingSnapshot) {
      console.error('No snapshot found for published template:', templateId);
      return { success: false, error: 'No snapshot found for published template' };
    }

    // Get all modules for this template
    const { data: modules, error: modulesError } = await supabaseAdmin
      .from('assessment_modules')
      .select('*')
      .eq('template_id', templateId)
      .order('display_order', { ascending: true });

    if (modulesError) {
      return { success: false, error: 'Error loading modules' };
    }

    // Get all indicators for all modules
    const moduleIds = (modules || []).map(m => m.id);
    let allIndicators: any[] = [];

    if (moduleIds.length > 0) {
      const { data: indicators, error: indicatorsError } = await supabaseAdmin
        .from('assessment_indicators')
        .select('*')
        .in('module_id', moduleIds)
        .order('display_order', { ascending: true });

      if (indicatorsError) {
        return { success: false, error: 'Error loading indicators' };
      }
      allIndicators = indicators || [];
    }

    // Get all year expectations for this template
    const { data: expectations } = await supabaseAdmin
      .from('assessment_year_expectations')
      .select('*')
      .eq('template_id', templateId);

    // Build expectations map by indicator ID
    const expectationsMap = new Map<string, any>();
    (expectations || []).forEach((exp: any) => {
      expectationsMap.set(exp.indicator_id, {
        year_1_expected: exp.year_1_expected,
        year_1_expected_unit: exp.year_1_expected_unit,
        year_2_expected: exp.year_2_expected,
        year_2_expected_unit: exp.year_2_expected_unit,
        year_3_expected: exp.year_3_expected,
        year_3_expected_unit: exp.year_3_expected_unit,
        year_4_expected: exp.year_4_expected,
        year_4_expected_unit: exp.year_4_expected_unit,
        year_5_expected: exp.year_5_expected,
        year_5_expected_unit: exp.year_5_expected_unit,
        tolerance: exp.tolerance,
      });
    });

    // Build the updated snapshot data structure
    const snapshotData = {
      template: {
        id: template.id,
        name: template.name,
        description: template.description,
        area: template.area,
        scoring_config: template.scoring_config,
        created_at: template.created_at,
      },
      modules: (modules || []).map(module => ({
        id: module.id,
        name: module.name,
        description: module.description,
        instructions: module.instructions,
        display_order: module.display_order,
        weight: module.weight,
        indicators: allIndicators
          .filter(ind => ind.module_id === module.id)
          .map(indicator => ({
            id: indicator.id,
            code: indicator.code,
            name: indicator.name,
            description: indicator.description,
            category: indicator.category,
            frequency_config: indicator.frequency_config,
            frequency_unit_options: indicator.frequency_unit_options,
            level_0_descriptor: indicator.level_0_descriptor,
            level_1_descriptor: indicator.level_1_descriptor,
            level_2_descriptor: indicator.level_2_descriptor,
            level_3_descriptor: indicator.level_3_descriptor,
            level_4_descriptor: indicator.level_4_descriptor,
            display_order: indicator.display_order,
            weight: indicator.weight,
            sub_questions: indicator.sub_questions,
            expectations: expectationsMap.get(indicator.id) || null,
          })),
      })),
      published_at: new Date().toISOString(),
      published_by: updatedBy,
      last_updated_at: new Date().toISOString(),
      last_updated_by: updatedBy,
    };

    // Update the existing snapshot
    const { error: updateError } = await supabaseAdmin
      .from('assessment_template_snapshots')
      .update({
        snapshot_data: snapshotData,
        version: template.version,
      })
      .eq('id', existingSnapshot.id);

    if (updateError) {
      console.error('Error updating snapshot:', updateError);
      return { success: false, error: 'Error updating snapshot' };
    }

    console.log(`Updated snapshot ${existingSnapshot.id} for template ${templateId}`);
    return {
      success: true,
      snapshotId: existingSnapshot.id,
      version: template.version,
    };
  } catch (err: any) {
    console.error('Unexpected error updating snapshot:', err);
    return { success: false, error: err.message };
  }
}
