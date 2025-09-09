const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  },
  db: {
    schema: 'public'
  }
});

async function executeFix() {
  console.log('🔧 Executing function fix to remove duplicates...\n');

  // Since we can't execute DDL directly, let's use a workaround
  // First, let's check what roles are causing duplicates
  const { data: duplicateCheck } = await supabase.rpc('get_all_auth_users');
  
  // Group by user ID to find duplicates
  const userMap = new Map();
  duplicateCheck?.forEach(user => {
    if (!userMap.has(user.id)) {
      userMap.set(user.id, []);
    }
    userMap.get(user.id).push(user);
  });

  // Find users with duplicates
  const duplicates = Array.from(userMap.entries()).filter(([_, users]) => users.length > 1);
  
  console.log(`Found ${duplicates.length} users with duplicate entries`);
  
  // Show sample of duplicates
  duplicates.slice(0, 3).forEach(([userId, userEntries]) => {
    console.log(`\nUser ${userEntries[0].email}:`);
    userEntries.forEach(entry => {
      console.log(`  - Role: ${entry.role_type || 'none'}`);
    });
  });

  console.log('\n📝 Creating new function via Supabase Dashboard is required.');
  console.log('Please go to: https://sxlogxqzmarhqsblxmtj.supabase.co/project/sxlogxqzmarhqsblxmtj/sql/new');
  console.log('And run the contents of fix-duplicate-users-function.sql\n');

  // Show the SQL that needs to be run
  console.log('SQL to run:');
  console.log('```sql');
  console.log(`DROP FUNCTION IF EXISTS get_all_auth_users();

CREATE OR REPLACE FUNCTION get_all_auth_users()
RETURNS TABLE (
  id UUID,
  email TEXT,
  created_at TIMESTAMPTZ,
  email_confirmed_at TIMESTAMPTZ,
  last_sign_in_at TIMESTAMPTZ,
  first_name TEXT,
  last_name TEXT,
  school_id INTEGER,
  school_name TEXT,
  approval_status TEXT,
  role_type TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT DISTINCT ON (au.id)
    au.id,
    au.email::TEXT,
    au.created_at,
    au.email_confirmed_at,
    au.last_sign_in_at,
    p.first_name::TEXT,
    p.last_name::TEXT,
    p.school_id,
    s.name::TEXT as school_name,
    p.approval_status::TEXT,
    COALESCE(
      (SELECT ur.role_type::TEXT 
       FROM public.user_roles ur 
       WHERE ur.user_id = au.id 
       LIMIT 1),
      NULL
    ) as role_type
  FROM auth.users au
  LEFT JOIN public.profiles p ON au.id = p.id
  LEFT JOIN public.schools s ON p.school_id = s.id
  WHERE au.deleted_at IS NULL
  ORDER BY au.id, au.created_at DESC;
END;
$$;

GRANT EXECUTE ON FUNCTION get_all_auth_users() TO authenticated;`);
  console.log('```');
}

executeFix().catch(console.error);