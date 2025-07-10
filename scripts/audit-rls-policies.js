#!/usr/bin/env node

/**
 * RLS Policy Audit Script
 * 
 * This script performs a comprehensive audit of all RLS policies in the database,
 * checking for legacy references and potential issues.
 * 
 * Usage: node scripts/audit-rls-policies.js [--fix]
 */

import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const LEGACY_PATTERNS = [
  'profiles.role',
  'profile.role',
  "profiles'.'role'",
  'profiles.is_admin'
];

async function auditRLSPolicies() {
  console.log('🔍 Starting RLS Policy Audit...\n');
  
  const results = {
    timestamp: new Date().toISOString(),
    summary: {
      tablesWithRLS: 0,
      totalPolicies: 0,
      policiesWithLegacyReferences: 0,
      tablesNeedingFixes: []
    },
    details: {},
    recommendations: []
  };

  try {
    // 1. Get all tables with RLS enabled
    const { data: tables, error: tablesError } = await supabase.rpc('get_tables_with_rls', {});
    
    if (tablesError) {
      // Fallback query if function doesn't exist
      const { data, error } = await supabase
        .from('pg_tables')
        .select('tablename')
        .eq('schemaname', 'public')
        .eq('rowsecurity', true);
      
      if (error) throw error;
      tables = data;
    }

    console.log(`Found ${tables?.length || 0} tables with RLS enabled\n`);
    results.summary.tablesWithRLS = tables?.length || 0;

    // 2. Check each table's policies
    for (const table of tables || []) {
      const tableName = table.tablename || table.table_name;
      console.log(`Checking table: ${tableName}`);
      
      const tableResults = {
        hasRLS: true,
        policies: [],
        issues: [],
        recommendations: []
      };

      // Get policies for this table
      const { data: policies, error: policiesError } = await supabase
        .from('pg_policies')
        .select('*')
        .eq('tablename', tableName);

      if (policiesError) {
        console.error(`  ❌ Error fetching policies: ${policiesError.message}`);
        tableResults.issues.push(`Error fetching policies: ${policiesError.message}`);
        continue;
      }

      results.summary.totalPolicies += policies?.length || 0;

      // Check each policy
      for (const policy of policies || []) {
        const policyInfo = {
          name: policy.policyname,
          command: policy.cmd,
          permissive: policy.permissive,
          roles: policy.roles,
          hasLegacyReferences: false,
          legacyPatterns: []
        };

        // Check for legacy patterns
        const checkString = `${policy.qual || ''} ${policy.with_check || ''}`.toLowerCase();
        
        for (const pattern of LEGACY_PATTERNS) {
          if (checkString.includes(pattern.toLowerCase())) {
            policyInfo.hasLegacyReferences = true;
            policyInfo.legacyPatterns.push(pattern);
            results.summary.policiesWithLegacyReferences++;
          }
        }

        if (policyInfo.hasLegacyReferences) {
          console.log(`  ⚠️  Policy "${policy.policyname}" contains legacy references: ${policyInfo.legacyPatterns.join(', ')}`);
          tableResults.issues.push(`Policy "${policy.policyname}" references legacy columns`);
          
          if (!results.summary.tablesNeedingFixes.includes(tableName)) {
            results.summary.tablesNeedingFixes.push(tableName);
          }
        } else {
          console.log(`  ✅ Policy "${policy.policyname}" is clean`);
        }

        tableResults.policies.push(policyInfo);
      }

      // Generate recommendations
      if (tableResults.issues.length > 0) {
        tableResults.recommendations.push(
          `Update policies to use user_roles table instead of profiles.role`,
          `Test with multiple user types after updating policies`,
          `Consider using the RLS fix template in RLS_TROUBLESHOOTING_GUIDE.md`
        );
      }

      results.details[tableName] = tableResults;
      console.log('');
    }

    // 3. Check for tables that might need RLS but don't have it
    const criticalTables = [
      'profiles', 'user_roles', 'schools', 'courses', 'assignments',
      'growth_communities', 'generations', 'consultant_assignments'
    ];

    console.log('Checking critical tables without RLS...');
    for (const tableName of criticalTables) {
      if (!results.details[tableName]) {
        const { data: tableExists } = await supabase
          .from('pg_tables')
          .select('rowsecurity')
          .eq('tablename', tableName)
          .eq('schemaname', 'public')
          .single();

        if (tableExists && !tableExists.rowsecurity) {
          console.log(`  ⚠️  Table "${tableName}" exists but has no RLS enabled`);
          results.recommendations.push(`Consider enabling RLS on ${tableName}`);
        }
      }
    }

    // 4. Generate summary and recommendations
    console.log('\n' + '='.repeat(60));
    console.log('AUDIT SUMMARY');
    console.log('='.repeat(60));
    console.log(`Total tables with RLS: ${results.summary.tablesWithRLS}`);
    console.log(`Total policies: ${results.summary.totalPolicies}`);
    console.log(`Policies with legacy references: ${results.summary.policiesWithLegacyReferences}`);
    console.log(`Tables needing fixes: ${results.summary.tablesNeedingFixes.length}`);
    
    if (results.summary.tablesNeedingFixes.length > 0) {
      console.log('\nTables requiring attention:');
      results.summary.tablesNeedingFixes.forEach(t => console.log(`  - ${t}`));
    }

    // 5. Save detailed report
    const reportPath = path.join(__dirname, `../rls-audit-${Date.now()}.json`);
    await fs.writeFile(reportPath, JSON.stringify(results, null, 2));
    console.log(`\n📄 Detailed report saved to: ${reportPath}`);

    // 6. Generate fix script if needed
    if (results.summary.policiesWithLegacyReferences > 0) {
      const fixScript = generateFixScript(results);
      const fixPath = path.join(__dirname, `../rls-fixes-${Date.now()}.sql`);
      await fs.writeFile(fixPath, fixScript);
      console.log(`🔧 Fix script generated: ${fixPath}`);
    }

    return results;

  } catch (error) {
    console.error('Audit failed:', error);
    process.exit(1);
  }
}

