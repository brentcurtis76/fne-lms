#!/usr/bin/env node

const fs = require('fs');
const glob = require('glob');

// Find all .tsx and .ts files
const files = glob.sync('**/*.{ts,tsx}', {
  ignore: ['**/node_modules/**', '**/scripts/**', '**/.next/**']
});

console.log(`Found ${files.length} files to check...`);

let fixedCount = 0;

files.forEach(file => {
  let content = fs.readFileSync(file, 'utf8');
  let modified = false;
  
  // Fix getEffectiveRoleAndStatus calls
  content = content.replace(/await getEffectiveRoleAndStatus\(([^,)]+)\)/g, (match, userId) => {
    if (!match.includes('supabase,')) {
      modified = true;
      return `await getEffectiveRoleAndStatus(supabase, ${userId})`;
    }
    return match;
  });
  
  // Fix getCommunityMembers calls
  content = content.replace(/await getCommunityMembers\(([^,)]+)\)/g, (match, communityId) => {
    if (!match.includes('supabase,')) {
      modified = true;
      return `await getCommunityMembers(supabase, ${communityId})`;
    }
    return match;
  });
  
  if (modified) {
    fs.writeFileSync(file, content);
    console.log(`Fixed: ${file}`);
    fixedCount++;
  }
});

console.log(`\nFixed ${fixedCount} files.`);