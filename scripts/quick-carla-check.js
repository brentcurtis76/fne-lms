const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

(async () => {
  const { data } = await supabase.from('profiles').select('id, email, approval_status').ilike('email', '%carla%diaz%').limit(3);
  for (const p of data || []) {
    const { data: c } = await supabase.from('user_roles_cache').select('role').eq('user_id', p.id);
    console.log(p.email, '-', p.approval_status, '- Cache:', c ? c.length : 0);
  }
})();
