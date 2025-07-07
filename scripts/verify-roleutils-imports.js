#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const glob = require('glob');

// Function to calculate the correct relative path
function getCorrectImportPath(filePath) {
  const fileDir = path.dirname(filePath);
  const utilsPath = 'utils/roleUtils';
  
  // Calculate how many directories up we need to go
  const depth = fileDir.split('/').filter(p => p).length;
  const upLevels = '../'.repeat(depth);
  
  return `${upLevels}${utilsPath}`;
}

// Find all TypeScript/React files that import roleUtils
const files = glob.sync('**/*.{ts,tsx}', {
  ignore: ['node_modules/**', '.next/**', 'scripts/**']
});

let issuesFound = 0;

files.forEach(file => {
  const content = fs.readFileSync(file, 'utf-8');
  
  // Check for roleUtils imports
  const importMatch = content.match(/import\s+{[^}]*getUserPrimaryRole[^}]*}\s+from\s+['"]([^'"]+)['"]/);
  
  if (importMatch) {
    const currentImportPath = importMatch[1];
    const correctPath = getCorrectImportPath(file);
    
    // Check if the path is correct
    const expectedPath = correctPath.endsWith('roleUtils') ? correctPath : `${correctPath}/roleUtils`;
    
    // Normalize paths for comparison
    const normalizedCurrent = currentImportPath.replace(/['"]/g, '');
    const isCorrect = normalizedCurrent.endsWith('utils/roleUtils');
    
    if (!isCorrect || !fs.existsSync(path.resolve(path.dirname(file), normalizedCurrent + '.ts'))) {
      console.log(`\n❌ ${file}`);
      console.log(`   Current:  ${currentImportPath}`);
      console.log(`   Expected: ${correctPath}`);
      issuesFound++;
    } else {
      console.log(`✅ ${file} - Import path is correct`);
    }
  }
});

if (issuesFound === 0) {
  console.log('\n✨ All import paths are correct!');
} else {
  console.log(`\n⚠️  Found ${issuesFound} incorrect import paths`);
}