import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, '..', '.env.local') });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('❌ Missing environment variables. Please check your .env.local file.');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  db: {
    schema: 'public'
  },
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
});

async function fixSchoolsRLS() {
  console.log('🔧 Fixing Schools RLS Policies...\n');

  try {
    // Read the SQL file
    const sqlFilePath = path.join(__dirname, '..', 'database', 'fix-schools-rls-policies.sql');
    const sqlContent = fs.readFileSync(sqlFilePath, 'utf8');
    
    // Extract the main fix SQL (before the verification query)
    const fixSQL = sqlContent.split('-- Verify the policies')[0].trim();
    
    console.log('📝 Executing SQL to fix schools RLS policies...');
    
    // Execute the SQL
    const { data, error } = await supabase.rpc('exec_sql', {
      sql_query: fixSQL
    });

    if (error) {
      // If exec_sql doesn't exist, we'll need to apply this manually
      console.error('⚠️  Could not execute SQL automatically:', error.message);
      console.log('\n📋 Please execute the following SQL manually in your Supabase SQL editor:\n');
      console.log('File location: /database/fix-schools-rls-policies.sql');
      console.log('\n' + '='.repeat(60));
      console.log(fixSQL);
      console.log('='.repeat(60) + '\n');
      return;
    }

    console.log('✅ Successfully fixed schools RLS policies!\n');

    // Verify the policies
    console.log('🔍 Verifying current policies on schools table...\n');
    
    const { data: policies, error: verifyError } = await supabase
      .from('pg_policies')
      .select('policyname, cmd, permissive')
      .eq('tablename', 'schools')
      .order('policyname');

    if (verifyError) {
      console.log('⚠️  Could not verify policies automatically. Please run this query manually:');
      console.log(`
SELECT policyname, cmd, roles, permissive
FROM pg_policies 
WHERE tablename = 'schools'
ORDER BY policyname;
      `);
      return;
    }

    console.log('Current policies on schools table:');
    console.log('='.repeat(60));
    policies.forEach(policy => {
      console.log(`Policy: ${policy.policyname}`);
      console.log(`  Command: ${policy.cmd}`);
      console.log(`  Permissive: ${policy.permissive}`);
      console.log('');
    });

    console.log('✅ RLS policies have been successfully updated!');
    console.log('\nExpected policies:');
    console.log('1. "authenticated_users_read_schools" - SELECT access for all authenticated users');
    console.log('2. "admin_full_access_schools" - Full access for admin users');

  } catch (error) {
    console.error('❌ Error:', error.message);
    console.log('\n📋 Please execute the SQL manually from:');
    console.log('   /database/fix-schools-rls-policies.sql');
  }
}

// Run the fix
fixSchoolsRLS();