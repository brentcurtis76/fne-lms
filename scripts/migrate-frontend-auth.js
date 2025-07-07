#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

// Migration patterns
const migrations = [
  {
    name: 'Remove direct supabase import',
    test: /import\s+{\s*supabase\s*}\s+from\s+['"].*supabase['"]/,
    replace: (content) => {
      // Remove the import line
      return content.replace(/import\s+{\s*supabase\s*}\s+from\s+['"].*supabase['"];\s*\n/g, '');
    }
  },
  {
    name: 'Add frontend auth utils import',
    test: (content) => {
      return !content.includes("from '../lib/frontend-auth-utils'") && 
             !content.includes('from "../../lib/frontend-auth-utils"') &&
             !content.includes('from "../../../lib/frontend-auth-utils"');
    },
    replace: (content) => {
      // Find the right place to add the import (after other imports)
      const importMatch = content.match(/import.*from.*;/);
      if (importMatch) {
        const lastImportIndex = content.lastIndexOf(importMatch[0]) + importMatch[0].length;
        const pathDepth = content.includes('pages/admin/') ? '../..' : 
                         content.includes('pages/') ? '..' : '.';
        const importStatement = `\nimport { useAuthCheck, useSupabaseClient, useSession } from '${pathDepth}/lib/frontend-auth-utils';`;
        
        // Only add if not already present
        if (!content.includes('useSupabaseClient') && content.includes('supabase.')) {
          return content.slice(0, lastImportIndex) + importStatement + content.slice(lastImportIndex);
        }
      }
      return content;
    }
  },
  {
    name: 'Replace supabase.auth.getSession()',
    test: /await\s+supabase\.auth\.getSession\(\)/,
    replace: (content) => {
      // This is more complex - need to refactor to use hooks
      return content.replace(
        /const\s+{\s*data:\s*{\s*session\s*}\s*}\s*=\s*await\s+supabase\.auth\.getSession\(\);?/g,
        '// Session is now handled by useSession hook'
      );
    }
  },
  {
    name: 'Replace supabase client usage',
    test: /supabase\./,
    replace: (content) => {
      // Add hook if not present
      if (!content.includes('const supabase = useSupabaseClient()')) {
        // Find the component function
        const componentMatch = content.match(/export\s+default\s+function\s+\w+\s*\([^)]*\)\s*{/);
        if (componentMatch) {
          const insertIndex = componentMatch.index + componentMatch[0].length;
          content = content.slice(0, insertIndex) + 
                   '\n  const supabase = useSupabaseClient();' + 
                   content.slice(insertIndex);
        }
      }
      return content;
    }
  }
];

function migrateFile(filePath) {
  let content = fs.readFileSync(filePath, 'utf8');
  const originalContent = content;
  const changes = [];
  
  // Apply each migration
  for (const migration of migrations) {
    if (typeof migration.test === 'function' ? migration.test(content) : migration.test.test(content)) {
      content = migration.replace(content);
      changes.push(migration.name);
    }
  }
  
  // Only write if changes were made
  if (content !== originalContent) {
    // Create backup
    const backupPath = filePath + '.backup';
    if (!fs.existsSync(backupPath)) {
      fs.writeFileSync(backupPath, originalContent);
    }
    
    // Write migrated content
    fs.writeFileSync(filePath, content);
    
    return {
      path: filePath,
      changes: changes,
      success: true
    };
  }
  
  return {
    path: filePath,
    changes: [],
    success: true
  };
}

function findPagesToMigrate() {
  const report = JSON.parse(fs.readFileSync('frontend-auth-analysis.json', 'utf8'));
  const highRiskPages = report.categories.highRisk;
  
  // Filter out already migrated pages
  const alreadyMigrated = [
    'pages/dashboard.tsx',
    'pages/login.tsx', 
    'pages/profile.tsx',
    'pages/index.tsx' // Just migrated
  ];
  
  return highRiskPages.filter(page => !alreadyMigrated.includes(page.path));
}

// Main execution
console.log('Frontend Authentication Migration Tool');
console.log('=====================================\n');

const pagesToMigrate = findPagesToMigrate();

console.log(`Found ${pagesToMigrate.length} pages to migrate\n`);

if (process.argv[2] === '--dry-run') {
  console.log('DRY RUN - No files will be modified\n');
  pagesToMigrate.forEach(page => {
    console.log(`Would migrate: ${page.path}`);
  });
} else if (process.argv[2] === '--migrate') {
  console.log('Starting migration...\n');
  
  const results = [];
  for (const page of pagesToMigrate.slice(0, 5)) { // Migrate 5 at a time
    console.log(`Migrating ${page.path}...`);
    const result = migrateFile(page.path);
    results.push(result);
    
    if (result.changes.length > 0) {
      console.log(`  ✅ Applied ${result.changes.length} changes`);
      result.changes.forEach(change => console.log(`     - ${change}`));
    } else {
      console.log('  ℹ️  No changes needed');
    }
  }
  
  console.log('\nMigration Summary:');
  console.log(`Total pages processed: ${results.length}`);
  console.log(`Pages modified: ${results.filter(r => r.changes.length > 0).length}`);
  
} else {
  console.log('Usage:');
  console.log('  node scripts/migrate-frontend-auth.js --dry-run    # Preview changes');
  console.log('  node scripts/migrate-frontend-auth.js --migrate    # Apply changes');
}

console.log('\n⚠️  Note: This is a basic migration. Manual review is required for:');
console.log('- Complex authentication flows');
console.log('- Pages using getServerSideProps');
console.log('- Custom session management logic');