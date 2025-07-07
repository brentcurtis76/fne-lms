#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const glob = require('glob');

// Find all .tsx and .ts files in pages directory
const pageFiles = glob.sync('pages/**/*.{ts,tsx}', {
  ignore: ['**/node_modules/**', '**/_app.tsx']
});

console.log(`Found ${pageFiles.length} page files to check...`);

let fixedCount = 0;

pageFiles.forEach(file => {
  let content = fs.readFileSync(file, 'utf8');
  let modified = false;
  
  // Check if file uses 'supabase.' without importing it
  if (content.includes('supabase.') && !content.includes("from '@/lib/supabase'") && !content.includes("from '../lib/supabase'")) {
    // Check if it already imports useSupabaseClient
    if (content.includes("from '@supabase/auth-helpers-react'")) {
      // Calculate relative path to lib/supabase
      const relativePath = path.relative(path.dirname(file), 'lib/supabase');
      const importPath = relativePath.startsWith('.') ? relativePath : './' + relativePath;
      
      // Add import after the auth-helpers import
      content = content.replace(
        /(import[^;]+from\s+['"]@supabase\/auth-helpers-react['"];?)/,
        `$1\nimport { supabase } from '${importPath}';`
      );
      modified = true;
    }
  }
  
  if (modified) {
    fs.writeFileSync(file, content);
    console.log(`Fixed: ${file}`);
    fixedCount++;
  }
});

console.log(`\nFixed ${fixedCount} files.`);