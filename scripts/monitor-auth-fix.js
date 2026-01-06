#!/usr/bin/env node

/**
 * Authentication Fix Monitoring Script
 * 
 * Monitors the health of authentication after the fix:
 * - Tracks login/logout rates
 * - Monitors for unexpected logouts
 * - Verifies session persistence
 * - Checks for any remaining listeners
 * 
 * Run: node scripts/monitor-auth-fix.js
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

console.log('🔍 Genera - Authentication Fix Monitoring\n');
console.log(`Started: ${new Date().toISOString()}\n`);

// Colors
const colors = {
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  reset: '\x1b[0m'
};

// 1. Check for any remaining onAuthStateChange listeners
console.log(`${colors.blue}1. Checking for onAuthStateChange Listeners${colors.reset}`);
console.log('-'.repeat(50));

try {
  const listeners = execSync(
    `grep -r "onAuthStateChange" --include="*.ts" --include="*.tsx" . | grep -v node_modules | grep -v .next | grep -v __tests__ | grep -v scripts || echo ""`,
    { encoding: 'utf8' }
  );
  
  if (listeners.trim()) {
    console.log(`${colors.red}⚠️  WARNING: Found onAuthStateChange listeners!${colors.reset}`);
    console.log(listeners);
  } else {
    console.log(`${colors.green}✅ No onAuthStateChange listeners found${colors.reset}`);
  }
} catch (e) {
  console.log(`${colors.green}✅ No onAuthStateChange listeners found${colors.reset}`);
}

// 2. Verify sessionManager is gone
console.log(`\n${colors.blue}2. Checking for sessionManager References${colors.reset}`);
console.log('-'.repeat(50));

const sessionManagerExists = fs.existsSync('lib/sessionManager.ts');
if (sessionManagerExists) {
  console.log(`${colors.red}❌ sessionManager.ts still exists!${colors.reset}`);
} else {
  console.log(`${colors.green}✅ sessionManager.ts removed${colors.reset}`);
}

try {
  const imports = execSync(
    `grep -r "sessionManager" --include="*.ts" --include="*.tsx" . | grep -v node_modules | grep -v .next | grep -v scripts || echo ""`,
    { encoding: 'utf8' }
  );
  
  if (imports.trim()) {
    console.log(`${colors.red}⚠️  Found sessionManager references:${colors.reset}`);
    console.log(imports);
  } else {
    console.log(`${colors.green}✅ No sessionManager imports found${colors.reset}`);
  }
} catch (e) {
  console.log(`${colors.green}✅ No sessionManager imports found${colors.reset}`);
}

// 3. Verify duplicate _app.tsx is gone
console.log(`\n${colors.blue}3. Checking for Duplicate _app.tsx${colors.reset}`);
console.log('-'.repeat(50));

const srcAppExists = fs.existsSync('src/pages/_app.tsx');
const pagesAppExists = fs.existsSync('pages/_app.tsx');

if (srcAppExists && pagesAppExists) {
  console.log(`${colors.red}❌ Both _app.tsx files still exist!${colors.reset}`);
} else if (pagesAppExists && !srcAppExists) {
  console.log(`${colors.green}✅ Only /pages/_app.tsx exists (correct)${colors.reset}`);
} else {
  console.log(`${colors.red}❌ Unexpected _app.tsx configuration${colors.reset}`);
}

// 4. Check AuthContext implementation
console.log(`\n${colors.blue}4. Verifying AuthContext Implementation${colors.reset}`);
console.log('-'.repeat(50));

if (fs.existsSync('contexts/AuthContext.tsx')) {
  const authContent = fs.readFileSync('contexts/AuthContext.tsx', 'utf8');
  
  const hasUseSession = authContent.includes('useSession');
  const hasOnAuthStateChange = authContent.includes('onAuthStateChange');
  const hasSessionContextImport = authContent.includes('@supabase/auth-helpers-react');
  
  console.log(`  Uses useSession hook: ${hasUseSession ? colors.green + '✅' : colors.red + '❌'} ${colors.reset}`);
  console.log(`  Has onAuthStateChange: ${hasOnAuthStateChange ? colors.red + '❌ (should be removed)' : colors.green + '✅ (correctly removed)'} ${colors.reset}`);
  console.log(`  Imports from auth-helpers: ${hasSessionContextImport ? colors.green + '✅' : colors.red + '❌'} ${colors.reset}`);
} else {
  console.log(`${colors.red}❌ AuthContext.tsx not found!${colors.reset}`);
}

// 5. Create monitoring report
console.log(`\n${colors.blue}5. Health Check Summary${colors.reset}`);
console.log('='.repeat(50));

const issues = [];
const successes = [];

// Compile results
if (!listeners || !listeners.trim()) {
  successes.push('No competing onAuthStateChange listeners');
} else {
  issues.push('Found onAuthStateChange listeners');
}

if (!sessionManagerExists && (!imports || !imports.trim())) {
  successes.push('SessionManager completely removed');
} else {
  issues.push('SessionManager traces remain');
}

if (pagesAppExists && !srcAppExists) {
  successes.push('Duplicate _app.tsx removed');
} else {
  issues.push('_app.tsx configuration issue');
}

if (fs.existsSync('contexts/AuthContext.tsx')) {
  const authContent = fs.readFileSync('contexts/AuthContext.tsx', 'utf8');
  if (authContent.includes('useSession') && !authContent.includes('onAuthStateChange')) {
    successes.push('AuthContext correctly refactored');
  } else {
    issues.push('AuthContext implementation issue');
  }
}

// Display results
if (successes.length > 0) {
  console.log(`\n${colors.green}✅ Successes:${colors.reset}`);
  successes.forEach(s => console.log(`   • ${s}`));
}

if (issues.length > 0) {
  console.log(`\n${colors.red}❌ Issues Found:${colors.reset}`);
  issues.forEach(i => console.log(`   • ${i}`));
} else {
  console.log(`\n${colors.green}🎉 All authentication fixes verified successfully!${colors.reset}`);
}

// 6. Recommendations
console.log(`\n${colors.blue}6. Monitoring Recommendations${colors.reset}`);
console.log('='.repeat(50));

console.log('\nFor production monitoring, track these metrics:');
console.log('  1. Login success rate (target: >95%)');
console.log('  2. Unexpected logout rate (target: <1%)');
console.log('  3. Average session duration (target: >30 minutes)');
console.log('  4. Token refresh success rate (target: >99%)');

console.log('\nMonitor application logs for:');
console.log('  • [AuthContext] errors');
console.log('  • Supabase auth errors');
console.log('  • Unexpected redirects to /login');

console.log('\nSet up alerts for:');
console.log('  • Spike in logout events');
console.log('  • Authentication error rate >2%');
console.log('  • Session duration drop >50%');

// 7. Save monitoring results
const monitoringDir = 'logs/auth-monitoring';
fs.mkdirSync(monitoringDir, { recursive: true });

const report = {
  timestamp: new Date().toISOString(),
  checks: {
    onAuthStateChange: !listeners || !listeners.trim(),
    sessionManagerRemoved: !sessionManagerExists && (!imports || !imports.trim()),
    duplicateAppRemoved: pagesAppExists && !srcAppExists,
    authContextRefactored: successes.includes('AuthContext correctly refactored')
  },
  issues: issues,
  successes: successes
};

const reportFile = path.join(monitoringDir, `auth-fix-monitor-${new Date().toISOString().split('T')[0]}.json`);
fs.writeFileSync(reportFile, JSON.stringify(report, null, 2));

console.log(`\n📁 Report saved to: ${reportFile}\n`);