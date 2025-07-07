#!/usr/bin/env node

/**
 * Verification Script: Identify Competing Authentication Listeners
 * 
 * This script verifies:
 * 1. Which _app.tsx file is active
 * 2. All onAuthStateChange listeners in the codebase
 * 3. Files importing sessionManager
 * 4. Components using AuthContext
 * 
 * Run: node scripts/verify-competing-listeners.js
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

console.log('🔍 FNE LMS - Competing Session Listeners Verification\n');
console.log('=' + '='.repeat(60) + '\n');

// Color codes for terminal output
const colors = {
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  reset: '\x1b[0m'
};

// 1. Check which _app.tsx is active
console.log(`${colors.blue}1. Checking Active _app.tsx File${colors.reset}`);
console.log('-'.repeat(40));

const pageDirExists = fs.existsSync('pages');
const srcPagesDirExists = fs.existsSync('src/pages');
const pagesAppExists = fs.existsSync('pages/_app.tsx');
const srcPagesAppExists = fs.existsSync('src/pages/_app.tsx');

console.log(`  /pages directory exists: ${pageDirExists ? colors.green + '✓' : colors.red + '✗'} ${colors.reset}`);
console.log(`  /src/pages directory exists: ${srcPagesDirExists ? colors.green + '✓' : colors.red + '✗'} ${colors.reset}`);
console.log(`  /pages/_app.tsx exists: ${pagesAppExists ? colors.green + '✓' : colors.red + '✗'} ${colors.reset}`);
console.log(`  /src/pages/_app.tsx exists: ${srcPagesAppExists ? colors.green + '✓' : colors.red + '✗'} ${colors.reset}`);

if (pagesAppExists && srcPagesAppExists) {
  console.log(`\n  ${colors.yellow}⚠️  WARNING: Both _app.tsx files exist!${colors.reset}`);
  console.log(`  Next.js will use /pages/_app.tsx by default`);
  
  // Check file sizes for more info
  const pagesSize = fs.statSync('pages/_app.tsx').size;
  const srcSize = fs.statSync('src/pages/_app.tsx').size;
  console.log(`\n  File sizes:`);
  console.log(`  /pages/_app.tsx: ${pagesSize} bytes`);
  console.log(`  /src/pages/_app.tsx: ${srcSize} bytes`);
}

// 2. Find ALL onAuthStateChange listeners
console.log(`\n${colors.blue}2. Searching for onAuthStateChange Listeners${colors.reset}`);
console.log('-'.repeat(40));

try {
  const authListeners = execSync(
    `grep -rn "onAuthStateChange" --include="*.ts" --include="*.tsx" --include="*.js" --include="*.jsx" . | grep -v node_modules | grep -v .next | grep -v scripts || echo ""`,
    { encoding: 'utf8', maxBuffer: 1024 * 1024 * 10 }
  );
  
  if (authListeners.trim()) {
    console.log(`  ${colors.red}⚠️  Found onAuthStateChange listeners:${colors.reset}\n`);
    const lines = authListeners.trim().split('\n');
    lines.forEach(line => {
      const [filePath, ...rest] = line.split(':');
      const lineNum = rest[0];
      const code = rest.slice(1).join(':').trim();
      console.log(`  📄 ${colors.yellow}${filePath}${colors.reset}:${lineNum}`);
      console.log(`     ${code.substring(0, 80)}${code.length > 80 ? '...' : ''}\n`);
    });
    console.log(`  ${colors.red}Total: ${lines.length} instances found${colors.reset}`);
  } else {
    console.log(`  ${colors.green}✓ No onAuthStateChange listeners found${colors.reset}`);
  }
} catch (e) {
  console.log(`  ${colors.green}✓ No onAuthStateChange listeners found${colors.reset}`);
}

// 3. Find sessionManager imports
console.log(`\n${colors.blue}3. Files Importing sessionManager${colors.reset}`);
console.log('-'.repeat(40));

try {
  const sessionImports = execSync(
    `grep -rn "from.*sessionManager\\|import.*sessionManager" --include="*.ts" --include="*.tsx" --include="*.js" --include="*.jsx" . | grep -v node_modules | grep -v .next | grep -v scripts || echo ""`,
    { encoding: 'utf8' }
  );
  
  if (sessionImports.trim()) {
    console.log(`  ${colors.yellow}Found sessionManager imports:${colors.reset}\n`);
    sessionImports.trim().split('\n').forEach(line => {
      const [filePath, lineNum, ...code] = line.split(':');
      console.log(`  📄 ${colors.yellow}${filePath}${colors.reset}:${lineNum}`);
    });
  } else {
    console.log(`  ${colors.green}✓ No sessionManager imports found${colors.reset}`);
  }
} catch (e) {
  console.log(`  ${colors.green}✓ No sessionManager imports found${colors.reset}`);
}

// 4. Find AuthContext usage
console.log(`\n${colors.blue}4. Components Using AuthContext${colors.reset}`);
console.log('-'.repeat(40));

try {
  const authContextUsage = execSync(
    `grep -rn "useAuth\\|AuthProvider\\|AuthContext" --include="*.ts" --include="*.tsx" --include="*.js" --include="*.jsx" . | grep -v node_modules | grep -v .next | grep -v scripts | wc -l`,
    { encoding: 'utf8' }
  );
  
  const usageCount = parseInt(authContextUsage.trim());
  console.log(`  Found ${colors.yellow}${usageCount}${colors.reset} references to AuthContext/useAuth`);
  
  // Get first 5 examples
  const examples = execSync(
    `grep -rn "useAuth\\|AuthProvider\\|AuthContext" --include="*.ts" --include="*.tsx" --include="*.js" --include="*.jsx" . | grep -v node_modules | grep -v .next | grep -v scripts | head -5 || echo ""`,
    { encoding: 'utf8' }
  );
  
  if (examples.trim()) {
    console.log(`\n  First 5 examples:`);
    examples.trim().split('\n').forEach(line => {
      const [filePath, ...rest] = line.split(':');
      console.log(`  • ${filePath}`);
    });
  }
} catch (e) {
  console.log(`  ${colors.red}Error checking AuthContext usage${colors.reset}`);
}

// 5. Check for multiple auth providers in _app.tsx
console.log(`\n${colors.blue}5. Auth Provider Configuration${colors.reset}`);
console.log('-'.repeat(40));

if (pagesAppExists) {
  const appContent = fs.readFileSync('pages/_app.tsx', 'utf8');
  const hasSessionContext = appContent.includes('SessionContextProvider');
  const hasAuthProvider = appContent.includes('AuthProvider');
  
  console.log(`  /pages/_app.tsx providers:`);
  console.log(`  SessionContextProvider: ${hasSessionContext ? colors.green + '✓' : colors.red + '✗'} ${colors.reset}`);
  console.log(`  AuthProvider: ${hasAuthProvider ? colors.green + '✓' : colors.red + '✗'} ${colors.reset}`);
  
  if (hasSessionContext && hasAuthProvider) {
    console.log(`\n  ${colors.yellow}⚠️  Both providers present - potential for conflicts${colors.reset}`);
  }
}

// 6. Summary and Recommendations
console.log(`\n${colors.blue}6. Summary & Recommendations${colors.reset}`);
console.log('=' + '='.repeat(60));

const issues = [];

if (pagesAppExists && srcPagesAppExists) {
  issues.push('DELETE /src/pages/_app.tsx (duplicate file)');
}

try {
  const authListenerCount = execSync(
    `grep -r "onAuthStateChange" --include="*.ts" --include="*.tsx" . | grep -v node_modules | grep -v .next | grep -v scripts | wc -l`,
    { encoding: 'utf8' }
  );
  
  if (parseInt(authListenerCount.trim()) > 1) {
    issues.push('REFACTOR AuthContext.tsx to remove onAuthStateChange listener');
  }
} catch (e) {}

if (fs.existsSync('lib/sessionManager.ts')) {
  issues.push('DELETE /lib/sessionManager.ts (legacy session manager)');
  issues.push('UPDATE imports in files using sessionManager');
}

if (issues.length > 0) {
  console.log(`\n${colors.red}Issues Found:${colors.reset}`);
  issues.forEach((issue, index) => {
    console.log(`  ${index + 1}. ${issue}`);
  });
  
  console.log(`\n${colors.yellow}Recommended Actions:${colors.reset}`);
  console.log('  1. Run backup script before making changes');
  console.log('  2. Execute cleanup script to fix issues');
  console.log('  3. Run tests to verify functionality');
} else {
  console.log(`\n${colors.green}✓ No competing authentication listeners found!${colors.reset}`);
}

console.log('\n');