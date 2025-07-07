#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

// Files to check for role column references
const filesToCheck = [
  // Pages
  'pages/admin/assignment-overview.tsx',
  'pages/admin/configuration.tsx', 
  'pages/admin/consultant-assignments.tsx',
  'pages/admin/course-builder/[courseId]/[moduleId]/[lessonId].tsx',
  'pages/admin/course-builder/[courseId]/[moduleId]/index.tsx',
  'pages/admin/course-builder/[courseId]/edit.tsx',
  'pages/admin/course-builder/[courseId]/index.tsx',
  'pages/admin/course-builder/index.tsx',
  'pages/admin/course-builder/new.tsx',
  'pages/admin/feedback.tsx',
  'pages/admin/schools.tsx',
  'pages/admin/test-session.tsx',
  'pages/admin/user-management.tsx',
  'pages/assignments.tsx',
  'pages/assignments/[id]/index.tsx',
  'pages/assignments/[id]/submissions.tsx',
  'pages/change-password.tsx',
  'pages/community/workspace.tsx',
  'pages/community/workspace/assignments/[id]/discussion.tsx',
  'pages/community/workspace/assignments/[id]/groups.tsx',
  'pages/contract-print/[id].tsx',
  'pages/contracts.tsx',
  'pages/course-manager.tsx',
  'pages/debug-auth-enhanced.tsx',
  'pages/debug-auth.tsx',
  'pages/debug-feedback-permissions.tsx',
  'pages/detailed-reports.tsx',
  'pages/enhanced-reports.tsx',
  'pages/expense-reports.tsx',
  'pages/index.tsx',
  'pages/login.tsx',
  'pages/notifications.tsx',
  'pages/pending-approval.tsx',
  'pages/quiz-reviews.tsx',
  'pages/quiz-reviews/[id].tsx',
  'pages/reports.tsx',
  'pages/student/course/[courseId].tsx',
  'pages/student/lesson/[lessonId].tsx',
  'pages/test-sidebar-role.tsx',
  'pages/user/[userId].tsx',
  // Components
  'components/AssignTeachersModal.tsx',
  'components/ConsultantAssignmentModal.tsx',
  'components/MoveLessonModal.tsx',
  'components/RegistrationModal.tsx',
  'components/RoleAssignmentModal.tsx',
  'components/admin/BulkUserImportModal.tsx',
  'components/admin/FeedbackPermissionsManager.tsx',
  'components/assignments/CreateGroupModal.tsx',
  'components/assignments/GroupSubmissionModalV2.tsx',
  'components/assignments/SimpleGroupSubmissionModal.tsx',
  'components/blocks/BibliographyBlockEditor.tsx',
  'components/blocks/GroupAssignmentBlockEditor.tsx',
  'components/configuration/UserPreferences.tsx',
  'components/contracts/AnnexForm.tsx',
  'components/contracts/CashFlowView.tsx',
  'components/contracts/ContractForm.tsx',
  'components/expenses/ExpenseReportDetails.tsx',
  'components/expenses/ExpenseReportForm.tsx',
  'components/feed/CommentThread.tsx',
  'components/feed/PostCard.tsx',
  'components/feedback/FeedbackButtonWithPermissions.tsx',
  'components/feedback/FeedbackDetail.tsx',
  'components/feedback/FeedbackModal.tsx',
  'components/layout/Sidebar.tsx',
  'components/meetings/MeetingDocumentationModal.tsx',
  'components/notifications/ModernNotificationCenter.tsx',
  'components/notifications/NotificationBell.tsx',
  'components/notifications/NotificationDropdown.tsx',
  'components/quiz/QuizReviewPanel.tsx',
  'components/reports/AdvancedFilters.tsx',
  'components/reports/AnalyticsVisualization.tsx',
  'components/reports/UserDetailModal.tsx',
  'components/student/StudentBlockRenderer.tsx',
  // Contexts
  'contexts/AvatarContext.tsx',
  // Hooks
  'hooks/useAuth.ts',
  'hooks/useAvatar.ts',
  // Utils
  'utils/activityUtils.ts',
  'utils/assignmentFilters.js',
  'utils/documentUtils.ts',
  'utils/meetingUtils.ts',
  'utils/messagingUtils-simple.ts',
  'utils/notificationPermissions.ts',
  'utils/profileUtils.ts',
  'utils/reportFilters.ts',
  'utils/workspaceUtils.ts',
  // Test files
  '__tests__/api/admin/retrieve-import-passwords.test.ts',
  '__tests__/bibliography-image.test.tsx',
  '__tests__/components/feedback/FeedbackDetail.test.tsx',
  '__tests__/components/feedback/FeedbackModal.test.tsx',
  '__tests__/contracts/invoice-deletion.integration.test.tsx',
  '__tests__/contracts/invoice-deletion.test.tsx',
  '__tests__/integration/assignmentOverview.test.js',
  '__tests__/integration/feedback-system.test.ts',
  '__tests__/integration/password-reset-flow.test.tsx',
  '__tests__/lib/services/groupAssignmentsV2Admin.test.js',
  '__tests__/notificationsPage.test.tsx',
  '__tests__/pages/admin/feedback.test.tsx',
  '__tests__/pages/admin/user-management-password-reset.test.tsx',
  '__tests__/pages/api/admin/reset-password.test.ts',
  '__tests__/profileCompletion.test.tsx',
  '__tests__/quizSubmission.integration.test.ts',
  '__tests__/utils/assignmentFilters.test.js',
  'vitest.setup.ts'
];

