#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

// API directories to scan
const apiDirs = [
  path.join(__dirname, '..', 'pages', 'api'),
];

// Files to ignore
const ignorePaths = [
  'pages/api/health.ts', // Already handles auth properly
  'pages/api/send-email.ts', // Email service - no auth needed
  'pages/api/test-email.ts', // Test endpoint
];

// Check if a file uses the old pattern
function usesOldPattern(content) {
  // Check for direct Supabase import
  if (content.includes("from '@supabase/supabase-js'") || 
      content.includes('from "@supabase/supabase-js"')) {
    return true;
  }
  
  // Check for old patterns
  if (content.includes('createClient(') && !content.includes('createApiSupabaseClient')) {
    return true;
  }
  
  // Check for manual auth checks instead of using helpers
  if ((content.includes('.auth.getUser()') || content.includes('.auth.getSession()')) && 
      !content.includes('getApiUser')) {
    return true;
  }
  
  return false;
}

// Check if a file uses the new pattern
function usesNewPattern(content) {
  return content.includes("from '../../../lib/api-auth'") || 
         content.includes('from "../../lib/api-auth"') ||
         content.includes("from '../../lib/api-auth'") ||
         content.includes("from '../lib/api-auth'");
}

// Scan directory recursively
function scanDirectory(dir, results = { total: 0, migrated: 0, needsMigration: [], migratedFiles: [] }) {
  const files = fs.readdirSync(dir);
  
  for (const file of files) {
    const fullPath = path.join(dir, file);
    const stat = fs.statSync(fullPath);
    
    if (stat.isDirectory()) {
      scanDirectory(fullPath, results);
    } else if (file.endsWith('.ts') || file.endsWith('.js')) {
      const relativePath = path.relative(path.join(__dirname, '..'), fullPath);
      
      // Skip ignored files
      if (ignorePaths.includes(relativePath)) {
        continue;
      }
      
      results.total++;
      
      const content = fs.readFileSync(fullPath, 'utf8');
      
      if (usesNewPattern(content)) {
        results.migrated++;
        results.migratedFiles.push(relativePath);
      } else if (usesOldPattern(content)) {
        results.needsMigration.push(relativePath);
      } else {
        // File might not need authentication at all
        results.migrated++;
        results.migratedFiles.push(relativePath + ' (no auth needed)');
      }
    }
  }
  
  return results;
}

// Main execution
console.log('API Migration Progress Tracker\n');
console.log('========================================\n');

const results = scanDirectory(apiDirs[0]);

const percentage = ((results.migrated / results.total) * 100).toFixed(1);

console.log(`Total API routes: ${results.total}`);
console.log(`Migrated: ${results.migrated} (${percentage}%)`);
console.log(`Needs migration: ${results.needsMigration.length}\n`);

if (results.needsMigration.length > 0) {
  console.log('Files that need migration:');
  console.log('-------------------------');
  results.needsMigration.forEach((file, index) => {
    console.log(`${index + 1}. ${file}`);
  });
  console.log('\n');
}

if (results.migratedFiles.length > 0) {
  console.log('Recently migrated files:');
  console.log('-----------------------');
  // Show last 10 migrated files
  const recentFiles = results.migratedFiles.slice(-10);
  recentFiles.forEach(file => {
    console.log(`✓ ${file}`);
  });
  if (results.migratedFiles.length > 10) {
    console.log(`... and ${results.migratedFiles.length - 10} more`);
  }
}

console.log('\nNext steps:');
console.log('1. Continue migrating the remaining API routes');
console.log('2. Update each file to use the centralized auth helpers');
console.log('3. Test each endpoint after migration');