/**
 * Claude Code Export Utility
 *
 * Generates structured markdown prompts from failed test runs
 * for debugging with Claude Code.
 */

import type {
  QATestRun,
  QAStepResult,
  QAFailureReport,
  ConsoleLogEntry,
  NetworkLogEntry,
  FeatureArea,
} from '@/types/qa';
import { FEATURE_AREA_LABELS } from '@/types/qa';

// Map feature areas to likely relevant files
const FEATURE_FILE_MAP: Record<FeatureArea, string[]> = {
  authentication: [
    'contexts/AuthContext.tsx',
    'lib/api-auth.ts',
    'pages/login.tsx',
    'pages/api/auth/*',
  ],
  user_management: [
    'pages/admin/user-management.tsx',
    'pages/api/admin/create-user.ts',
    'pages/api/admin/bulk-create-users.ts',
    'components/admin/UnifiedUserManagement.tsx',
  ],
  role_assignment: [
    'pages/api/admin/assign-role.ts',
    'pages/api/admin/remove-role.ts',
    'utils/roleUtils.ts',
    'pages/admin/role-management.tsx',
  ],
  school_management: [
    'pages/admin/schools.tsx',
    'pages/api/admin/schools.ts',
  ],
  course_builder: [
    'pages/admin/course-builder/*',
    'pages/api/admin/courses/*',
  ],
  course_enrollment: [
    'pages/api/admin/course-assignments.ts',
    'pages/mi-aprendizaje.tsx',
  ],
  course_management: [
    'pages/admin/course-builder/*',
    'pages/api/admin/courses/*',
    'pages/courses/[id].tsx',
  ],
  assessment_builder: [
    'pages/admin/assessment-builder/*',
    'pages/api/admin/assessment-builder/*',
  ],
  transformation_assessment: [
    'pages/community/transformation/*',
    'pages/api/transformation/*',
    'lib/transformation/*',
  ],
  quiz_submission: [
    'pages/courses/[id].tsx',
    'pages/api/quiz/*',
    'components/quiz/*',
  ],
  reporting: [
    'pages/reports.tsx',
    'pages/admin/new-reporting.tsx',
  ],
  network_management: [
    'pages/admin/network-management.tsx',
    'pages/api/admin/networks/*',
  ],
  community_workspace: [
    'pages/community/workspace/*',
    'components/community/*',
  ],
  collaborative_space: [
    'pages/community/workspace/*',
    'components/community/*',
    'components/workspace/*',
    'utils/messagingUtils-simple.ts',
    'pages/api/assignments/*',
    'pages/api/messaging/*',
  ],
  navigation: [
    'components/layout/Sidebar.tsx',
    'components/layout/MainLayout.tsx',
  ],
  docente_experience: [
    'pages/mi-aprendizaje.tsx',
    'pages/mi-aprendizaje/*',
    'pages/docente/*',
    'pages/student/*',
  ],
  consultor_sessions: [
    'pages/admin/sessions/*',
    'pages/consultor/sessions/*',
    'pages/api/sessions/*',
    'components/sessions/*',
    'components/workspace/WorkspaceSessionsTab.tsx',
    'lib/types/consultor-sessions.types.ts',
    'lib/utils/session-ui-helpers.tsx',
    'lib/utils/session-timezone.ts',
    'lib/utils/recurrence.ts',
  ],
  licitaciones: [
    'pages/licitaciones/*',
    'pages/api/licitaciones/*',
    'lib/licitacionService.ts',
    'types/licitaciones.ts',
    'lib/businessDays.ts',
  ],
};

/**
 * Generates a structured markdown prompt for Claude Code debugging.
 */
