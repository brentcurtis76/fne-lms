/**
 * Assessment Builder Types
 *
 * This file contains all TypeScript types for the Assessment Builder system.
 * These types mirror the database schema defined in 055_assessment_builder_schema.sql
 */

// ============================================================
// ENUMS Y CONSTANTES
// ============================================================

export type TransformationArea =
  | 'personalizacion'
  | 'aprendizaje'
  | 'evaluacion'
  | 'proposito'
  | 'familias'
  | 'trabajo_docente'
  | 'liderazgo';

export type TemplateStatus = 'draft' | 'published' | 'archived';

export type IndicatorCategory = 'cobertura' | 'frecuencia' | 'profundidad';

export type QuestionType =
  | 'text'
  | 'number'
  | 'select'
  | 'multiselect'
  | 'boolean'
  | 'scale';

export type InstanceStatus = 'pending' | 'in_progress' | 'completed' | 'archived';

export type PeriodSystem = 'semestral' | 'trimestral';

export type GradeLevel =
  | 'medio_menor'
  | 'medio_mayor'
  | 'pre_kinder'
  | 'kinder'
  | '1_basico'
  | '2_basico'
  | '3_basico'
  | '4_basico'
  | '5_basico'
  | '6_basico'
  | '7_basico'
  | '8_basico'
  | '1_medio'
  | '2_medio'
  | '3_medio'
  | '4_medio';

// ============================================================
// CONSTANTES
// ============================================================

export const MATURITY_LEVELS = [
  { value: 0, label: 'Por Comenzar', color: 'gray', bgColor: 'bg-gray-100', textColor: 'text-gray-700' },
  { value: 1, label: 'Incipiente', color: 'red', bgColor: 'bg-red-100', textColor: 'text-red-700' },
  { value: 2, label: 'En Desarrollo', color: 'yellow', bgColor: 'bg-yellow-100', textColor: 'text-yellow-700' },
  { value: 3, label: 'Avanzado', color: 'blue', bgColor: 'bg-blue-100', textColor: 'text-blue-700' },
  { value: 4, label: 'Consolidado', color: 'green', bgColor: 'bg-green-100', textColor: 'text-green-700' },
] as const;

export const AREA_LABELS: Record<TransformationArea, string> = {
  personalizacion: 'Personalización',
  aprendizaje: 'Aprendizaje',
  evaluacion: 'Evaluación',
  proposito: 'Propósito',
  familias: 'Familias',
  trabajo_docente: 'Trabajo Docente',
  liderazgo: 'Liderazgo',
};

export const AREA_STATUS: Record<TransformationArea, 'available' | 'coming_soon'> = {
  personalizacion: 'available',
  aprendizaje: 'available',
  evaluacion: 'available',
  proposito: 'coming_soon',
  familias: 'coming_soon',
  trabajo_docente: 'coming_soon',
  liderazgo: 'coming_soon',
};

export const CATEGORY_LABELS: Record<IndicatorCategory, string> = {
  cobertura: 'Cobertura',
  frecuencia: 'Frecuencia',
  profundidad: 'Profundidad',
};

export const CATEGORY_DESCRIPTIONS: Record<IndicatorCategory, string> = {
  cobertura: 'Respuesta binaria (Sí/No)',
  frecuencia: 'Valor cuantitativo (número, porcentaje)',
  profundidad: 'Nivel de rúbrica (0-4)',
};

// Frequency unit options and labels
export type FrequencyUnit = 'dia' | 'semana' | 'mes' | 'trimestre' | 'semestre' | 'año';

export const FREQUENCY_UNIT_OPTIONS: FrequencyUnit[] = [
  'dia',
  'semana',
  'mes',
  'trimestre',
  'semestre',
  'año',
];

export const FREQUENCY_UNIT_LABELS: Record<FrequencyUnit, string> = {
  dia: 'día',
  semana: 'semana',
  mes: 'mes',
  trimestre: 'trimestre',
  semestre: 'semestre',
  año: 'año',
};

export const DEFAULT_FREQUENCY_UNIT_OPTIONS: FrequencyUnit[] = ['dia', 'semana', 'mes', 'trimestre', 'semestre', 'año'];

