#!/usr/bin/env node

/**
 * Batch API Migration Helper
 * This script helps generate migration templates for common API patterns
 * Run with: node scripts/batch-migrate-api.js
 */

const fs = require('fs').promises;
const path = require('path');

// Template for migrating API routes
const MIGRATION_TEMPLATE = `
// ========== MIGRATION CHECKLIST ==========
// 1. Replace imports:
//    FROM: import { createClient } from '@supabase/supabase-js';
//    TO:   Import from '../../../lib/api-auth'
//
// 2. Remove client creation:
//    DELETE: const supabase = createClient(...)
//    DELETE: const supabaseAdmin = createClient(...)
//
// 3. Update handler signature:
//    FROM: export default async function handler(req: NextApiRequest, res: NextApiResponse)
//    TO:   export default async function handler(req: NextApiRequest, res: NextApiResponse<ApiSuccess<any> | ApiError>)
//
// 4. Add request logging:
//    ADD: logApiRequest(req, 'endpoint-name');
//
// 5. Replace auth checks:
//    FROM: const token = authHeader.replace('Bearer ', '');
//          const { data: { user }, error } = await supabase.auth.getUser(token);
//    TO:   const { user, error } = await getApiUser(req, res);
//          if (error || !user) return sendAuthError(res, 'Authentication required');
//
// 6. For admin checks:
//    FROM: Manual profile role check
//    TO:   const { isAdmin, user, error } = await checkIsAdmin(req, res);
//
// 7. Create clients when needed:
//    FOR USER: const supabase = await createApiSupabaseClient(req, res);
//    FOR ADMIN: const supabaseAdmin = createServiceRoleClient();
//
// 8. Update responses:
//    FROM: res.status(200).json({ ... })
//    TO:   return sendApiResponse(res, { ... });
//
//    FROM: res.status(XXX).json({ error: '...' })
//    TO:   return sendAuthError(res, '...', XXX);
//
// 9. Update error logging:
//    FROM: console.error('...')
//    TO:   console.error('[API] ...')
//
// 10. Validate request body:
//     ADD: const { valid, missing } = validateRequestBody<Type>(req.body, ['field1', 'field2']);
//          if (!valid) return sendAuthError(res, \`Missing required fields: \${missing.join(', ')}\`, 400);
// ==========================================
`;

// Common import replacements
const IMPORT_REPLACEMENTS = {
  basic: `import { 
  getApiUser, 
  createApiSupabaseClient, 
  sendAuthError, 
  sendApiResponse,
  logApiRequest
} from '../../../lib/api-auth';
import { ApiError, ApiSuccess } from '../../../lib/types/api-auth.types';`,
  
  admin: `import { 
  checkIsAdmin, 
  createServiceRoleClient, 
  sendAuthError, 
  sendApiResponse,
  validateRequestBody,
  logApiRequest
} from '../../../lib/api-auth';
import { ApiError, ApiSuccess } from '../../../lib/types/api-auth.types';`,
  
  full: `import { 
  getApiUser,
  checkIsAdmin,
  createApiSupabaseClient,
  createServiceRoleClient, 
  sendAuthError, 
  sendApiResponse,
  validateRequestBody,
  logApiRequest,
  handleMethodNotAllowed
} from '../../../lib/api-auth';
import { ApiError, ApiSuccess } from '../../../lib/types/api-auth.types';`
};

// Pattern matchers
const PATTERNS = {
  hasAdminCheck: /profile.*role.*admin|checkIsAdmin/i,
  hasServiceRole: /SUPABASE_SERVICE_ROLE_KEY|supabaseAdmin/,
  hasValidation: /req\.body\./,
  hasMethodCheck: /req\.method\s*!==?\s*['"](?:GET|POST|PUT|DELETE)['"]/
};

async function analyzeFile(filePath) {
  const content = await fs.readFile(filePath, 'utf8');
  
  const analysis = {
    hasAdminCheck: PATTERNS.hasAdminCheck.test(content),
    hasServiceRole: PATTERNS.hasServiceRole.test(content),
    hasValidation: PATTERNS.hasValidation.test(content),
    hasMethodCheck: PATTERNS.hasMethodCheck.test(content),
    importType: 'basic'
  };
  
  // Determine import type
  if (analysis.hasAdminCheck && analysis.hasServiceRole) {
    analysis.importType = 'admin';
  } else if (analysis.hasAdminCheck || analysis.hasServiceRole) {
    analysis.importType = 'full';
  }
  
  return analysis;
}

async function generateMigrationGuide(filePath) {
  const fileName = path.basename(filePath);
  const analysis = await analyzeFile(filePath);
  
  console.log(`\n${'='.repeat(60)}`);
  console.log(`📄 Migration Guide for: ${fileName}`);
  console.log(`${'='.repeat(60)}`);
  
  console.log('\n📊 Analysis:');
  console.log(`  - Has admin check: ${analysis.hasAdminCheck ? '✅' : '❌'}`);
  console.log(`  - Uses service role: ${analysis.hasServiceRole ? '✅' : '❌'}`);
  console.log(`  - Has body validation: ${analysis.hasValidation ? '✅' : '❌'}`);
  console.log(`  - Has method check: ${analysis.hasMethodCheck ? '✅' : '❌'}`);
  console.log(`  - Recommended import type: ${analysis.importType}`);
  
  console.log('\n📝 Recommended imports:');
  console.log(IMPORT_REPLACEMENTS[analysis.importType]);
  
  console.log('\n💡 Quick tips:');
  if (analysis.hasAdminCheck) {
    console.log('  - Use checkIsAdmin() helper instead of manual role checking');
  }
  if (analysis.hasServiceRole) {
    console.log('  - Use createServiceRoleClient() for admin operations');
  }
  if (analysis.hasValidation) {
    console.log('  - Use validateRequestBody() helper for request validation');
  }
  
  console.log('\n📋 Full migration checklist:');
  console.log(MIGRATION_TEMPLATE);
}

async function findNeedsMigration() {
  const apiDir = path.join(process.cwd(), 'pages', 'api');
  const needsMigration = [];
  
  async function scanDir(dir) {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      
      if (entry.isDirectory()) {
        await scanDir(fullPath);
      } else if (entry.isFile() && (entry.name.endsWith('.ts') || entry.name.endsWith('.js'))) {
        const content = await fs.readFile(fullPath, 'utf8');
        
        // Check if needs migration
        if (content.includes('@supabase/supabase-js') && 
            !content.includes('api-auth')) {
          needsMigration.push(fullPath);
        }
      }
    }
  }
  
  await scanDir(apiDir);
  return needsMigration;
}

async function main() {
  console.log('🔍 Finding API routes that need migration...\n');
  
  const files = await findNeedsMigration();
  
  if (files.length === 0) {
    console.log('✅ All API routes have been migrated!');
    return;
  }
  
  console.log(`Found ${files.length} files that need migration:\n`);
  files.forEach((file, i) => {
    console.log(`  ${i + 1}. ${path.relative(process.cwd(), file)}`);
  });
  
  // Process first 3 files as examples
  console.log('\n📚 Generating migration guides for first 3 files...');
  
  for (let i = 0; i < Math.min(3, files.length); i++) {
    await generateMigrationGuide(files[i]);
  }
  
  console.log(`\n${'='.repeat(60)}`);
  console.log('✨ Migration helper complete!');
  console.log(`\nNext steps:`);
  console.log('1. Follow the migration checklist for each file');
  console.log('2. Test each endpoint after migration');
  console.log('3. Run scripts/test-auth-system-comprehensive.js to verify');
}

main().catch(console.error);