#!/usr/bin/env node

const fs = require('fs');
const glob = require('glob');

// Find all .tsx and .ts files with duplicate supabase imports
const files = glob.sync('**/*.{ts,tsx}', {
  ignore: ['**/node_modules/**', '**/.next/**', '**/scripts/**']
});

console.log(`Checking ${files.length} files for duplicate imports...`);

let fixedCount = 0;

files.forEach(file => {
  let content = fs.readFileSync(file, 'utf8');
  
  // Check for duplicate supabase imports
  const supabaseImportRegex = /import\s*{\s*supabase\s*}\s*from\s*['"][^'"]+lib\/supabase['"]\s*;?\s*/g;
  const matches = content.match(supabaseImportRegex);
  
  if (matches && matches.length > 1) {
    // Remove all but the first import
    let firstFound = false;
    content = content.replace(supabaseImportRegex, (match) => {
      if (!firstFound) {
        firstFound = true;
        return match;
      }
      return '';
    });
    
    fs.writeFileSync(file, content);
    console.log(`Fixed duplicate imports in: ${file}`);
    fixedCount++;
  }
});

console.log(`\nFixed ${fixedCount} files with duplicate imports.`);