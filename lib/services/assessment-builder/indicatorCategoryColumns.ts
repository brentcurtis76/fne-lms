/**
 * Category-scoped view of an indicator's category-specific columns.
 *
 * Indicator rows keep their descriptor / frequency / detalle columns even after
 * a category change (preserve + hide: switching category never destroys data).
 * Every reader that must not surface off-category data — chiefly the published
 * snapshot builders consumed by the LLM report — projects the row through this
 * helper so only the columns matching the current category are emitted.
 */
export interface IndicatorCategoryColumns {
  frequency_config: unknown;
  frequency_unit_options: unknown;
  level_0_descriptor: unknown;
  level_1_descriptor: unknown;
  level_2_descriptor: unknown;
  level_3_descriptor: unknown;
  level_4_descriptor: unknown;
  detalle_options: unknown;
}

interface IndicatorRowLike {
  category: string;
  frequency_config?: unknown;
  frequency_unit_options?: unknown;
  level_0_descriptor?: unknown;
  level_1_descriptor?: unknown;
  level_2_descriptor?: unknown;
  level_3_descriptor?: unknown;
  level_4_descriptor?: unknown;
  detalle_options?: unknown;
}

export function categoryScopedColumns(indicator: IndicatorRowLike): IndicatorCategoryColumns {
  const isRubric = indicator.category === 'profundidad';
  const isFrequency = indicator.category === 'frecuencia';
  const isDetalle = indicator.category === 'detalle';
  return {
    frequency_config: isFrequency ? (indicator.frequency_config ?? null) : null,
    frequency_unit_options: isFrequency ? (indicator.frequency_unit_options ?? null) : null,
    level_0_descriptor: isRubric ? (indicator.level_0_descriptor ?? null) : null,
    level_1_descriptor: isRubric ? (indicator.level_1_descriptor ?? null) : null,
    level_2_descriptor: isRubric ? (indicator.level_2_descriptor ?? null) : null,
    level_3_descriptor: isRubric ? (indicator.level_3_descriptor ?? null) : null,
    level_4_descriptor: isRubric ? (indicator.level_4_descriptor ?? null) : null,
    detalle_options: isDetalle ? (indicator.detalle_options ?? null) : null,
  };
}
