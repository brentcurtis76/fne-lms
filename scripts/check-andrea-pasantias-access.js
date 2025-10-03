require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

(async () => {
  console.log('=== CHECKING ANDREA LAGOS PASANTÍAS ACCESS ===\n');

  // Get Andrea's profile
  const { data: user, error: userError } = await supabase
    .from('profiles')
    .select('id, email, first_name, last_name')
    .eq('email', 'andrealagosgomez@gmail.com')
    .single();

  if (userError || !user) {
    console.log('❌ User not found:', userError);
    return;
  }

  console.log('User:', user.email);
  console.log('User ID:', user.id);
  console.log('Name:', user.first_name, user.last_name);
  console.log();

  // Check user roles
  const { data: roles, error: rolesError } = await supabase
    .from('user_roles')
    .select('*')
    .eq('user_id', user.id);

  console.log('User Roles:');
  if (roles && roles.length > 0) {
    roles.forEach(role => {
      console.log(`  - ${role.role_type} (active: ${role.is_active})`);
    });
  } else {
    console.log('  ❌ NO ROLES FOUND');
  }
  console.log();

  // Check RLS policies on pasantias_quotes table
  const { data: policies, error: policiesError } = await supabase
    .rpc('exec_sql', {
      sql: `
        SELECT schemaname, tablename, policyname, roles, cmd, qual
        FROM pg_policies
        WHERE schemaname = 'public'
        AND tablename = 'pasantias_quotes';
      `
    });

  console.log('RLS Policies on pasantias_quotes:');
  if (policies) {
    policies.forEach(p => {
      console.log(`  - ${p.policyname} (${p.cmd})`);
    });
  } else {
    console.log('  Could not fetch policies');
  }
  console.log();

  // Try to query pasantias_quotes as Andrea
  const { data: quotes, error: quotesError } = await supabase
    .from('pasantias_quotes')
    .select('*')
    .eq('created_by', user.id);

  console.log('Can Andrea query her own quotes?');
  if (quotesError) {
    console.log('  ❌ ERROR:', quotesError.message);
  } else {
    console.log('  ✅ YES - Found', quotes?.length || 0, 'quotes');
  }

})();