export const GRADE_LEVEL_LABELS: Record<GradeLevel, string> = {
  medio_menor: 'Medio Menor',
  medio_mayor: 'Medio Mayor',
  pre_kinder: 'Pre-Kinder',
  kinder: 'Kinder',
  '1_basico': '1° Básico',
  '2_basico': '2° Básico',
  '3_basico': '3° Básico',
  '4_basico': '4° Básico',
  '5_basico': '5° Básico',
  '6_basico': '6° Básico',
  '7_basico': '7° Básico',
  '8_basico': '8° Básico',
  '1_medio': '1° Medio',
  '2_medio': '2° Medio',
  '3_medio': '3° Medio',
  '4_medio': '4° Medio',
};

export const GRADE_LEVEL_CATEGORIES = {
  preescolar: ['medio_menor', 'medio_mayor', 'pre_kinder', 'kinder'] as GradeLevel[],
  basica: [
    '1_basico',
    '2_basico',
    '3_basico',
    '4_basico',
    '5_basico',
    '6_basico',
    '7_basico',
    '8_basico',
  ] as GradeLevel[],
  media: ['1_medio', '2_medio', '3_medio', '4_medio'] as GradeLevel[],
};

// Niveles que requieren asignaturas (5° básico en adelante)
export const GRADES_REQUIRING_SUBJECTS: GradeLevel[] = [
  '5_basico',
  '6_basico',
  '7_basico',
  '8_basico',
  '1_medio',
  '2_medio',
  '3_medio',
  '4_medio',
];

// ============================================================
// CONFIGURACIÓN Y VALIDACIÓN
// ============================================================

export interface ScoringConfig {
  level_thresholds: {
    consolidated: number; // Default: 87.5
    advanced: number; // Default: 62.5
    developing: number; // Default: 37.5
    emerging: number; // Default: 12.5
  };
  default_weights: {
    module: number; // Default: 1.0
    indicator: number; // Default: 1.0
  };
}

export interface FrequencyConfig {
  type: 'count' | 'percentage' | 'scale';
  min?: number;
  max?: number;
  step?: number;
  unit?: string; // "veces por semestre", "%", etc.
}

export interface ValidationRules {
  min?: number;
  max?: number;
  minLength?: number;
  maxLength?: number;
  pattern?: string;
  customMessage?: string;
}

export interface ConditionRule {
  field: string;
  operator: 'equals' | 'not_equals' | 'greater_than' | 'less_than' | 'contains' | 'in';
  value: string | number | boolean | string[];
}

export interface ConditionGroup {
  logic: 'and' | 'or';
  conditions: (ConditionRule | ConditionGroup)[];
}

export type VisibilityCondition = ConditionRule | ConditionGroup;

// ============================================================
// SCHOOL TRANSVERSAL CONTEXT (11 Questions)
// ============================================================

export interface SchoolTransversalContext {
  id: string;
  school_id: number;

  // P1: Estudiantes
  total_students: number;

  // P2: Niveles
  grade_levels: GradeLevel[];

  // P3: Cursos por nivel
  courses_per_level: Record<GradeLevel, number>;

  // P5: Año de implementación para 2026
  implementation_year_2026: 1 | 2 | 3 | 4 | 5;

  // P6: Asignaturas por nivel (solo 5°+)
  subjects_per_level?: Record<GradeLevel, string[]>;

  // P8: Evolución Generación Tractor
  generacion_tractor_history?: GenerationHistory[];

  // P9: Evolución Generación Innova
  generacion_innova_history?: GenerationHistory[];

  // P10: Programa Inicia
  programa_inicia_completed: boolean;
  programa_inicia_hours?: 20 | 40 | 80;
  programa_inicia_year?: number;

  // P11: Sistema de períodos
  period_system: PeriodSystem;

  // Metadata
  completed_by?: string;
  completed_at?: string;
  created_at: string;
  updated_at: string;
}

export interface GenerationHistory {
  year: number;
  courses: string[];
}

