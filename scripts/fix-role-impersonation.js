#!/usr/bin/env node

/**
 * Script to help identify pages that need role impersonation fixes
 * This script identifies pages that:
 * 1. Check profileData.role directly instead of using getEffectiveRoleAndStatus
 * 2. Don't pass userRole prop to MainLayout
 */

const fs = require('fs');
const path = require('path');
const glob = require('glob');

const pagesDir = path.join(__dirname, '..', 'pages');

// Pages that need to be fixed
const pagesToFix = [
  'enhanced-reports.tsx',
  'reports.tsx',
  'course-manager.tsx',
  'student/lesson/[lessonId].tsx',
  'student/course/[courseId].tsx',
  'admin/schools.tsx',
  'admin/consultant-assignments.tsx',
  'admin/user-management.tsx',
  'admin/configuration.tsx',
  'admin/course-builder/index.tsx',
  'admin/course-builder/[courseId]/index.tsx',
  'admin/course-builder/[courseId]/[moduleId]/index.tsx',
  'admin/course-builder/[courseId]/[moduleId]/[lessonId].tsx',
  'assignments.tsx',
  'assignments/[id]/index.tsx',
  'assignments/[id]/submissions.tsx',
  'quiz-reviews.tsx',
  'quiz-reviews/[id].tsx',
  'contracts.tsx',
  'expense-reports.tsx',
  'profile.tsx',
  'user/[userId].tsx',
  'community/workspace.tsx',
  'community/workspace/assignments/[id]/groups.tsx',
  'community/workspace/assignments/[id]/discussion.tsx',
  'notifications.tsx'
];

console.log('Pages that need role impersonation fixes:\n');

pagesToFix.forEach((page, index) => {
  const fullPath = path.join(pagesDir, page);
  if (fs.existsSync(fullPath)) {
    const content = fs.readFileSync(fullPath, 'utf8');
    
    const issues = [];
    
    // Check for direct profile.role or profileData.role checks
    if (content.includes('profileData.role') || content.includes('profile.role')) {
      issues.push('Uses direct profile.role check');
    }
    
    // Check if getEffectiveRoleAndStatus is imported
    if (!content.includes('getEffectiveRoleAndStatus')) {
      issues.push('Missing getEffectiveRoleAndStatus import');
    }
    
    // Check if userRole is passed to MainLayout
    const mainLayoutMatch = content.match(/<MainLayout[\s\S]*?>/g);
    if (mainLayoutMatch && !mainLayoutMatch[0].includes('userRole=')) {
      issues.push('MainLayout missing userRole prop');
    }
    
    if (issues.length > 0) {
      console.log(`${index + 1}. ${page}`);
      issues.forEach(issue => console.log(`   - ${issue}`));
      console.log('');
    }
  }
});

console.log('\nTo fix these pages:');
console.log('1. Import getEffectiveRoleAndStatus from utils/roleUtils');
console.log('2. Replace direct profile.role checks with getEffectiveRoleAndStatus');
console.log('3. Add userRole state and pass it to MainLayout');
console.log('\nExample fix:');
console.log(`
// Import the utility
import { getEffectiveRoleAndStatus } from '../utils/roleUtils';

// Add state
const [userRole, setUserRole] = useState<string>('');

// Replace role check
// OLD: const isAdminUser = profileData.role === 'admin';
// NEW:
const { effectiveRole, isAdmin: isAdminUser } = await getEffectiveRoleAndStatus(session.user.id);
setUserRole(effectiveRole);
setIsAdmin(isAdminUser);

// Add to MainLayout
<MainLayout
  ...
  userRole={userRole}
  ...
>
`);