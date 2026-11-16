import type { SupabaseClient } from '@supabase/supabase-js';
import { categoryScopedColumns } from './indicatorCategoryColumns';
import { describeExpectationConflict, frequencyExpectationConflicts, validateFrequencyConfig } from './frequencyConfig';
import { checkTemplateGrade, templateWriteConflict } from './templateGradeRule';

/**
 * The validated template publication service.
 *
 * Extracted additively (PR 4, pilot provisioning) from
 * `pages/api/admin/assessment-builder/templates/[templateId]/publish.ts` so
 * that the route handler and the pilot-provisioning CLI publish through ONE
 * code path. The route keeps its own auth, permission and
 * `upgradeExisting` containment checks and maps this function's result to
 * HTTP; the provisioner calls it with a service-role client and refuses to
 * mark a template published by any other means.
 *
 * Behaviour is the route's, verbatim:
 *   1. the template must exist and be a draft;
 *   2. at least one module, every module bound to an objective of this
 *      template, at least one indicator;
 *   3. every frecuencia indicator carries a complete frequency_config
 *      (PR 3 hard gate);
 *   4. GT (and GI for non-always-GT grades) expectations are captured, with
 *      missing ones reported as warnings, never as a block;
 *   5. an immutable snapshot is inserted, then the template is flipped to
 *      published at the incremented minor version; a failed flip rolls the
 *      snapshot back.
 *
 * GC-10: the refusals a person can correct (the vía's grade rule, a version
 * already taken in the template's scope) are checked before the snapshot is
 * written. A snapshot is removed only through `cleanupClient` (the route's
 * service-role client: snapshots have no DELETE rule for the caller) and only
 * when no assessment instance refers to it (assessment_instances is the only
 * table that refers to a snapshot; its key is ON DELETE RESTRICT). That covers
 * the snapshot of this attempt when the flip still fails, and a leftover of an
 * earlier failed attempt for the same template and version.
 *
 * Pure with respect to HTTP: it never touches req/res and never throws for an
 * expected failure — those come back as `{ ok: false, status, error }`.
 */

/** The minimal client surface the service needs (a supabase-js client satisfies it). */
export type PublishTemplateClient = Pick<SupabaseClient, 'from'>;

export interface PublishTemplateActor {
  /** Recorded as snapshot_data.published_by. */
  id: string;
}

export interface PublishTemplateSuccess {
  ok: true;
  newVersion: string;
  isAlwaysGT: boolean;
  requiresDualExpectations: boolean;
  template: {
    id: string;
    name: string;
    area: string;
    status: string;
    version: string;
  };
  snapshot: {
    id: string;
    version: string;
    createdAt: string;
  };
  warnings: string[];
}

export interface PublishTemplateFailure {
  ok: false;
  status: 400 | 404 | 409 | 500;
  error: string;
  code?: string;
  details?: unknown;
}

export type PublishTemplateResult = PublishTemplateSuccess | PublishTemplateFailure;

export interface PublishTemplateOptions {
  /**
   * Client that removes unreferenced snapshots left by a failed publication.
   * Defaults to the publishing client (the provisioning CLI publishes with the
   * service role already); the route passes its service-role client.
   */
  cleanupClient?: PublishTemplateClient;
}

/** Removes a snapshot only when no assessment instance refers to it. Never throws. */
async function removeSnapshotIfUnreferenced(client: PublishTemplateClient, snapshotId: string): Promise<boolean> {
  try {
    const { count, error } = await client
      .from('assessment_instances')
      .select('id', { count: 'exact', head: true })
      .eq('template_snapshot_id', snapshotId);
    if (error || typeof count !== 'number' || count > 0) return false;
    // The instances' foreign key (ON DELETE RESTRICT) still refuses this delete
    // if an instance appears in between.
    const { error: deleteError } = await client.from('assessment_template_snapshots').delete().eq('id', snapshotId);
    if (deleteError) {
      console.error('Error removing unreferenced snapshot:', deleteError);
      return false;
    }
    return true;
  } catch (err) {
    console.error('Error removing unreferenced snapshot:', err);
    return false;
  }
}

