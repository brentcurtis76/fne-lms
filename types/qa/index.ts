/**
 * QA Testing System Types
 *
 * Types for the guided QA testing component that captures
 * console logs, network requests, and screenshots for debugging.
 */

// ============================================================
// SCENARIO TYPES
// ============================================================

export interface QAScenarioStep {
  index: number;
  instruction: string; // What to do
  expectedOutcome: string; // What should happen
  route?: string; // Expected URL (optional)
  elementToCheck?: string; // CSS selector to verify (optional)
  captureOnFail: boolean; // Whether to auto-capture on failure
  captureOnPass: boolean; // Whether to capture even on success
  // Multi-user scenario support
  actor?: string; // e.g., 'User A - Tab 1', 'User B - Tab 2'
  tabIndicator?: number; // 1, 2, 3 - which browser tab this step should be performed in
}

export interface QAPrecondition {
  type: 'role' | 'data' | 'navigation' | 'custom';
  description: string;
  value?: string;
}

export interface QAScenario {
  id: string;
  name: string;
  description: string | null;
  feature_area: FeatureArea;
  role_required: string;
  preconditions: QAPrecondition[];
  steps: QAScenarioStep[];
  created_at: string;
  updated_at: string;
  created_by: string | null;
  is_active: boolean;
  priority: number; // 1=critical, 2=high, 3=medium, 4=low
  estimated_duration_minutes: number;
  automated_only: boolean; // If true, requires Playwright (tests logged-out behavior)
  testing_channel: 'automation' | 'human' | 'not_applicable';
  is_multi_user?: boolean; // If true, scenario requires multiple users in different browser tabs
}

// ============================================================
// TEST RUN TYPES
// ============================================================

export type TestRunStatus = 'in_progress' | 'completed' | 'aborted';
export type TestRunResult = 'pass' | 'fail' | 'partial';
export type TestEnvironment = 'local' | 'staging' | 'production';

export interface BrowserInfo {
  userAgent: string;
  viewport: { width: number; height: number };
  language: string;
  platform: string;
}

export interface QATestRun {
  id: string;
  scenario_id: string;
  tester_id: string;
  role_used: string;
  status: TestRunStatus;
  started_at: string;
  completed_at: string | null;
  environment: TestEnvironment;
  browser_info: BrowserInfo | null;
  overall_result: TestRunResult | null;
  notes: string | null;
  // Joined data
  scenario?: QAScenario;
  tester?: { email: string; first_name: string; last_name: string };
  step_results?: QAStepResult[];
}

// ============================================================
// CAPTURE TYPES
// ============================================================

export type ConsoleLogLevel = 'log' | 'warn' | 'error' | 'info' | 'debug';

export interface ConsoleLogEntry {
  level: ConsoleLogLevel;
  message: string;
  timestamp: string;
  stack?: string;
}

export interface NetworkLogEntry {
  method: string;
  url: string;
  status: number | null;
  statusText: string | null;
  duration: number | null;
  requestBody?: unknown;
  responseBody?: unknown;
  error?: string;
  timestamp: string;
}

export interface QAStepResult {
  id: string;
  test_run_id: string;
  step_index: number;
  step_instruction: string;
  expected_outcome: string;
  passed: boolean | null;
  tester_note: string | null;
  console_logs: ConsoleLogEntry[];
  network_logs: NetworkLogEntry[];
  screenshot_url: string | null;
  dom_snapshot: string | null;
  current_url: string | null;
  captured_at: string;
  time_spent_seconds: number | null;
}

// ============================================================
// CLAUDE CODE INTEGRATION TYPES
// ============================================================

export interface QAFailureReport {
  scenario: {
    name: string;
    feature_area: FeatureArea;
    role_required: string;
  };
  test_run: {
    id: string;
    tester: string;
    environment: TestEnvironment;
    started_at: string;
  };
  failed_step: {
    index: number;
    instruction: string;
    expected_outcome: string;
    tester_note: string | null;
  };
  captured_data: {
    console_errors: ConsoleLogEntry[];
    failed_requests: NetworkLogEntry[];
    screenshot_url: string | null;
    current_url: string;
    role_used: string;
  };
  context: {
    previous_steps_passed: number;
    total_steps: number;
  };
}

