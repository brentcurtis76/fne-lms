#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

// Files with remaining profileData.role issues
const filesToFix = {
  'pages/admin/course-builder/[courseId]/[moduleId]/index.tsx': {
    line: 96,
    old: `        const adminFromProfile = profileData?.role === 'admin';`,
    new: `        const userRole = await getUserPrimaryRole(session.user.id);
        const adminFromProfile = userRole === 'admin';`,
    needsImport: true
  },
  'pages/admin/course-builder/[courseId]/edit.tsx': {
    line: 72,
    old: `        const adminFromProfile = profileData?.role === 'admin';`,
    new: `        const userRole = await getUserPrimaryRole(session.user.id);
        const adminFromProfile = userRole === 'admin';`,
    needsImport: true
  },
  'pages/admin/course-builder/[courseId]/index.tsx': {
    line: 84,
    old: `        const adminFromProfile = profileData?.role === 'admin';`,
    new: `        const userRole = await getUserPrimaryRole(session.user.id);
        const adminFromProfile = userRole === 'admin';`,
    needsImport: true
  },
  'pages/admin/course-builder/new.tsx': {
    line: 63,
    old: `        const adminFromProfile = profileData?.role === 'admin';`,
    new: `        const userRole = await getUserPrimaryRole(session.user.id);
        const adminFromProfile = userRole === 'admin';`,
    needsImport: true
  },
  'pages/expense-reports.tsx': {
    line: 100,
    old: `          setIsAdmin(profile.role === 'admin');`,
    new: `          const userRole = await getUserPrimaryRole(session.user.id);
          setIsAdmin(userRole === 'admin');`,
    needsImport: true
  },
  'pages/reports.tsx': {
    line: 156,
    old: `        const role = profileData.role;`,
    new: `        const role = await getUserPrimaryRole(session.user.id);`,
    needsImport: false // Already imported
  },
  'pages/assignments/[id]/index.tsx': {
    line: 51,
    old: `          setUserRole(profile.role);`,
    new: `          const role = await getUserPrimaryRole(session.user.id);
          setUserRole(role);`,
    needsImport: true
  },
  'pages/assignments/[id]/submissions.tsx': {
    line: 188,
    old: `          setUserRole(profile.role);`,
    new: `          const role = await getUserPrimaryRole(session.user.id);
          setUserRole(role);`,
    needsImport: true
  },
  'pages/student/course/[courseId].tsx': {
    line: 90,
    old: `              setIsAdmin(profileData.role === 'admin');`,
    new: `              const userRole = await getUserPrimaryRole(session.user.id);
              setIsAdmin(userRole === 'admin');`,
    needsImport: false // Already has the function
  },
  'pages/student/lesson/[lessonId].tsx': {
    line: 89,
    old: `            setIsAdmin(profileData.role === 'admin');`,
    new: `            const userRole = await getUserPrimaryRole(session.user.id);
            setIsAdmin(userRole === 'admin');`,
    needsImport: false // Already has the function
  },
  'pages/assignments.tsx': {
    line: 95,
    old: `            setUserRole(profile.role);`,
    new: `            const role = await getUserPrimaryRole(session.user.id);
            setUserRole(role);`,
    needsImport: true
  },
  'pages/user/[userId].tsx': {
    line: 46,
    old: `          setIsAdmin(currentUserProfile.role === 'admin');`,
    new: `          const userRole = await getUserPrimaryRole(session.user.id);
          setIsAdmin(userRole === 'admin');`,
    needsImport: false // Already has the function
  },
  'pages/course-manager.tsx': {
    lines: [44, 45],
    old: `          setUserRole(profileData.role);
          setIsAdmin(profileData.role === 'admin');`,
    new: `          const role = await getUserPrimaryRole(session.user.id);
          setUserRole(role);
          setIsAdmin(role === 'admin');`,
    needsImport: false // Already has the function
  },
  'pages/notifications.tsx': {
    line: 110,
    old: `        setIsAdmin(profileData.role === 'admin');`,
    new: `        const userRole = await getUserPrimaryRole(session.user.id);
        setIsAdmin(userRole === 'admin');`,
    needsImport: false // Already has the function
  },
  'pages/contracts.tsx': {
    line: 129,
    old: `        if (!profile || profile.role !== 'admin') {`,
    new: `        const userRole = await getUserPrimaryRole(session.user.id);
        if (!profile || userRole !== 'admin') {`,
    needsImport: true
  },
  'pages/enhanced-reports.tsx': {
    line: 206,
    old: `        const role = profileData.role;`,
    new: `        const role = await getUserPrimaryRole(session.user.id);`,
    needsImport: false // Already has the function
  },
  'pages/detailed-reports.tsx': {
    line: 136,
    old: `      if (highestRole || profileData?.role) {
        // Use highest role from new system, fall back to legacy role
        const effectiveRole = highestRole || profileData?.role || '';`,
    new: `      if (highestRole) {
        // Use highest role from new system
        const effectiveRole = highestRole || '';`,
    needsImport: false // Already has the function
  }
};

async function fixFile(filePath, fix) {
  try {
    const fullPath = path.join(process.cwd(), filePath);
    if (!fs.existsSync(fullPath)) {
      console.log(`❌ File not found: ${filePath}`);
      return;
    }
    
    let content = fs.readFileSync(fullPath, 'utf-8');
    
    // Apply the fix
    if (content.includes(fix.old)) {
      content = content.replace(fix.old, fix.new);
      
      // Add import if needed
      if (fix.needsImport && !content.includes('getUserPrimaryRole')) {
        const importPath = filePath.includes('pages/admin/') ? '../../' : '../';
        const importLine = `import { getUserPrimaryRole } from '${importPath}utils/roleUtils';`;
        
        // Find a good place to add the import
        const importMatch = content.match(/(import[\s\S]*?from\s+['"].*?['"];?\s*\n)+/);
        if (importMatch) {
          const lastImportEnd = importMatch.index + importMatch[0].length;
          content = content.slice(0, lastImportEnd) + importLine + '\n' + content.slice(lastImportEnd);
        }
      }
      
      fs.writeFileSync(fullPath, content, 'utf-8');
      console.log(`✅ Fixed ${filePath}`);
    } else {
      console.log(`⚠️  Could not find exact match in ${filePath} - may need manual fix`);
    }
    
  } catch (error) {
    console.error(`❌ Error processing ${filePath}:`, error.message);
  }
}

async function main() {
  console.log('Fixing remaining role references...\n');
  
  for (const [file, fix] of Object.entries(filesToFix)) {
    await fixFile(file, fix);
  }
  
  console.log('\n\nCompleted! The user management page should now work without errors.');
}

main().catch(console.error);