const VERSION_TAKEN =
  'Ya existe un template con la misma vía, nivel (o nombre, si no lleva nivel) y versión.';

const fail = (
  status: PublishTemplateFailure['status'],
  error: string,
  extra?: Pick<PublishTemplateFailure, 'code' | 'details'>
): PublishTemplateFailure => ({ ok: false, status, error, ...(extra ?? {}) });

export async function publishTemplate(
  supabaseClient: PublishTemplateClient,
  templateId: string,
  actor: PublishTemplateActor,
  options: PublishTemplateOptions = {}
): Promise<PublishTemplateResult> {
  const cleanupClient = options.cleanupClient ?? supabaseClient;
  // Get template with current status and grade info
  const { data: template, error: templateError } = await supabaseClient
    .from('assessment_templates')
    .select(`
      *,
      grade:ab_grades (
        id, name, is_always_gt
      )
    `)
    .eq('id', templateId)
    .single();

  if (templateError || !template) {
    return fail(404, 'Template no encontrado');
  }

  // Determine if this template requires dual expectations
  const isAlwaysGT = template.grade?.is_always_gt ?? true;
  const requiresDualExpectations = !isAlwaysGT;

  // Only draft templates can be published
  if (template.status !== 'draft') {
    return fail(
      400,
      'Solo los templates en estado borrador pueden ser publicados. Use "duplicar" para crear una nueva versión.'
    );
  }

  // Get all objectives for this template
  const { data: objectives, error: objectivesError } = await supabaseClient
    .from('assessment_objectives')
    .select('*')
    .eq('template_id', templateId)
    .order('display_order', { ascending: true });

  if (objectivesError) {
    console.error('Error fetching objectives:', objectivesError);
    return fail(500, 'Error al cargar objetivos');
  }

  // Get all modules for this template
  const { data: modules, error: modulesError } = await supabaseClient
    .from('assessment_modules')
    .select('*')
    .eq('template_id', templateId)
    .order('display_order', { ascending: true });

  if (modulesError) {
    console.error('Error fetching modules:', modulesError);
    return fail(500, 'Error al cargar módulos');
  }

  if (!modules || modules.length === 0) {
    return fail(400, 'El template debe tener al menos un módulo para ser publicado');
  }

  // Validate all modules have an objective_id
  const unassignedModules = modules.filter((m: any) => !m.objective_id);
  if (unassignedModules.length > 0) {
    const names = unassignedModules.map((m: any) => m.name).join(', ');
    return fail(400, `Todas las acciones deben pertenecer a un objetivo. Acciones sin objetivo: ${names}`);
  }

  // Validate all modules reference objectives that belong to this template
  const validObjectiveIds = new Set((objectives || []).map((o: any) => o.id));
  const invalidRelationModules = modules.filter((m: any) => !validObjectiveIds.has(m.objective_id));
  if (invalidRelationModules.length > 0) {
    const names = invalidRelationModules.map((m: any) => m.name).join(', ');
    return fail(
      400,
      `Las siguientes acciones referencian objetivos que no pertenecen a este template: ${names}`
    );
  }

  // Get all indicators for all modules
  const moduleIds = modules.map((m: any) => m.id);
  const { data: allIndicators, error: indicatorsError } = await supabaseClient
    .from('assessment_indicators')
    .select('*')
    .in('module_id', moduleIds)
    .order('display_order', { ascending: true });

  if (indicatorsError) {
    console.error('Error fetching indicators:', indicatorsError);
    return fail(500, 'Error al cargar indicadores');
  }

  if (!allIndicators || allIndicators.length === 0) {
    return fail(400, 'El template debe tener al menos un indicador para ser publicado');
  }

  // Hard gate: frecuencia indicators must state their scoring range and units.
  const invalidFrequency = allIndicators
    .filter((ind: any) => ind.category === 'frecuencia')
    .map((ind: any) => ({ indicator: ind.code || ind.name, result: validateFrequencyConfig(ind.frequency_config) }))
    .filter((entry) => !entry.result.valid);

  if (invalidFrequency.length > 0) {
    const names = invalidFrequency.map((entry) => entry.indicator).join(', ');
    return fail(
      400,
      `No se puede publicar: ${invalidFrequency.length} indicador(es) de frecuencia sin configuración válida ` +
        `(mínimo, máximo, paso, unidad por defecto y períodos permitidos): ${names}`,
      {
        code: 'invalid_frequency_config',
        details: invalidFrequency.map((entry) => ({ indicator: entry.indicator, errors: entry.result.errors })),
      }
    );
  }

  // Get all year expectations for this template (both GT and GI)
  const { data: expectations, error: expectationsError } = await supabaseClient
    .from('assessment_year_expectations')
    .select('*')
    .eq('template_id', templateId);

  if (expectationsError) {
    console.error('Error fetching expectations:', expectationsError);
    return fail(500, 'Error al cargar expectativas');
  }

  // Hard gate (F1): every frecuencia year expectation must be an answer its
  // indicator accepts (inside min/max, on the step grid).
  const expectationConflicts = allIndicators
    .filter((ind: any) => ind.category === 'frecuencia')
    .flatMap((ind: any) =>
      frequencyExpectationConflicts(
        ind.frequency_config,
        (expectations || []).filter((exp: any) => exp.indicator_id === ind.id)
      ).map((conflict) => ({ ...conflict, indicator: String(ind.code || ind.name) }))
    );

  if (expectationConflicts.length > 0) {
    return fail(
      400,
      `No se puede publicar: ${expectationConflicts.length} expectativa(s) de frecuencia fuera del rango o de los pasos ` +
        `que permite su indicador: ${expectationConflicts.map(describeExpectationConflict).join('; ')}`,
      {
        code: 'expectations_out_of_range',
        details: expectationConflicts.map((conflict) => ({
          indicator: conflict.indicator,
          generationType: conflict.generationType,
          year: conflict.year,
          value: conflict.value,
          code: conflict.code,
          message: describeExpectationConflict(conflict),
        })),
      }
    );
  }

  // Build expectations maps by indicator ID and generation_type
  const expectationsMapGT = new Map<string, any>();
  const expectationsMapGI = new Map<string, any>();
  (expectations || []).forEach((exp: any) => {
    const expData = {
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
    };
    const genType = exp.generation_type || 'GT';
    if (genType === 'GT') {
      expectationsMapGT.set(exp.indicator_id, expData);
    } else {
      expectationsMapGI.set(exp.indicator_id, expData);
    }
  });

  // Validate expectations completeness
  const indicatorsWithoutGT: string[] = [];
  const indicatorsWithoutGI: string[] = [];
  allIndicators.forEach((ind: any) => {
    const hasGT = expectationsMapGT.has(ind.id);
    const hasGI = expectationsMapGI.has(ind.id);

    if (!hasGT) {
      indicatorsWithoutGT.push(ind.code || ind.name);
    }
    if (requiresDualExpectations && !hasGI) {
      indicatorsWithoutGI.push(ind.code || ind.name);
    }
  });

  // Warning if not all indicators have expectations (but don't block publishing)
  const expectationsWarnings: string[] = [];
  if (indicatorsWithoutGT.length > 0) {
    expectationsWarnings.push(`${indicatorsWithoutGT.length} indicador(es) sin expectativas GT configuradas`);
  }
  if (requiresDualExpectations && indicatorsWithoutGI.length > 0) {
    expectationsWarnings.push(`${indicatorsWithoutGI.length} indicador(es) sin expectativas GI configuradas`);
  }

  // Helper to build indicator snapshot data.
  // Category-specific columns are projected through categoryScopedColumns so
  // off-category data preserved on a category change never reaches the snapshot.
  const buildIndicatorSnapshot = (indicator: any) => ({
    id: indicator.id,
    code: indicator.code,
    name: indicator.name,
    description: indicator.description,
    category: indicator.category,
    ...categoryScopedColumns(indicator),
    display_order: indicator.display_order,
    weight: indicator.weight,
    sub_questions: indicator.sub_questions,
    // Include both GT and GI expectations
    expectations_gt: expectationsMapGT.get(indicator.id) || null,
    expectations_gi: requiresDualExpectations ? expectationsMapGI.get(indicator.id) || null : null,
    // Legacy field for backward compatibility
    expectations: expectationsMapGT.get(indicator.id) || null,
  });

  // Helper to build module snapshot data
  const buildModuleSnapshot = (module: any) => ({
    id: module.id,
    name: module.name,
    description: module.description,
    instructions: module.instructions,
    display_order: module.display_order,
    weight: module.weight,
    objective_id: module.objective_id || null,
    indicators: allIndicators.filter((ind: any) => ind.module_id === module.id).map(buildIndicatorSnapshot),
  });

  // Build objectives hierarchy (new format)
  const objectivesSnapshot = (objectives || []).map((objective: any) => ({
    id: objective.id,
    name: objective.name,
    description: objective.description,
    display_order: objective.display_order,
    weight: objective.weight,
    modules: modules.filter((m: any) => m.objective_id === objective.id).map(buildModuleSnapshot),
  }));

  // Also include flat modules list for backward compatibility
  const flatModulesSnapshot = modules.map(buildModuleSnapshot);

  // Fetch per-year weights for snapshot capture
  // These are stored so scoring of published instances uses weights from publish time,
  // not whatever the live DB has (which may have been edited after publishing).
  const { data: yearWeightRows, error: yearWeightsSnapshotError } = await supabaseClient
    .from('assessment_entity_year_weights')
    .select('entity_type, entity_id, year, weight')
    .eq('template_id', templateId);

  if (yearWeightsSnapshotError) {
    console.error('Error fetching year weights for snapshot (non-fatal):', yearWeightsSnapshotError);
  }

  // Group per-year weights by year
  const yearWeightsSnapshot: Record<
    number,
    {
      objectives: Array<{ id: string; weight: number }>;
      modules: Array<{ id: string; weight: number }>;
      indicators: Array<{ id: string; weight: number }>;
    }
  > = {};

  if (yearWeightRows && yearWeightRows.length > 0) {
    for (const row of yearWeightRows) {
      const yr = row.year as number;
      if (!yearWeightsSnapshot[yr]) {
        yearWeightsSnapshot[yr] = { objectives: [], modules: [], indicators: [] };
      }
      const entry = { id: row.entity_id as string, weight: Number(row.weight) };
      if (row.entity_type === 'objective') yearWeightsSnapshot[yr].objectives.push(entry);
      else if (row.entity_type === 'module') yearWeightsSnapshot[yr].modules.push(entry);
      else if (row.entity_type === 'indicator') yearWeightsSnapshot[yr].indicators.push(entry);
    }
  }

  // Build the snapshot data structure
  const snapshotData = {
    template: {
      id: template.id,
      name: template.name,
      description: template.description,
      area: template.area,
      grade_id: template.grade_id,
      grade_name: template.grade?.name,
      is_always_gt: isAlwaysGT,
      requires_dual_expectations: requiresDualExpectations,
      scoring_config: template.scoring_config,
      created_at: template.created_at,
    },
    // New hierarchy: objectives → modules → indicators
    objectives: objectivesSnapshot,
    // Legacy flat list for backward compatibility
    modules: flatModulesSnapshot,
    // Per-year weight overrides (captured at publish time for stable scoring)
    yearWeights: Object.keys(yearWeightsSnapshot).length > 0 ? yearWeightsSnapshot : undefined,
    published_at: new Date().toISOString(),
    published_by: actor.id,
  };

  // Calculate new version (increment from current)
  const currentVersion = template.version || '1.0.0';
  const versionParts = currentVersion.split('.').map(Number);
  // For publishing, increment minor version
  versionParts[1] = (versionParts[1] || 0) + 1;
  versionParts[2] = 0; // Reset patch
  const newVersion = versionParts.join('.');

  // GC-10: refusals a person can correct are answered before the snapshot is
  // written. The database guard and unique keys stay the final word (a failed
  // flip below still cleans up); a check that cannot be read is left to them.
  if (template.is_archived !== true) {
    const gradeCheck = await checkTemplateGrade(supabaseClient, template.area, template.grade_id ?? null);
    if (gradeCheck.kind === 'error' && gradeCheck.status === 400) {
      return fail(409, gradeCheck.message, { code: 'template_conflict' });
    }
  }

  const { data: sameScopeRows, error: sameScopeError } = await supabaseClient
    .from('assessment_templates')
    .select('id, name, grade_id')
    .eq('area', template.area)
    .eq('version', newVersion);
  if (sameScopeError) {
    console.error('Error checking version scope (left to the database):', sameScopeError);
  } else if (Array.isArray(sameScopeRows)) {
    // Graded templates: unique per (area, grade, version); grade-less ones per
    // (area, trimmed name, version) (templateGradeRule.ts).
    const name = String(template.name ?? '').trim();
    const taken = sameScopeRows.some((row: any) => {
      if (row.id === templateId) return false;
      if (template.grade_id != null) return row.grade_id === template.grade_id;
      return row.grade_id == null && String(row.name ?? '').trim() === name;
    });
    if (taken) return fail(409, VERSION_TAKEN, { code: 'template_conflict' });
  }

  // A leftover snapshot of an earlier failed attempt (same template and version)
  // would make the insert collide. This template is a draft, so no such
  // snapshot is its current published one; it is removed only when nothing
  // refers to it.
  const { data: leftovers } = await cleanupClient
    .from('assessment_template_snapshots')
    .select('id')
    .eq('template_id', templateId)
    .eq('version', newVersion);
  if (Array.isArray(leftovers)) {
    for (const leftover of leftovers as Array<{ id: string }>) {
      await removeSnapshotIfUnreferenced(cleanupClient, leftover.id);
    }
  }

  // Create the snapshot
  const { data: snapshot, error: snapshotError } = await supabaseClient
    .from('assessment_template_snapshots')
    .insert({
      template_id: templateId,
      version: newVersion,
      snapshot_data: snapshotData,
    })
    .select()
    .single();

  if (snapshotError) {
    console.error('Error creating snapshot:', snapshotError);
    return fail(500, 'Error al crear snapshot');
  }

  // Update template status and version
  const { data: updatedTemplate, error: updateError } = await supabaseClient
    .from('assessment_templates')
    .update({
      status: 'published',
      version: newVersion,
    })
    .eq('id', templateId)
    .select()
    .single();

  if (updateError) {
    console.error('Error updating template:', updateError);
    // Roll back this attempt's snapshot (the caller's session cannot delete
    // snapshots; the cleanup client can, and only when nothing refers to it).
    await removeSnapshotIfUnreferenced(cleanupClient, snapshot.id);
    // The database refuses a template that does not fit its vía's rule
    // (assessment_template_via_rule_guard, 20261008120000) and a version that
    // collides in its scope; both are answered as conflicts, not 500s.
    const conflict = templateWriteConflict(updateError);
    if (conflict) {
      return fail(409, conflict, { code: 'template_conflict' });
    }
    return fail(500, 'Error al actualizar template');
  }

  return {
    ok: true,
    newVersion,
    isAlwaysGT,
    requiresDualExpectations,
    template: {
      id: updatedTemplate.id,
      name: updatedTemplate.name,
      area: updatedTemplate.area,
      status: updatedTemplate.status,
      version: updatedTemplate.version,
    },
    snapshot: {
      id: snapshot.id,
      version: snapshot.version,
      createdAt: snapshot.created_at,
    },
    warnings: expectationsWarnings,
  };
}