export interface SchoolCourseStructure {
  id: string;
  school_id: number;
  context_id: string;
  grade_level: GradeLevel;
  course_name: string; // "1°A", "1°B", etc.
  professionals?: string[]; // UUIDs of docentes (P7, for 5°+)
  created_at: string;
}

export interface SchoolCourseDocenteAssignment {
  id: string;
  course_structure_id: string;
  docente_id: string;
  assigned_by?: string;
  assigned_at: string;
  is_active: boolean;
}

// ============================================================
// ASSESSMENT TEMPLATES
// ============================================================

export interface AssessmentTemplate {
  id: string;
  area: TransformationArea;
  version: string;
  name: string;
  description?: string;
  status: TemplateStatus;
  scoring_config: ScoringConfig;
  published_at?: string;
  published_by?: string;
  created_by?: string;
  created_at: string;
  updated_at: string;
  // Archive fields
  is_archived?: boolean;
  archived_at?: string;
  archived_by?: string;
  // Relaciones (cuando se cargan)
  modules?: AssessmentModule[];
  context_questions?: AssessmentContextQuestion[];
}

export interface AssessmentContextQuestion {
  id: string;
  template_id: string;
  question_text: string;
  question_type: QuestionType;
  options?: string[];
  placeholder?: string;
  help_text?: string;
  is_required: boolean;
  validation_rules?: ValidationRules;
  display_order: number;
  visibility_condition?: VisibilityCondition;
  created_at: string;
  updated_at: string;
}

export interface AssessmentModule {
  id: string;
  template_id: string;
  name: string;
  description?: string;
  instructions?: string;
  display_order: number;
  weight: number;
  created_at: string;
  updated_at: string;
  // Relaciones
  indicators?: AssessmentIndicator[];
}

export interface AssessmentIndicator {
  id: string;
  module_id: string;
  code?: string;
  name: string;
  question?: string; // User-friendly question displayed to docentes (falls back to name if empty)
  description?: string;
  category: IndicatorCategory;
  frequency_config?: FrequencyConfig;
  frequency_unit_options?: FrequencyUnit[]; // Allowed frequency units for this indicator
  level_0_descriptor?: string;
  level_1_descriptor?: string;
  level_2_descriptor?: string;
  level_3_descriptor?: string;
  level_4_descriptor?: string;
  display_order: number;
  weight: number;
  visibility_condition?: VisibilityCondition;
  created_at: string;
  updated_at: string;
  // Relaciones
  sub_questions?: AssessmentSubQuestion[];
  expectations?: AssessmentYearExpectation;
}

export interface AssessmentSubQuestion {
  id: string;
  indicator_id?: string;
  parent_question_id?: string;
  question_text: string;
  question_type: QuestionType;
  options?: string[];
  help_text?: string;
  is_required: boolean;
  validation_rules?: ValidationRules;
  trigger_condition: VisibilityCondition;
  display_order: number;
  created_at: string;
  updated_at: string;
  // Relaciones
  children?: AssessmentSubQuestion[];
}

export interface AssessmentYearExpectation {
  id: string;
  template_id: string;
  indicator_id: string;
  year_1_expected?: number;
  year_1_expected_unit?: FrequencyUnit;
  year_2_expected?: number;
  year_2_expected_unit?: FrequencyUnit;
  year_3_expected?: number;
  year_3_expected_unit?: FrequencyUnit;
  year_4_expected?: number;
  year_4_expected_unit?: FrequencyUnit;
  year_5_expected?: number;
  year_5_expected_unit?: FrequencyUnit;
  tolerance: number;
  created_at: string;
  updated_at: string;
}

// ============================================================
// TEMPLATE SNAPSHOTS
// ============================================================

export interface AssessmentTemplateSnapshot {
  id: string;
  template_id: string;
  version: string;
  snapshot_data: TemplateSnapshotData;
  created_at: string;
  created_by?: string;
}

export interface TemplateSnapshotData {
  template: Omit<AssessmentTemplate, 'modules' | 'context_questions'>;
  context_questions: AssessmentContextQuestion[];
  modules: (AssessmentModule & {
    indicators: (AssessmentIndicator & {
      sub_questions: AssessmentSubQuestion[];
      expectations?: AssessmentYearExpectation;
    })[];
  })[];
}

