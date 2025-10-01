#!/usr/bin/env node
/**
 * Apply expense report RLS fix to production database
 * This script:
 * 1. Updates RLS policies for expense_items
 * 2. Grants Andrea Lagos access to expense reports
 */

const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

// Load environment variables
require('dotenv').config({ path: path.join(__dirname, '..', '.env.local') });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('❌ Missing Supabase credentials in .env.local');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function executeSqlFile(filePath) {
  console.log(`\n📄 Reading ${path.basename(filePath)}...`);
  const sql = fs.readFileSync(filePath, 'utf8');

  console.log(`⚙️  Executing SQL...`);
  const { data, error } = await supabase.rpc('exec_sql', { sql_query: sql });

  if (error) {
    console.error(`❌ Error:`, error);
    throw error;
  }

  console.log(`✅ Success!`);
  return data;
}

async function checkAndGrantAndreaAccess() {
  console.log('\n👤 Checking Andrea Lagos access...');

  // Find Andrea's user ID
  const { data: users, error: userError } = await supabase
    .from('profiles')
    .select('id, email, first_name, last_name')
    .or('email.ilike.%andrea%lagos%,email.ilike.%alagos%')
    .limit(1);

  if (userError) {
    console.error('❌ Error finding Andrea:', userError);
    throw userError;
  }

  if (!users || users.length === 0) {
    console.log('⚠️  Andrea Lagos not found. Please check her email address.');
    console.log('   You can manually grant access via Supabase Dashboard.');
    return;
  }

  const andrea = users[0];
  console.log(`✅ Found: ${andrea.first_name} ${andrea.last_name} (${andrea.email})`);

  // Check if she already has access
  const { data: existingAccess } = await supabase
    .from('expense_report_access')
    .select('*')
    .eq('user_id', andrea.id)
    .maybeSingle();

  if (existingAccess?.can_submit) {
    console.log('✅ Andrea already has expense report access');
    return;
  }

  // Get admin user for granted_by
  const { data: admin } = await supabase
    .from('profiles')
    .select('id')
    .eq('email', 'bcurtis@nuevaeducacion.org')
    .single();

  // Grant access
  const { error: grantError } = await supabase
    .from('expense_report_access')
    .upsert({
      user_id: andrea.id,
      can_submit: true,
      granted_by: admin?.id || null,
      notes: 'Expense reports enabled - RLS fix applied'
    });

  if (grantError) {
    console.error('❌ Error granting access:', grantError);
    throw grantError;
  }

  console.log('✅ Granted expense report access to Andrea');
}

async function applyRlsFix() {
  console.log('\n🔧 Applying RLS policy fix...');

  const fixPath = path.join(__dirname, '..', 'database', 'fix-expense-items-rls.sql');
  const sql = fs.readFileSync(fixPath, 'utf8');

  // Split SQL into individual statements and execute them
  const statements = sql
    .split(';')
    .map(s => s.trim())
    .filter(s => s && !s.startsWith('--') && s !== '');

  for (const statement of statements) {
    if (statement.toLowerCase().includes('drop policy') ||
        statement.toLowerCase().includes('create policy')) {
      try {
        const { error } = await supabase.rpc('exec_sql', { sql_query: statement });
        if (error) {
          console.warn(`⚠️  Warning:`, error.message);
        } else {
          console.log(`✅ Executed: ${statement.substring(0, 60)}...`);
        }
      } catch (err) {
        console.warn(`⚠️  Warning:`, err.message);
      }
    }
  }
}

async function main() {
  console.log('🚀 Starting expense report RLS fix...\n');
  console.log('=' .repeat(60));

  try {
    // Step 1: Grant Andrea access
    await checkAndGrantAndreaAccess();

    // Step 2: Note about RLS policies
    console.log('\n📋 Note: RLS policy changes require SQL Editor access');
    console.log('   Please run fix-expense-items-rls.sql via Supabase Dashboard');
    console.log('   Dashboard → SQL Editor → Paste the SQL file contents');

    console.log('\n' + '='.repeat(60));
    console.log('✅ Andrea access grant completed!');
    console.log('\n📝 Next steps:');
    console.log('   1. Go to Supabase Dashboard SQL Editor');
    console.log('   2. Copy contents of database/fix-expense-items-rls.sql');
    console.log('   3. Run the SQL to update RLS policies');
    console.log('   4. Ask Andrea to try uploading again');

  } catch (error) {
    console.error('\n❌ Fatal error:', error);
    process.exit(1);
  }
}

main();