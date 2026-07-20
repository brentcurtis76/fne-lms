import type { AssessmentIndicator } from '@/types/assessment-builder';

export interface MappedIndicator {
  id: AssessmentIndicator['id'];
  moduleId: AssessmentIndicator['module_id'];
  code: AssessmentIndicator['code'];
  name: AssessmentIndicator['name'];
  description: AssessmentIndicator['description'];
  category: AssessmentIndicator['category'];
  frequencyConfig: AssessmentIndicator['frequency_config'];
  frequencyUnitOptions: AssessmentIndicator['frequency_unit_options'];
  level0Descriptor: AssessmentIndicator['level_0_descriptor'];
  level1Descriptor: AssessmentIndicator['level_1_descriptor'];
  level2Descriptor: AssessmentIndicator['level_2_descriptor'];
  level3Descriptor: AssessmentIndicator['level_3_descriptor'];
  level4Descriptor: AssessmentIndicator['level_4_descriptor'];
  detalleOptions: AssessmentIndicator['detalle_options'];
  evaluationGuidance: AssessmentIndicator['evaluation_guidance'];
  displayOrder: AssessmentIndicator['display_order'];
  weight: AssessmentIndicator['weight'];
  visibilityCondition?: AssessmentIndicator['visibility_condition'] | null;
  createdAt: AssessmentIndicator['created_at'];
  updatedAt: AssessmentIndicator['updated_at'];
}

export function mapIndicatorRow(row: AssessmentIndicator): MappedIndicator {
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
    visibilityCondition: row.visibility_condition,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
