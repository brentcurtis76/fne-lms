const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const dotenv = require('dotenv');

const envConfig = dotenv.parse(fs.readFileSync('.env.local'));
const supabase = createClient(
  envConfig.NEXT_PUBLIC_SUPABASE_URL,
  envConfig.SUPABASE_SERVICE_ROLE_KEY
);

async function checkRemaining() {
  console.log('\n=== Checking for remaining test data ===');
  
  // Check active overlays
  const { data: overlays, error: overlayError } = await supabase
    .from('role_permissions')
    .select('*')
    .eq('is_test', true)
    .eq('active', true);
    
  if (overlayError) {
    console.log('Error checking overlays:', overlayError.message);
  } else {
    console.log(`Active test overlays: ${overlays?.length || 0}`);
    if (overlays?.length > 0) {
      console.log('Found overlays:', overlays.map(o => ({
        role: o.role_type,
        permission: o.permission_key,
        test_run: o.test_run_id
      })));
    }
  }
  
  // Check test mode state
  const { data: testModes, error: testError } = await supabase
    .from('test_mode_state')
    .select('*')
    .eq('enabled', true);
    
  if (testError) {
    console.log('Error checking test mode:', testError.message);
  } else {
    console.log(`Active test mode states: ${testModes?.length || 0}`);
    if (testModes?.length > 0) {
      console.log('Found test modes:', testModes.map(t => ({
        user_id: t.user_id,
        test_run_id: t.test_run_id,
        expires: t.expires_at
      })));
    }
  }
  
  // Check baseline count
  const { data: baseline, error: baselineError } = await supabase
    .from('role_permission_baseline')
    .select('*', { count: 'exact', head: true });
    
  if (!baselineError) {
    console.log(`\nBaseline entries: ${baseline?.length || 0}`);
  }
}

checkRemaining().catch(console.error);
