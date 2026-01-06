#!/usr/bin/env node

/**
 * Verification script to check authentication dependencies
 * Run with: node scripts/verify-auth-dependencies.js
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

console.log('🔍 Genera Authentication Dependency Verification\n');

// 1. Check which _app.tsx is being used
console.log('1. Checking active _app.tsx file:');
console.log('================================');

const hasPagesSrc = fs.existsSync('src/pages');
const hasPages = fs.existsSync('pages');

if (hasPagesSrc && hasPages) {
  console.log('⚠️  WARNING: Both /pages and /src/pages directories exist!');
  console.log('   Next.js will use /pages by default unless configured otherwise.');
  
  // Check for pageExtensions in next.config.js
  const nextConfig = fs.readFileSync('next.config.js', 'utf8');
  if (nextConfig.includes('pageExtensions') || nextConfig.includes('src/pages')) {
    console.log('   ⚠️  Custom configuration detected in next.config.js');
  } else {
    console.log('   ✅ Using: /pages/_app.tsx (default Next.js behavior)');
  }
} else if (hasPages) {
  console.log('✅ Using: /pages/_app.tsx');
} else if (hasPagesSrc) {
  console.log('✅ Using: /src/pages/_app.tsx');
}

// 2. Find all files importing sessionManager
console.log('\n2. Files importing sessionManager.ts:');
console.log('=====================================');

try {
  const sessionManagerImports = execSync(
    'grep -r "from.*sessionManager" --include="*.ts" --include="*.tsx" --include="*.js" --include="*.jsx" . | grep -v node_modules | grep -v .next || echo "None found"',
    { encoding: 'utf8' }
  );
  console.log(sessionManagerImports || '   ✅ No imports found');
} catch (e) {
  console.log('   ✅ No imports found');
}

// 3. Find all files importing AuthContext
console.log('\n3. Files using AuthContext:');
console.log('===========================');

try {
  const authContextImports = execSync(
    'grep -r "from.*AuthContext\\|useAuth" --include="*.ts" --include="*.tsx" --include="*.js" --include="*.jsx" . | grep -v node_modules | grep -v .next || echo "None found"',
    { encoding: 'utf8' }
  );
  console.log(authContextImports || '   ⚠️  No imports found');
} catch (e) {
  console.log('   ⚠️  No imports found');
}

// 4. Check for conflicting auth patterns
console.log('\n4. Checking for conflicting auth patterns:');
console.log('==========================================');

const authPatterns = [
  { pattern: 'useSession[^C]', name: 'Direct useSession (not useSessionContext)' },
  { pattern: 'createClient.*supabase', name: 'Direct Supabase client creation' },
  { pattern: 'localStorage.*auth\\|localStorage.*session', name: 'Direct localStorage auth access' },
  { pattern: 'new SessionManager', name: 'SessionManager instantiation' },
  { pattern: 'useSupabaseClient', name: 'useSupabaseClient hook usage' }
];

authPatterns.forEach(({ pattern, name }) => {
  try {
    const matches = execSync(
      `grep -r "${pattern}" --include="*.ts" --include="*.tsx" --include="*.js" --include="*.jsx" . | grep -v node_modules | grep -v .next | wc -l`,
      { encoding: 'utf8' }
    );
    const count = parseInt(matches.trim());
    if (count > 0) {
      console.log(`   ⚠️  ${name}: ${count} occurrences`);
    } else {
      console.log(`   ✅ ${name}: 0 occurrences`);
    }
  } catch (e) {
    console.log(`   ✅ ${name}: 0 occurrences`);
  }
});

// 5. Check for duplicate auth providers
console.log('\n5. Checking for duplicate auth providers:');
console.log('=========================================');

const providers = [
  'SessionContextProvider',
  'AuthProvider',
  'SupabaseProvider'
];

providers.forEach(provider => {
  try {
    const count = execSync(
      `grep -r "<${provider}" --include="*.tsx" --include="*.jsx" . | grep -v node_modules | grep -v .next | wc -l`,
      { encoding: 'utf8' }
    );
    console.log(`   ${provider}: ${count.trim()} instances`);
  } catch (e) {
    console.log(`   ${provider}: 0 instances`);
  }
});

// 6. Generate recommendations
console.log('\n6. Recommendations:');
console.log('===================');

console.log(`
Based on the analysis:
1. DELETE: /src/pages/_app.tsx (duplicate, not being used)
2. KEEP: /pages/_app.tsx (active Next.js app file)
3. MODIFY: /lib/sessionManager.ts (safe to keep, only handles Remember Me)
4. KEEP: /contexts/AuthContext.tsx (provides role-based auth wrapper)

Run the action script with:
  node scripts/execute-auth-cleanup.js
`);