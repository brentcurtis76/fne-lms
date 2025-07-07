#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

// List of files from our grep search
const filesToRefactor = [
  'utils/workspaceUtils.ts',
  'utils/roleUtils.ts',
  'utils/profileUtils.ts',
  'utils/documentUtils.ts',
  'pages/reports.tsx',
  'pages/pending-approval.tsx',
  'pages/index.tsx',
  'pages/detailed-reports.tsx',
  'pages/course-manager.tsx',
  'pages/change-password.tsx',
  'pages/admin/test-session.tsx',
  'hooks/useAvatar.ts',
  'hooks/useAuth.ts',
  'contexts/AvatarContext.tsx',
  'components/RoleAssignmentModal.tsx',
  'components/ConsultantAssignmentModal.tsx',
  '__tests__/roleUtils.dev.test.ts',
  'utils/meetingUtils.ts',
  'pages/quiz-reviews.tsx',
  'pages/notifications.tsx',
  'pages/expense-reports.tsx',
  'pages/contracts.tsx',
  'pages/assignments.tsx',
  'components/quiz/QuizReviewPanel.tsx',
  'components/assignments/SimpleGroupSubmissionModal.tsx',
  'components/RegistrationModal.tsx',
  'components/MoveLessonModal.tsx',
  'components/AssignTeachersModal.tsx',
  'utils/assignmentFilters.js',
  'pages/debug-feedback-permissions.tsx',
  '__tests__/notificationsPage.test.tsx',
  'utils/notificationPermissions.ts',
  'components/blocks/BibliographyBlockEditor.tsx',
  'components/student/StudentBlockRenderer.tsx',
  'utils/messagingUtils-simple.ts',
  'components/blocks/GroupAssignmentBlockEditor.tsx',
  '__tests__/quizSubmission.integration.test.ts',
  '__tests__/components/assignments/GroupSubmissionModalV2.test.tsx',
  'components/feed/PostCard.tsx',
  'components/feed/CommentThread.tsx',
  'utils/reportFilters.ts',
  'pages/enhanced-reports.tsx',
  '__tests__/lib/services/groupAssignmentsV2.test.js',
  '__tests__/components/blocks/GroupAssignmentBlockEditor.test.tsx',
  '__tests__/components/blocks/BibliographyBlockEditor.test.tsx',
  'pages/test-sidebar-role.tsx',
  'pages/debug-auth-enhanced.tsx',
  'pages/debug-auth.tsx',
  'utils/activityUtils.ts'
];

// Utility files that need special handling (pass supabase as parameter)
const utilityFiles = [
  'utils/workspaceUtils.ts',
  'utils/roleUtils.ts',
  'utils/profileUtils.ts',
  'utils/documentUtils.ts',
  'utils/meetingUtils.ts',
  'utils/assignmentFilters.js',
  'utils/notificationPermissions.ts',
  'utils/messagingUtils-simple.ts',
  'utils/reportFilters.ts',
  'utils/activityUtils.ts'
];

// Test files that may need special handling
const testFiles = [
  '__tests__/roleUtils.dev.test.ts',
  '__tests__/notificationsPage.test.tsx',
  '__tests__/quizSubmission.integration.test.ts',
  '__tests__/components/assignments/GroupSubmissionModalV2.test.tsx',
  '__tests__/lib/services/groupAssignmentsV2.test.js',
  '__tests__/components/blocks/GroupAssignmentBlockEditor.test.tsx',
  '__tests__/components/blocks/BibliographyBlockEditor.test.tsx'
];

console.log('Starting Supabase import refactoring...\n');

let reactComponentsFixed = 0;
let utilityFilesFound = 0;
let testFilesFound = 0;
let errors = 0;

filesToRefactor.forEach(file => {
  const filePath = path.join(process.cwd(), file);
  
  if (!fs.existsSync(filePath)) {
    console.log(`⚠️  File not found: ${file}`);
    errors++;
    return;
  }

  if (utilityFiles.includes(file)) {
    console.log(`📁 UTILITY FILE: ${file} - Needs manual refactoring to accept supabase as parameter`);
    utilityFilesFound++;
    return;
  }

  if (testFiles.includes(file)) {
    console.log(`🧪 TEST FILE: ${file} - May need special handling for test environment`);
    testFilesFound++;
    return;
  }

  // For React components/pages/hooks
  try {
    let content = fs.readFileSync(filePath, 'utf8');
    
    // Skip if already refactored
    if (content.includes('@supabase/auth-helpers-react')) {
      console.log(`✅ Already refactored: ${file}`);
      return;
    }

    // Check if it imports from lib/supabase
    if (!content.includes("from '../lib/supabase'") && 
        !content.includes('from "../../lib/supabase"') &&
        !content.includes("from '../../lib/supabase'") &&
        !content.includes("from './lib/supabase'") &&
        !content.includes("from '@/lib/supabase'")) {
      console.log(`⏩ No supabase import found: ${file}`);
      return;
    }

    console.log(`🔧 Refactoring React component: ${file}`);
    
    // Replace the import statement
    content = content.replace(
      /import\s*{\s*supabase\s*}\s*from\s*['"][^'"]*lib\/supabase['"]/g,
      "import { useSupabaseClient } from '@supabase/auth-helpers-react'"
    );

    // Find the component/hook function and add the hook
    // This is a simplified pattern - may need manual adjustment
    const componentPatterns = [
      /export\s+default\s+function\s+(\w+)\s*\([^)]*\)\s*{/,
      /export\s+function\s+(\w+)\s*\([^)]*\)\s*{/,
      /const\s+(\w+)\s*[:=]\s*\([^)]*\)\s*=>\s*{/,
      /function\s+(\w+)\s*\([^)]*\)\s*{/
    ];

    let hookAdded = false;
    for (const pattern of componentPatterns) {
      const match = content.match(pattern);
      if (match) {
        const indentMatch = content.match(new RegExp(`(\\s*)${pattern.source}`));
        const indent = indentMatch ? indentMatch[1] : '';
        const nextIndent = indent + '  ';
        
        content = content.replace(pattern, (fullMatch) => {
          return fullMatch + `\n${nextIndent}const supabase = useSupabaseClient();`;
        });
        hookAdded = true;
        break;
      }
    }

    if (!hookAdded) {
      console.log(`⚠️  Could not automatically add hook to: ${file} - Manual intervention needed`);
    } else {
      fs.writeFileSync(filePath, content);
      console.log(`✅ Fixed: ${file}`);
      reactComponentsFixed++;
    }

  } catch (err) {
    console.log(`❌ Error processing ${file}: ${err.message}`);
    errors++;
  }
});

console.log('\n📊 Summary:');
console.log(`- React components automatically fixed: ${reactComponentsFixed}`);
console.log(`- Utility files needing manual refactoring: ${utilityFilesFound}`);
console.log(`- Test files needing review: ${testFilesFound}`);
console.log(`- Errors: ${errors}`);

console.log('\n📝 Next steps:');
console.log('1. Review and test the automatically refactored React components');
console.log('2. Manually refactor utility files to accept supabase client as parameter');
console.log('3. Update test files as needed');
console.log('4. Run the application to ensure everything works correctly');