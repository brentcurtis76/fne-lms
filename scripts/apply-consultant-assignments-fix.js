const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('Missing required environment variables');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
});

async function applyFix() {
  console.log('🔧 Applying consultant assignments RLS fix...\n');

  try {
    // Read the SQL file
    const sqlPath = path.join(__dirname, '..', 'database', 'fix-consultant-assignments-rls.sql');
    const sql = fs.readFileSync(sqlPath, 'utf8');

    // Execute the SQL
    console.log('📝 Executing SQL to fix consultant_assignments RLS policies...');
    const { data, error } = await supabase.rpc('exec_sql', { query: sql });

    if (error) {
      throw error;
    }

    console.log('✅ Successfully updated consultant_assignments RLS policies!\n');

    // Verify the policies
    console.log('🔍 Verifying updated policies...\n');
    
    const { data: policies, error: verifyError } = await supabase.rpc('exec_sql', {
      query: `
        SELECT 
            policyname,
            cmd,
            qual
        FROM pg_policies
        WHERE tablename = 'consultant_assignments'
        ORDER BY policyname;
      `
    });

    if (verifyError) {
      console.error('Error verifying policies:', verifyError);
    } else if (policies && policies.length > 0) {
      console.log('Current policies on consultant_assignments:');
      policies.forEach(policy => {
        console.log(`\n📋 Policy: ${policy.policyname}`);
        console.log(`   Command: ${policy.cmd}`);
        console.log(`   Uses user_roles: ${policy.qual.includes('user_roles') ? '✅ Yes' : '❌ No (still using profiles.role!)'}`);
      });
    }

    console.log('\n✨ Fix completed successfully!');
    console.log('\n💡 Next steps:');
    console.log('1. Test consultant assignment creation/viewing as an admin user');
    console.log('2. Verify consultants can see their assigned students');
    console.log('3. Check that the consultant assignments page loads without errors');

  } catch (error) {
    console.error('❌ Error applying fix:', error);
    process.exit(1);
  }
}

// Note about manual execution
console.log('⚠️  Note: If this script fails, you can manually execute the SQL:');
console.log('1. Go to Supabase Dashboard > SQL Editor');
console.log('2. Copy contents of database/fix-consultant-assignments-rls.sql');
console.log('3. Execute the SQL\n');

applyFix();