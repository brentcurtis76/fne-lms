const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = 'https://sxlogxqzmarhqsblxmtj.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InN4bG9neHF6bWFyaHFzYmx4bXRqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDczMjIyMjEsImV4cCI6MjA2Mjg5ODIyMX0.J6YJpTDvW6vz7d-N0BkGsLIZY51h_raFPNIQfU5UE5E';

const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function verifyRLSFix() {
  console.log('╔' + '='.repeat(78) + '╗');
  console.log('║' + ' '.repeat(20) + 'VERIFYING RLS FIX FOR WORKSPACES' + ' '.repeat(26) + '║');
  console.log('╚' + '='.repeat(78) + '╝');
  console.log('');

  // Try with a test authentication
  const email = 'juan.reyesar@liceonacionaldellolleo.cl';
  const password = 'FNE123!';

  console.log('Step 1: Authenticating as Juan Reyes...');
  console.log('Email:', email);

  const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
    email,
    password
  });

  if (authError) {
    console.log('❌ Cannot authenticate:', authError.message);
    console.log('\nNOTE: Test by logging in as this user in the browser and checking access');
    return;
  }

  console.log('✅ Authenticated');
  console.log('');

  const communityIds = ['0f2bdcc2-e9ec-4454-b075-1067af61873f'];

  console.log('Step 2: Querying workspaces (with RLS)...');

  const { data: workspaces, error: wsError } = await supabase
    .from('community_workspaces')
    .select('community_id, id, name, custom_name')
    .in('community_id', communityIds);

  if (wsError) {
    console.log('❌ RLS ERROR:', wsError.message);
    console.log('STATUS: RLS policies still blocking access');
  } else if (!workspaces || workspaces.length === 0) {
    console.log('⚠️  No workspaces returned');
    console.log('STATUS: RLS policies filtering workspaces');
  } else {
    console.log('✅ SUCCESS! Workspaces visible:', workspaces.length);
    workspaces.forEach(ws => {
      console.log('  -', ws.name);
    });
    console.log('\n✅ RLS FIX WORKING!');
  }

  await supabase.auth.signOut();
}

verifyRLSFix();