// ============================================================
// ASSESSMENT INSTANCES
// ============================================================

export interface AssessmentInstance {
  id: string;
  template_snapshot_id: string;
  growth_community_id?: string;
  school_id?: number;
  course_structure_id?: string;
  transformation_year: 1 | 2 | 3 | 4 | 5;
  status: InstanceStatus;
  context_responses?: Record<string, unknown>;
  assigned_at: string;
  assigned_by?: string;
  started_at?: string;
  completed_at?: string;
  created_at: string;
  updated_at: string;
  // Relaciones
  assignees?: AssessmentInstanceAssignee[];
  responses?: AssessmentResponse[];
  snapshot?: AssessmentTemplateSnapshot;
}

export interface AssessmentInstanceAssignee {
  id: string;
  instance_id: string;
  user_id: string;
  can_edit: boolean;
  can_submit: boolean;
  has_started: boolean;
  has_submitted: boolean;
  assigned_at: string;
  assigned_by?: string;
  // Relación
  user?: {
    id: string;
    email: string;
    first_name?: string;
    last_name?: string;
  };
}

export interface AssessmentResponse {
  id: string;
  instance_id: string;
  indicator_id: string;
  coverage_value?: boolean;
  frequency_value?: number;
  frequency_unit?: FrequencyUnit; // Selected unit for frequency responses
  profundity_level?: number;
  rationale?: string;
  evidence_notes?: string;
  sub_responses?: Record<string, unknown>;
  responded_by?: string;
  responded_at: string;
  updated_at: string;
}

export interface AssessmentInstanceResult {
  id: string;
  instance_id: string;
  total_score?: number;
  overall_level?: number;
  module_scores?: ModuleScore[];
  expected_level?: number;
  meets_expectations?: boolean;
  calculated_at: string;
  calculated_by?: string;
}

// ============================================================
// SCORING TYPES
// ============================================================

export interface ModuleScore {
  moduleId: string;
  moduleName: string;
  moduleScore: number;
  moduleWeight: number;
  indicators: IndicatorScore[];
}

export interface IndicatorScore {
  indicatorId: string;
  indicatorName: string;
  category: IndicatorCategory;
  rawValue: boolean | number | undefined;
  normalizedScore: number; // 0-100
  weight: number;
  expectedLevel?: number;
  isAboveExpectation: boolean;
}

export interface AssessmentSummary {
  instanceId: string;
  area: TransformationArea;
  totalScore: number; // 0-100
  moduleScores: ModuleScore[];
  overallLevel: number; // 0-4
  expectedLevel: number; // 0-4 based on year
  transformationYear: 1 | 2 | 3 | 4 | 5;
  completedAt?: string;
}

// ============================================================
// API REQUEST/RESPONSE TYPES
// ============================================================

// Template CRUD
export interface CreateTemplateRequest {
  area: TransformationArea;
  name: string;
  description?: string;
}

export interface UpdateTemplateRequest {
  name?: string;
  description?: string;
  scoring_config?: Partial<ScoringConfig>;
}

// Module CRUD
export interface CreateModuleRequest {
  template_id: string;
  name: string;
  description?: string;
  instructions?: string;
  weight?: number;
}

export interface UpdateModuleRequest {
  name?: string;
  description?: string;
  instructions?: string;
  weight?: number;
}

export interface ReorderModulesRequest {
  module_ids: string[]; // Ordered list of module IDs
}

// Indicator CRUD
export interface CreateIndicatorRequest {
  module_id: string;
  code?: string;
  name: string;
  question?: string;
  description?: string;
  category: IndicatorCategory;
  frequency_config?: FrequencyConfig;
  frequency_unit_options?: FrequencyUnit[];
  level_0_descriptor?: string;
  level_1_descriptor?: string;
  level_2_descriptor?: string;
  level_3_descriptor?: string;
  level_4_descriptor?: string;
  weight?: number;
}