async function checkFile(filePath) {
  try {
    const fullPath = path.join(process.cwd(), filePath);
    if (!fs.existsSync(fullPath)) {
      console.log(`❌ File not found: ${filePath}`);
      return;
    }
    
    const content = fs.readFileSync(fullPath, 'utf-8');
    
    // Patterns to look for
    const patterns = [
      /\.select\([^)]*\brole\b/g,  // .select() with 'role'
      /profileData\.role/g,         // profileData.role
      /profile\.role/g,              // profile.role
      /data\.role/g,                 // data.role
      /user\.role/g,                 // user.role (but not user.role_type)
      /\.role\s*[!=<>]/g,           // .role with comparison operators
    ];
    
    let foundIssues = false;
    patterns.forEach(pattern => {
      const matches = content.match(pattern);
      if (matches) {
        // Filter out false positives
        const filteredMatches = matches.filter(match => {
          // Exclude user_roles table references
          if (match.includes('user_roles')) return false;
          // Exclude role_type references
          if (match.includes('role_type')) return false;
          // Exclude role-based references like 'role_id'
          if (match.includes('role_id')) return false;
          return true;
        });
        
        if (filteredMatches.length > 0) {
          foundIssues = true;
          console.log(`\n⚠️  ${filePath}`);
          console.log(`   Found ${filteredMatches.length} potential role column reference(s):`);
          filteredMatches.forEach(match => {
            console.log(`   - "${match}"`);
          });
        }
      }
    });
    
    if (!foundIssues) {
      console.log(`✅ ${filePath} - No role column references found`);
    }
    
  } catch (error) {
    console.error(`Error checking ${filePath}:`, error.message);
  }
}

async function main() {
  console.log('Checking for legacy role column references...\n');
  
  for (const file of filesToCheck) {
    await checkFile(file);
  }
  
  console.log('\n\nSummary:');
  console.log('- Files with ⚠️  need to be updated to use getUserPrimaryRole() instead');
  console.log('- Files with ✅ are already clean');
  console.log('\nTo fix issues:');
  console.log('1. Import getUserPrimaryRole from utils/roleUtils');
  console.log('2. Replace profile queries that include "role" field');
  console.log('3. Use getUserPrimaryRole(userId) to get user role');
}

main().catch(console.error);