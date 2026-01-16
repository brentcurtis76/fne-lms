/**
 * QA Test Failure Notification Utility
 *
 * Sends notifications to admin users when a QA test step fails.
 * Integrates with the existing notificationService.ts infrastructure.
 */

import notificationService from '@/lib/notificationService';
import type { QATestRun, QAStepResult, FeatureArea } from '@/types/qa';
import { FEATURE_AREA_LABELS } from '@/types/qa';

export interface QAFailureEventData {
  test_run_id: string;
  scenario_name: string;
  feature_area: FeatureArea;
  step_index: number;
  step_instruction: string;
  expected_outcome: string;
  tester_note?: string | null;
  tester_email: string;
  environment: string;
  screenshot_url?: string | null;
  admin_user_ids: string[];
  [key: string]: unknown; // Allow for Record<string, unknown> compatibility
}

/**
 * Notify admin users about a QA test failure.
 *
 * @param testRun - The test run that contains the failure
 * @param failedStep - The step result that failed
 * @param adminUserIds - List of admin user IDs to notify
 */
export async function notifyQAFailure(
  testRun: QATestRun,
  failedStep: QAStepResult,
  adminUserIds: string[]
): Promise<{ success: boolean; notificationsCreated?: number; error?: string }> {
  if (!adminUserIds || adminUserIds.length === 0) {
    console.log('⚠️ No admin users to notify about QA failure');
    return { success: true, notificationsCreated: 0 };
  }

  const scenario = testRun.scenario;
  const tester = testRun.tester as { email: string } | undefined;

  const eventData: QAFailureEventData = {
    test_run_id: testRun.id,
    scenario_name: scenario?.name || 'Unknown scenario',
    feature_area: (scenario?.feature_area || 'authentication') as FeatureArea,
    step_index: failedStep.step_index,
    step_instruction: failedStep.step_instruction,
    expected_outcome: failedStep.expected_outcome,
    tester_note: failedStep.tester_note,
    tester_email: tester?.email || 'Unknown tester',
    environment: testRun.environment,
    screenshot_url: failedStep.screenshot_url,
    admin_user_ids: adminUserIds,
  };

  try {
    const result = await notificationService.triggerNotification(
      'qa_test_failed',
      eventData
    );

    return result;
  } catch (error: any) {
    console.error('❌ Failed to send QA failure notification:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Get all admin user IDs for QA failure notifications.
 * This is called by the step-results API to get recipients.
 */
export async function getAdminUserIds(
  supabaseClient: any
): Promise<string[]> {
  try {
    const { data: adminRoles, error } = await supabaseClient
      .from('user_roles')
      .select('user_id')
      .eq('role_type', 'admin')
      .eq('is_active', true);

    if (error) {
      console.error('Error fetching admin users:', error);
      return [];
    }

    // Get unique user IDs
    const userIds = [...new Set(adminRoles?.map((r: any) => r.user_id) || [])];
    return userIds as string[];
  } catch (error) {
    console.error('Exception fetching admin users:', error);
    return [];
  }
}

export default notifyQAFailure;