export interface UpdateIndicatorRequest {
  code?: string;
  name?: string;
  question?: string;
  description?: string;
  category?: IndicatorCategory;
  frequency_config?: FrequencyConfig;
  frequency_unit_options?: FrequencyUnit[];
  level_0_descriptor?: string;
  level_1_descriptor?: string;
  level_2_descriptor?: string;
  level_3_descriptor?: string;
  level_4_descriptor?: string;
  weight?: number;
  visibility_condition?: VisibilityCondition;
}

export interface ReorderIndicatorsRequest {
  indicator_ids: string[]; // Ordered list of indicator IDs
}

// Transversal Context
export interface SaveTransversalContextRequest {
  school_id: number;
  total_students: number;
  grade_levels: GradeLevel[];
  courses_per_level: Record<GradeLevel, number>;
  implementation_year_2026: 1 | 2 | 3 | 4 | 5;
  subjects_per_level?: Record<GradeLevel, string[]>;
  generacion_tractor_history?: GenerationHistory[];
  generacion_innova_history?: GenerationHistory[];
  programa_inicia_completed: boolean;
  programa_inicia_hours?: 20 | 40 | 80;
  programa_inicia_year?: number;
  period_system: PeriodSystem;
}

// Course Docente Assignment
export interface AssignDocenteToCourseRequest {
  course_structure_id: string;
  docente_id: string;
}

// Response submission
export interface SaveResponseRequest {
  instance_id: string;
  indicator_id: string;
  coverage_value?: boolean;
  frequency_value?: number;
  frequency_unit?: FrequencyUnit;
  profundity_level?: number;
  rationale?: string;
  evidence_notes?: string;
  sub_responses?: Record<string, unknown>;
}

export interface SaveResponsesRequest {
  instance_id: string;
  responses: Omit<SaveResponseRequest, 'instance_id'>[];
}

// ============================================================
// HELPER TYPES
// ============================================================

export type MaturityLevel = (typeof MATURITY_LEVELS)[number];

export function getMaturityLevel(level: number): MaturityLevel | undefined {
  return MATURITY_LEVELS.find((m) => m.value === level);
}

export function getMaturityLevelLabel(level: number): string {
  return getMaturityLevel(level)?.label ?? 'Desconocido';
}

export function scoreToLevel(normalizedScore: number, config?: ScoringConfig): number {
  const thresholds = config?.level_thresholds ?? {
    consolidated: 87.5,
    advanced: 62.5,
    developing: 37.5,
    emerging: 12.5,
  };

  if (normalizedScore >= thresholds.consolidated) return 4;
  if (normalizedScore >= thresholds.advanced) return 3;
  if (normalizedScore >= thresholds.developing) return 2;
  if (normalizedScore >= thresholds.emerging) return 1;
  return 0;
}

export function levelToScoreRange(
  level: number,
  config?: ScoringConfig
): { min: number; max: number } {
  const thresholds = config?.level_thresholds ?? {
    consolidated: 87.5,
    advanced: 62.5,
    developing: 37.5,
    emerging: 12.5,
  };

  switch (level) {
    case 4:
      return { min: thresholds.consolidated, max: 100 };
    case 3:
      return { min: thresholds.advanced, max: thresholds.consolidated };
    case 2:
      return { min: thresholds.developing, max: thresholds.advanced };
    case 1:
      return { min: thresholds.emerging, max: thresholds.developing };
    default:
      return { min: 0, max: thresholds.emerging };
  }
}

// Check if a grade level requires subject/professional configuration
export function requiresSubjects(gradeLevel: GradeLevel): boolean {
  return GRADES_REQUIRING_SUBJECTS.includes(gradeLevel);
}

// Get expected level for a transformation year
export function getExpectedLevelByYear(year: 1 | 2 | 3 | 4 | 5): number {
  const expectedLevels: Record<number, number> = {
    1: 1, // Año 1: Incipiente
    2: 1, // Año 2: Incipiente-En Desarrollo
    3: 2, // Año 3: En Desarrollo
    4: 3, // Año 4: Avanzado
    5: 3, // Año 5: Avanzado-Consolidado
  };
  return expectedLevels[year];
}
