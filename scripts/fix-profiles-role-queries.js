#!/usr/bin/env node

/**
 * Script to find and report places where profiles.role is being queried
 * This column no longer exists - should use user_roles.role_type instead
 */

const fs = require('fs');
const path = require('path');

// Directories to search
const searchDirs = ['pages', 'components', 'lib', 'utils'];

// Patterns to look for
const patterns = [
  /profiles.*select.*role/gi,
  /select.*role.*from.*profiles/gi,
  /profiles\.role/g,
  /profile\.role(?!\w)/g,  // profile.role but not profile.roleType
  /profileData\.role(?!\w)/g,
  /data\.role(?!\w)/g
];

let filesWithIssues = [];

function searchFile(filePath) {
  if (!filePath.endsWith('.ts') && !filePath.endsWith('.tsx') && !filePath.endsWith('.js')) {
    return;
  }

  const content = fs.readFileSync(filePath, 'utf8');
  const lines = content.split('\n');
  let foundIssues = false;
  const issues = [];

  lines.forEach((line, index) => {
    patterns.forEach(pattern => {
      if (pattern.test(line)) {
        // Skip if it's already using role_type or roleType
        if (line.includes('role_type') || line.includes('roleType')) {
          return;
        }
        // Skip comments
        if (line.trim().startsWith('//') || line.trim().startsWith('*')) {
          return;
        }
        foundIssues = true;
        issues.push({
          line: index + 1,
          content: line.trim(),
          pattern: pattern.toString()
        });
      }
    });
  });

  if (foundIssues) {
    filesWithIssues.push({
      path: filePath,
      issues: issues
    });
  }
}

function searchDirectory(dir) {
  const files = fs.readdirSync(dir);
  
  files.forEach(file => {
    const filePath = path.join(dir, file);
    const stat = fs.statSync(filePath);
    
    if (stat.isDirectory() && !file.startsWith('.') && file !== 'node_modules') {
      searchDirectory(filePath);
    } else if (stat.isFile()) {
      searchFile(filePath);
    }
  });
}

// Run the search
console.log('Searching for profiles.role references...\n');

searchDirs.forEach(dir => {
  if (fs.existsSync(dir)) {
    searchDirectory(dir);
  }
});

// Report results
if (filesWithIssues.length === 0) {
  console.log('✅ No profiles.role references found!');
} else {
  console.log(`❌ Found ${filesWithIssues.length} files with potential profiles.role references:\n`);
  
  filesWithIssues.forEach(file => {
    console.log(`📄 ${file.path}`);
    file.issues.forEach(issue => {
      console.log(`   Line ${issue.line}: ${issue.content}`);
    });
    console.log('');
  });
  
  console.log('\nThese references should be updated to use user_roles.role_type instead.');
  console.log('Or use the getUserRole() utility function from utils/roleUtils.ts');
}