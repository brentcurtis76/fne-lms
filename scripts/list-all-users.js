/**
 * List all users in the system
 */

require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
});

async function listUsers() {
  const { data: authUser, error } = await supabase.auth.admin.listUsers();

  if (error) {
    console.error('Error:', error.message);
    return;
  }

  console.log(`\n📧 All ${authUser?.users?.length || 0} users:\n`);
  authUser?.users?.forEach((u, i) => {
    console.log(`${i + 1}. ${u.email}`);
  });
}

listUsers().catch(console.error);
