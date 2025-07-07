#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

// Files that might have getUserPrimaryRole imports
const filesToCheck = [
  'pages/admin/course-builder/[courseId]/[moduleId]/index.tsx',
  'pages/admin/course-builder/[courseId]/edit.tsx',
  'pages/admin/course-builder/[courseId]/index.tsx',
  'pages/admin/course-builder/index.tsx',
  'pages/admin/course-builder/new.tsx',
  'pages/assignments/[id]/index.tsx',
  'pages/assignments/[id]/submissions.tsx',
  'pages/student/course/[courseId].tsx',
  'pages/student/lesson/[lessonId].tsx',
  'pages/expense-reports.tsx',
  'pages/reports.tsx',
  'pages/assignments.tsx',
  'pages/user/[userId].tsx',
  'pages/course-manager.tsx',
  'pages/notifications.tsx',
  'pages/contracts.tsx',
  'pages/enhanced-reports.tsx',
  'pages/detailed-reports.tsx',
  'pages/admin/consultant-assignments.tsx',
  'pages/admin/user-management.tsx'
];

// Calculate correct import path based on file location
function getCorrectImportPath(filePath) {
  const parts = filePath.split('/');
  const depth = parts.length - 1; // -1 because we don't count the filename
  
  if (depth === 1) {
    // pages/file.tsx -> ../utils/roleUtils
    return '../utils/roleUtils';
  } else if (depth === 2) {
    // pages/admin/file.tsx -> ../../utils/roleUtils
    return '../../utils/roleUtils';
  } else if (depth === 3) {
    // pages/admin/course-builder/file.tsx -> ../../../utils/roleUtils
    // pages/assignments/[id]/file.tsx -> ../../../utils/roleUtils
    return '../../../utils/roleUtils';
  } else if (depth === 4) {
    // pages/admin/course-builder/[courseId]/file.tsx -> ../../../../utils/roleUtils
    return '../../../../utils/roleUtils';
  } else if (depth === 5) {
    // pages/admin/course-builder/[courseId]/[moduleId]/file.tsx -> ../../../../../utils/roleUtils
    return '../../../../../utils/roleUtils';
  }
  return '../utils/roleUtils';
}

console.log('Checking import paths for getUserPrimaryRole...\n');

filesToCheck.forEach(filePath => {
  try {
    const fullPath = path.join(process.cwd(), filePath);
    if (!fs.existsSync(fullPath)) {
      console.log(`⏭️  ${filePath} - File not found`);
      return;
    }
    
    const content = fs.readFileSync(fullPath, 'utf-8');
    const importMatch = content.match(/import\s+{[^}]*getUserPrimaryRole[^}]*}\s+from\s+['"]([^'"]+)['"]/);
    
    if (importMatch) {
      const currentImportPath = importMatch[1];
      const correctPath = getCorrectImportPath(filePath);
      
      if (currentImportPath === correctPath) {
        console.log(`✅ ${filePath}`);
      } else {
        console.log(`❌ ${filePath}`);
        console.log(`   Current:  "${currentImportPath}"`);
        console.log(`   Should be: "${correctPath}"`);
      }
    } else {
      console.log(`⚠️  ${filePath} - No getUserPrimaryRole import found`);
    }
  } catch (error) {
    console.error(`Error checking ${filePath}:`, error.message);
  }
});

console.log('\nDone checking imports.');