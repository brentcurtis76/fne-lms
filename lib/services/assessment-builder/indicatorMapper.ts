import type { AssessmentIndicator } from '@/types/assessment-builder';

export function mapIndicatorRow(row: AssessmentIndicator) {
  return {
    id: row.id,
    moduleId: row.module_id,
    code: row.code,
    name: row.name,
    description: row.description,
    category: row.category,
    frequencyConfig: row.frequency_config,
    frequencyUnitOptions: row.frequency_unit_options,
    level0Descriptor: row.level_0_descriptor,
    level1Descriptor: row.level_1_descriptor,
    level2Descriptor: row.level_2_descriptor,
    level3Descriptor: row.level_3_descriptor,
    level4Descriptor: row.level_4_descriptor,
    detalleOptions: row.detalle_options,
    evaluationGuidance: row.evaluation_guidance,
    displayOrder: row.display_order,
    weight: row.weight,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
