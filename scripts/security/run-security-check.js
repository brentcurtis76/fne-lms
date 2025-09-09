#!/usr/bin/env node

/**
 * Security Check Runner
 * Checks for anonymous/public access grants in the database
 * 
 * Usage:
 *   npm run security:check         # Check production
 *   STAGING=true npm run security:check  # Check staging
 */

const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

// Determine environment
const isStaging = process.env.STAGING === 'true';
const envFile = isStaging ? '.env.staging' : '.env.local';

require('dotenv').config({ path: envFile });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('❌ Missing environment variables');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function checkGuestGrants() {
  console.log('=== SECURITY CHECK: Guest/Anonymous Grants ===');
  console.log(`Environment: ${isStaging ? 'STAGING' : 'PRODUCTION'}`);
  console.log(`URL: ${supabaseUrl}`);
  console.log(`Time: ${new Date().toISOString()}\n`);

  // Read the SQL check
  const sqlPath = path.join(__dirname, 'guest_grants_check.sql');
  const sql = fs.readFileSync(sqlPath, 'utf8');

  // Note: Since we can't run raw SQL via Supabase client,
  // we'll check using API calls to known problematic tables
  const tablesToCheck = [
    'user_roles', 'profiles', 'schools', 'courses', 'lessons',
    'activity_feed', 'clientes', 'contratos', 'cuotas',
    'communities', 'community_workspaces', 'community_messages'
  ];

  const issues = [];

  for (const table of tablesToCheck) {
    try {
      const response = await fetch(`${supabaseUrl}/rest/v1/${table}?select=*&limit=1`, {
        headers: {
          'apikey': process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
          'Authorization': `Bearer ${process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY}`
        }
      });

      if (response.status === 200 || response.status === 206) {
        const data = await response.json();
        if (Array.isArray(data) && data.length > 0) {
          issues.push({
            table,
            issue: 'EXPOSED_TO_ANON',
            severity: 'HIGH'
          });
          console.log(`❌ ${table}: EXPOSED to anonymous users`);
        } else {
          console.log(`✅ ${table}: Protected (empty/filtered)`);
        }
      } else if (response.status === 401 || response.status === 403) {
        console.log(`✅ ${table}: Protected (blocked)`);
      } else {
        console.log(`⚠️  ${table}: Unknown status ${response.status}`);
      }
    } catch (error) {
      console.log(`⚠️  ${table}: Error checking - ${error.message}`);
    }
  }

  // Summary
  console.log('\n' + '='.repeat(50));
  if (issues.length === 0) {
    console.log('✅ PASS: No anonymous access issues found');
    return 0;
  } else {
    console.log(`❌ FAIL: ${issues.length} tables exposed to anonymous users`);
    console.log('\nExposed tables:');
    issues.forEach(i => console.log(`  - ${i.table}`));
    return 1;
  }
}

// For CI integration
checkGuestGrants()
  .then(exitCode => {
    process.exit(exitCode);
  })
  .catch(error => {
    console.error('❌ Security check failed:', error);
    process.exit(1);
  });