#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const glob = require('glob');

// Find all TSX and JSX files
const files = glob.sync('**/*.{tsx,jsx}', {
  cwd: process.cwd(),
  ignore: ['node_modules/**', '.next/**', 'out/**', 'build/**']
});

console.log(`Found ${files.length} React component files to analyze\n`);

let totalInstances = 0;
const results = [];

files.forEach(file => {
  const content = fs.readFileSync(file, 'utf8');
  const lines = content.split('\n');
  
  // Look for Link components with nested anchor tags
  let inLink = false;
  let linkStartLine = 0;
  let hasNestedAnchor = false;
  let hasLegacyBehavior = false;
  
  lines.forEach((line, index) => {
    const lineNum = index + 1;
    
    // Check if we're starting a Link component
    if (line.includes('<Link') && !line.includes('</Link>')) {
      inLink = true;
      linkStartLine = lineNum;
      hasLegacyBehavior = line.includes('legacyBehavior');
      hasNestedAnchor = false;
    }
    
    // Check for nested anchor tag within Link
    if (inLink && line.includes('<a')) {
      hasNestedAnchor = true;
    }
    
    // Check if we're ending a Link component
    if (inLink && line.includes('</Link>')) {
      if (hasNestedAnchor) {
        results.push({
          file,
          line: linkStartLine,
          hasLegacyBehavior,
          preview: lines.slice(linkStartLine - 1, Math.min(linkStartLine + 10, lines.length)).join('\n')
        });
        totalInstances++;
      }
      inLink = false;
    }
  });
});

// Sort results by file path
results.sort((a, b) => a.file.localeCompare(b.file));

// Group by whether they have legacyBehavior
const withLegacy = results.filter(r => r.hasLegacyBehavior);
const withoutLegacy = results.filter(r => !r.hasLegacyBehavior);

console.log('=== SUMMARY ===');
console.log(`Total instances found: ${totalInstances}`);
console.log(`With legacyBehavior prop: ${withLegacy.length}`);
console.log(`Without legacyBehavior prop (NEED FIXING): ${withoutLegacy.length}\n`);

if (withoutLegacy.length > 0) {
  console.log('=== INSTANCES THAT NEED FIXING (no legacyBehavior) ===\n');
  withoutLegacy.forEach(({ file, line }) => {
    console.log(`${file}:${line}`);
  });
}

if (withLegacy.length > 0) {
  console.log('\n=== INSTANCES WITH legacyBehavior (already using old behavior) ===\n');
  withLegacy.forEach(({ file, line }) => {
    console.log(`${file}:${line}`);
  });
}

// Show detailed preview of instances that need fixing
if (withoutLegacy.length > 0) {
  console.log('\n=== DETAILED PREVIEW OF INSTANCES NEEDING FIXES ===\n');
  withoutLegacy.forEach(({ file, line, preview }) => {
    console.log(`\nFile: ${file} (Line ${line})`);
    console.log('Preview:');
    console.log('---');
    console.log(preview);
    console.log('---');
  });
}