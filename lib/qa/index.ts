/**
 * QA Testing Utilities
 *
 * Export all QA-related utilities from a single entry point.
 *
 * NOTE: Server-only utilities (notifyQAFailure, getAdminUserIds) are NOT exported here
 * because they depend on notificationService.ts which requires SUPABASE_SERVICE_ROLE_KEY.
 * Import those directly from '@/lib/qa/notifyFailure' in API routes only.
 */

export {
  captureScreenshot,
  captureScreenshotAsDataUrl,
  uploadScreenshotFromDataUrl,
} from './screenshotCapture';

export {
  getBrowserInfo,
  detectEnvironment,
  getExtendedBrowserInfo,
  formatBrowserInfo,
} from './browserInfo';

export {
  generateClaudeCodeExport,
  generateFailureReport,
} from './exportToClaudeCode';

// NOTE: notifyQAFailure and getAdminUserIds are SERVER-ONLY utilities.
// They are NOT exported from this barrel file because they depend on
// notificationService.ts which requires the SUPABASE_SERVICE_ROLE_KEY env var.
// Import them directly: import { notifyQAFailure } from '@/lib/qa/notifyFailure';

export {
  scenarioToMarkdown,
  scenariosToMarkdown,
  parseScenarioFromMarkdown,
  parseScenariosFromMarkdown,
  hasUnconfirmedOutcomes,
  countUnconfirmedOutcomes,
} from './markdownScenarios';

export {
  ROLE_TO_QA_TEST_USER,
  MULTI_USER_TEST_ACCOUNTS,
  getQATestUserForRole,
  getQATestUserByEmail,
  isQATestAccount,
  getAllQATestEmails,
} from './testUserMapping';
export type { QATestUser } from './testUserMapping';