export function generateClaudeCodeExport(
  testRun: QATestRun,
  failedStep: QAStepResult
): string {
  const scenario = testRun.scenario;
  const tester = testRun.tester as any;

  // Filter for errors only
  const consoleErrors = failedStep.console_logs?.filter(
    (log) => log.level === 'error' || log.level === 'warn'
  ) || [];

  const failedRequests = failedStep.network_logs?.filter(
    (log) => log.status === null || (log.status && log.status >= 400)
  ) || [];

  // Get relevant files based on feature area
  const featureArea = scenario?.feature_area as FeatureArea;
  const relevantFiles = featureArea
    ? FEATURE_FILE_MAP[featureArea] || []
    : [];

  // Build the markdown
  let markdown = `## QA Failure Report - Debug Request

### Scenario
- **Name:** ${scenario?.name || 'Unknown'}
- **Feature:** ${featureArea ? FEATURE_AREA_LABELS[featureArea] : 'Unknown'}
- **Role Required:** ${scenario?.role_required || 'Unknown'}

### Test Run Info
- **Run ID:** ${testRun.id}
- **Tester:** ${tester?.email || 'Unknown'}
- **Environment:** ${testRun.environment}
- **Started:** ${new Date(testRun.started_at).toISOString()}

### Failed Step
- **Step ${failedStep.step_index}:** ${failedStep.step_instruction}
- **Expected:** ${failedStep.expected_outcome}
`;

  if (failedStep.tester_note) {
    markdown += `- **Tester Observation:** ${failedStep.tester_note}\n`;
  }

  markdown += `
### Captured Context
- **Role Used:** ${testRun.role_used}
- **Current URL:** ${failedStep.current_url || 'Unknown'}
- **Browser:** ${testRun.browser_info?.userAgent?.split(' ')[0] || 'Unknown'}
- **Viewport:** ${testRun.browser_info?.viewport?.width || '?'}x${testRun.browser_info?.viewport?.height || '?'}
`;

  // Console Errors
  if (consoleErrors.length > 0) {
    markdown += `
### Console Errors
\`\`\`
`;
    consoleErrors.forEach((log) => {
      markdown += `[${log.level.toUpperCase()}] ${log.message}\n`;
      if (log.stack) {
        markdown += `Stack: ${log.stack}\n`;
      }
    });
    markdown += `\`\`\`
`;
  }

  // Failed Network Requests
  if (failedRequests.length > 0) {
    markdown += `
### Failed Network Requests
\`\`\`
`;
    failedRequests.forEach((req) => {
      markdown += `${req.method} ${req.url}\n`;
      markdown += `Status: ${req.status || 'ERROR'} ${req.statusText || ''}\n`;
      if (req.error) {
        markdown += `Error: ${req.error}\n`;
      }
      if (req.responseBody) {
        const body = typeof req.responseBody === 'string'
          ? req.responseBody
          : JSON.stringify(req.responseBody, null, 2);
        markdown += `Response: ${body.substring(0, 500)}${body.length > 500 ? '...' : ''}\n`;
      }
      markdown += '\n';
    });
    markdown += `\`\`\`
`;
  }

  // Screenshot
  if (failedStep.screenshot_url) {
    markdown += `
### Screenshot
[View Screenshot](${failedStep.screenshot_url})
`;
  }

  // Related Files
  if (relevantFiles.length > 0) {
    markdown += `
### Related Files
Based on the feature area (${featureArea ? FEATURE_AREA_LABELS[featureArea] : 'Unknown'}), check:
`;
    relevantFiles.forEach((file) => {
      markdown += `- \`${file}\`\n`;
    });
  }

  markdown += `
### Request
Please debug this failure and propose a fix. Consider:
1. Check the console errors for stack traces
2. Review failed API requests for error responses
3. Verify the user role has proper permissions
4. Check if the expected DOM elements exist

If you need more context, ask for specific file contents.
`;

  return markdown;
}

/**
 * Generates a failure report object for API use.
 */
export function generateFailureReport(
  testRun: QATestRun,
  failedStep: QAStepResult
): QAFailureReport {
  const scenario = testRun.scenario;
  const tester = testRun.tester as any;

  const consoleErrors = failedStep.console_logs?.filter(
    (log) => log.level === 'error'
  ) || [];

  const failedRequests = failedStep.network_logs?.filter(
    (log) => log.status === null || (log.status && log.status >= 400)
  ) || [];

  // Count previous passed steps
  const previousStepsPassed = testRun.step_results?.filter(
    (r) => r.step_index < failedStep.step_index && r.passed
  ).length || 0;

  const totalSteps = scenario?.steps?.length || 0;

  return {
    scenario: {
      name: scenario?.name || 'Unknown',
      feature_area: scenario?.feature_area || 'authentication',
      role_required: scenario?.role_required || 'Unknown',
    },
    test_run: {
      id: testRun.id,
      tester: tester?.email || 'Unknown',
      environment: testRun.environment,
      started_at: testRun.started_at,
    },
    failed_step: {
      index: failedStep.step_index,
      instruction: failedStep.step_instruction,
      expected_outcome: failedStep.expected_outcome,
      tester_note: failedStep.tester_note,
    },
    captured_data: {
      console_errors: consoleErrors,
      failed_requests: failedRequests,
      screenshot_url: failedStep.screenshot_url,
      current_url: failedStep.current_url || 'Unknown',
      role_used: testRun.role_used,
    },
    context: {
      previous_steps_passed: previousStepsPassed,
      total_steps: totalSteps,
    },
  };
}

export default generateClaudeCodeExport;