// ============================================================
// FEATURE AREAS
// ============================================================

export type FeatureArea =
  | 'authentication'
  | 'user_management'
  | 'role_assignment'
  | 'school_management'
  | 'course_builder'
  | 'course_enrollment'
  | 'course_management'
  | 'assessment_builder'
  | 'transformation_assessment'
  | 'quiz_submission'
  | 'reporting'
  | 'network_management'
  | 'community_workspace'
  | 'collaborative_space'
  | 'navigation'
  | 'docente_experience'
  | 'consultor_sessions'
  | 'licitaciones'
  | 'hour_tracking';

export const FEATURE_AREA_LABELS: Record<FeatureArea, string> = {
  authentication: 'Autenticación',
  user_management: 'Gestión de Usuarios',
  role_assignment: 'Asignación de Roles',
  school_management: 'Gestión de Colegios',
  course_builder: 'Constructor de Cursos',
  course_enrollment: 'Inscripción a Cursos',
  course_management: 'Gestión de Cursos',
  assessment_builder: 'Constructor de Evaluaciones',
  transformation_assessment: 'Evaluación de Transformación',
  quiz_submission: 'Envío de Quizzes',
  reporting: 'Reportes',
  network_management: 'Gestión de Redes',
  community_workspace: 'Espacio de Comunidad',
  collaborative_space: 'Espacio Colaborativo',
  navigation: 'Navegación / Sidebar',
  docente_experience: 'Experiencia Docente',
  consultor_sessions: 'Consultorías',
  licitaciones: 'Licitaciones',
  hour_tracking: 'Control de Horas',
};

export const PRIORITY_LABELS: Record<number, string> = {
  1: 'Crítico',
  2: 'Alto',
  3: 'Medio',
  4: 'Bajo',
};

export const PRIORITY_COLORS: Record<number, string> = {
  1: 'text-red-600 bg-red-100',
  2: 'text-orange-600 bg-orange-100',
  3: 'text-yellow-600 bg-yellow-100',
  4: 'text-gray-600 bg-gray-100',
};

// ============================================================
// API REQUEST/RESPONSE TYPES
// ============================================================

export interface CreateScenarioRequest {
  name: string;
  description?: string;
  feature_area: FeatureArea;
  role_required: string;
  preconditions: QAPrecondition[];
  steps: QAScenarioStep[];
  priority?: number;
  estimated_duration_minutes?: number;
  is_multi_user?: boolean;
}

export interface UpdateScenarioRequest {
  name?: string;
  description?: string;
  feature_area?: FeatureArea;
  role_required?: string;
  preconditions?: QAPrecondition[];
  steps?: QAScenarioStep[];
  priority?: number;
  estimated_duration_minutes?: number;
  is_active?: boolean;
  automated_only?: boolean;
  is_multi_user?: boolean;
}

export interface StartTestRunRequest {
  scenario_id: string;
  environment?: TestEnvironment;
  browser_info?: BrowserInfo;
}

export interface SaveStepResultRequest {
  test_run_id: string;
  step_index: number;
  step_instruction: string;
  expected_outcome: string;
  passed: boolean | null;
  tester_note?: string;
  console_logs?: ConsoleLogEntry[];
  network_logs?: NetworkLogEntry[];
  screenshot_url?: string;
  dom_snapshot?: string;
  current_url?: string;
  time_spent_seconds?: number;
}

export interface CompleteTestRunRequest {
  overall_result: TestRunResult;
  notes?: string;
}

export interface ImportScenariosRequest {
  scenarios: CreateScenarioRequest[];
}

export interface ImportScenariosResponse {
  imported: number;
  skipped: number;
  errors: string[];
}

// ============================================================
// HOOK TYPES
// ============================================================

export interface CaptureState {
  consoleLogs: ConsoleLogEntry[];
  networkLogs: NetworkLogEntry[];
  isCapturing: boolean;
}

export interface UseQACaptureReturn {
  startCapture: () => void;
  stopCapture: () => void;
  getCapture: () => { consoleLogs: ConsoleLogEntry[]; networkLogs: NetworkLogEntry[] };
  clearCapture: () => void;
  isCapturing: boolean;
}
