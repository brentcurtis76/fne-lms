#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

// Files that need to be fixed
const filesToFix = [
  'pages/expense-reports.tsx',
  'pages/reports.tsx',
  'pages/assignments/[id]/index.tsx',
  'pages/assignments/[id]/submissions.tsx',
  'pages/student/course/[courseId].tsx',
  'pages/student/lesson/[lessonId].tsx',
  'pages/admin/consultant-assignments.tsx',
  'pages/admin/course-builder/index.tsx',
  'pages/admin/course-builder/[courseId]/index.tsx',
  'pages/admin/course-builder/[courseId]/[moduleId]/index.tsx',
  'pages/admin/course-builder/[courseId]/edit.tsx',
  'pages/admin/course-builder/new.tsx',
  'pages/assignments.tsx',
  'pages/user/[userId].tsx',
  'pages/course-manager.tsx',
  'pages/notifications.tsx',
  'pages/contracts.tsx',
  'pages/enhanced-reports.tsx',
  'pages/detailed-reports.tsx'
];

async function fixFile(filePath) {
  try {
    const fullPath = path.join(process.cwd(), filePath);
    if (!fs.existsSync(fullPath)) {
      console.log(`❌ File not found: ${filePath}`);
      return;
    }
    
    let content = fs.readFileSync(fullPath, 'utf-8');
    let modified = false;
    
    // Pattern replacements
    const replacements = [
      // Simple role removal from select
      { 
        pattern: /\.select\('role, avatar_url'\)/g, 
        replacement: `.select('avatar_url')` 
      },
      { 
        pattern: /\.select\('role, first_name, last_name, avatar_url'\)/g, 
        replacement: `.select('first_name, last_name, avatar_url')` 
      },
      { 
        pattern: /\.select\('role, first_name, last_name, avatar_url, school_id, generation_id, community_id'\)/g, 
        replacement: `.select('first_name, last_name, avatar_url, school_id, generation_id, community_id')` 
      },
      { 
        pattern: /\.select\('role, approval_status, avatar_url'\)/g, 
        replacement: `.select('approval_status, avatar_url')` 
      },
      { 
        pattern: /\.select\('role, avatar_url, name'\)/g, 
        replacement: `.select('avatar_url, name')` 
      }
    ];
    
    for (const { pattern, replacement } of replacements) {
      if (pattern.test(content)) {
        content = content.replace(pattern, replacement);
        modified = true;
      }
    }
    
    if (modified) {
      // Check if getUserPrimaryRole is imported
      const hasRoleUtilsImport = content.includes('getUserPrimaryRole') || content.includes('roleUtils');
      
      if (!hasRoleUtilsImport && content.includes('profileData?.role') || content.includes('profile.role')) {
        // Add import at the top after other imports
        const importMatch = content.match(/(import[\s\S]*?from\s+['"].*?['"];?\s*\n)+/);
        if (importMatch) {
          const lastImportEnd = importMatch.index + importMatch[0].length;
          content = content.slice(0, lastImportEnd) + 
                    `import { getUserPrimaryRole } from '${filePath.includes('pages/admin/') ? '../../' : '../'}utils/roleUtils';\n` +
                    content.slice(lastImportEnd);
        }
      }
      
      fs.writeFileSync(fullPath, content, 'utf-8');
      console.log(`✅ Fixed ${filePath}`);
    } else {
      console.log(`⏭️  ${filePath} - No changes needed`);
    }
    
  } catch (error) {
    console.error(`❌ Error processing ${filePath}:`, error.message);
  }
}

async function main() {
  console.log('Fixing role column references in all files...\n');
  
  for (const file of filesToFix) {
    await fixFile(file);
  }
  
  console.log('\n\nCompleted! Please review the changes and test the application.');
  console.log('\nNote: Some files may still need manual fixes for complex role checks.');
}

main().catch(console.error);