function generateFixScript(auditResults) {
  let script = `-- RLS Policy Fix Script
-- Generated: ${new Date().toISOString()}
-- Tables to fix: ${auditResults.summary.tablesNeedingFixes.join(', ')}

BEGIN;

`;

  for (const tableName of auditResults.summary.tablesNeedingFixes) {
    const tableInfo = auditResults.details[tableName];
    
    script += `
-- Fix policies for ${tableName}
-- Issues: ${tableInfo.issues.join('; ')}

`;

    // Add specific fixes based on common patterns
    if (tableName === 'schools' || tableName === 'generations' || tableName === 'growth_communities') {
      script += `-- Allow authenticated users to read
DROP POLICY IF EXISTS "Users can view ${tableName}" ON ${tableName};
DROP POLICY IF EXISTS "Authenticated users can view ${tableName}" ON ${tableName};

CREATE POLICY "authenticated_read_${tableName}" ON ${tableName}
    FOR SELECT
    USING (auth.uid() IS NOT NULL);

-- Admin full access
DROP POLICY IF EXISTS "Admin can do everything with ${tableName}" ON ${tableName};
DROP POLICY IF EXISTS "Admin full access to ${tableName}" ON ${tableName};

CREATE POLICY "admin_all_${tableName}" ON ${tableName}
    FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM user_roles 
            WHERE user_id = auth.uid() 
            AND role_type = 'admin'
            AND is_active = true
        )
    );

`;
    }
  }

  script += `
-- Test the changes before committing
-- Add your test queries here

COMMIT;
`;

  return script;
}

// Run the audit
auditRLSPolicies()
  .then(() => {
    console.log('\n✅ Audit complete!');
    process.exit(0);
  })
  .catch(error => {
    console.error('\n❌ Audit failed:', error);
    process.exit(1);
  });

export { auditRLSPolicies };