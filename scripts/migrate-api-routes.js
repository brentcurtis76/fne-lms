#!/usr/bin/env node

/**
 * Script to identify API routes that need migration to new auth helpers
 * Run with: node scripts/migrate-api-routes.js
 */

const fs = require('fs').promises;
const path = require('path');

// Patterns that indicate old authentication style
const OLD_AUTH_PATTERNS = [
  /createClient\s*\(/,                              // Direct createClient usage
  /req\.headers\.authorization/,                    // Manual token extraction
  /getUser\(token\)/,                              // Manual token validation
  /supabaseAdmin\s*=\s*createClient/,             // Admin client creation
  /SUPABASE_SERVICE_ROLE_KEY.*createClient/,      // Service role client
  /from\s+['"]@supabase\/supabase-js['"]/         // Direct import from supabase-js
];

// Patterns that indicate new auth helpers are being used
const NEW_AUTH_PATTERNS = [
  /from\s+['"].*api-auth['"]/,                    // Import from api-auth
  /checkIsAdmin/,                                  // Using checkIsAdmin helper
  /getApiUser/,                                    // Using getApiUser helper
  /createApiSupabaseClient/,                       // Using createApiSupabaseClient
  /createServiceRoleClient/                        // Using createServiceRoleClient
];

async function checkFile(filePath) {
  try {
    const content = await fs.readFile(filePath, 'utf8');
    
    // Check if it's already using new auth
    const hasNewAuth = NEW_AUTH_PATTERNS.some(pattern => pattern.test(content));
    if (hasNewAuth) {
      return { status: 'migrated', patterns: [] };
    }
    
    // Check for old patterns
    const foundPatterns = [];
    OLD_AUTH_PATTERNS.forEach((pattern, index) => {
      if (pattern.test(content)) {
        foundPatterns.push(index);
      }
    });
    
    if (foundPatterns.length > 0) {
      return { status: 'needs-migration', patterns: foundPatterns };
    }
    
    return { status: 'unknown', patterns: [] };
  } catch (error) {
    console.error(`Error reading ${filePath}:`, error.message);
    return { status: 'error', patterns: [] };
  }
}

async function scanApiRoutes() {
  const apiDir = path.join(process.cwd(), 'pages', 'api');
  const results = {
    migrated: [],
    needsMigration: [],
    unknown: [],
    errors: []
  };
  
  async function scanDir(dir) {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      
      if (entry.isDirectory()) {
        await scanDir(fullPath);
      } else if (entry.isFile() && (entry.name.endsWith('.ts') || entry.name.endsWith('.js'))) {
        // Skip test files and type definition files
        if (entry.name.includes('.test.') || entry.name.endsWith('.d.ts')) {
          continue;
        }
        
        const relativePath = path.relative(apiDir, fullPath);
        const result = await checkFile(fullPath);
        
        switch (result.status) {
          case 'migrated':
            results.migrated.push(relativePath);
            break;
          case 'needs-migration':
            results.needsMigration.push({ path: relativePath, patterns: result.patterns });
            break;
          case 'unknown':
            results.unknown.push(relativePath);
            break;
          case 'error':
            results.errors.push(relativePath);
            break;
        }
      }
    }
  }
  
  await scanDir(apiDir);
  return results;
}

// Pattern descriptions for reporting
const PATTERN_DESCRIPTIONS = [
  'Direct createClient usage',
  'Manual token extraction from headers',
  'Manual token validation with getUser',
  'Admin client creation pattern',
  'Service role client creation',
  'Direct import from @supabase/supabase-js'
];

async function main() {
  console.log('🔍 Scanning API routes for authentication patterns...\n');
  
  const results = await scanApiRoutes();
  
  console.log('📊 Migration Status Summary:');
  console.log(`✅ Already migrated: ${results.migrated.length}`);
  console.log(`❌ Needs migration: ${results.needsMigration.length}`);
  console.log(`❓ Unknown/No auth: ${results.unknown.length}`);
  console.log(`⚠️  Errors: ${results.errors.length}`);
  
  if (results.migrated.length > 0) {
    console.log('\n✅ Already Migrated:');
    results.migrated.forEach(file => {
      console.log(`   - ${file}`);
    });
  }
  
  if (results.needsMigration.length > 0) {
    console.log('\n❌ Needs Migration:');
    results.needsMigration.forEach(({ path, patterns }) => {
      console.log(`   - ${path}`);
      patterns.forEach(patternIndex => {
        console.log(`     ⚠️  ${PATTERN_DESCRIPTIONS[patternIndex]}`);
      });
    });
    
    console.log('\n📝 Migration Checklist:');
    console.log('1. Import auth helpers from lib/api-auth');
    console.log('2. Replace manual token extraction with getApiUser or checkIsAdmin');
    console.log('3. Replace createClient calls with createApiSupabaseClient or createServiceRoleClient');
    console.log('4. Use sendAuthError and sendApiResponse for consistent responses');
    console.log('5. Add logApiRequest at the beginning of handlers');
    console.log('6. Add proper TypeScript types for responses');
  }
  
  if (results.unknown.length > 0) {
    console.log('\n❓ No Authentication Detected (may not need auth):');
    results.unknown.forEach(file => {
      console.log(`   - ${file}`);
    });
  }
  
  if (results.errors.length > 0) {
    console.log('\n⚠️  Errors Reading Files:');
    results.errors.forEach(file => {
      console.log(`   - ${file}`);
    });
  }
  
  console.log('\n📈 Progress: ' + 
    Math.round((results.migrated.length / (results.migrated.length + results.needsMigration.length)) * 100) + 
    '% complete');
}

main().catch(console.error);