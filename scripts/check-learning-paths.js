require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function checkFunctions() {
  console.log('Checking for learning path functions...\n');

  // Check if functions exist in public schema
  const { data: functions, error: funcError } = await supabase
    .from('pg_proc')
    .select('proname')
    .ilike('proname', '%learning_path%')
    .single();

  if (funcError) {
    // Try raw SQL query
    const query = `
      SELECT proname, pronargs 
      FROM pg_proc 
      WHERE proname LIKE '%learning_path%' 
      AND pronamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public');
    `;

    const { data, error } = await supabase.rpc('query_raw', { query });
    
    if (error) {
      console.log('Trying direct query...');
      // Let's try to check the information schema
      const { data: info, error: infoError } = await supabase
        .from('information_schema.routines')
        .select('routine_name, routine_type')
        .ilike('routine_name', '%learning_path%');

      if (infoError) {
        console.error('Error checking information schema:', infoError);
      } else {
        console.log('Functions in information schema:', info);
      }
    } else {
      console.log('Functions found:', data);
    }
  } else {
    console.log('Functions found:', functions);
  }

  // Try to force cache refresh
  console.log('\nForcing cache refresh...');
  const { error: notifyError } = await supabase.rpc('notify_postgrest', {
    channel: 'pgrst',
    payload: 'reload schema'
  });

  if (notifyError) {
    console.log('Notify error:', notifyError);
  } else {
    console.log('Cache refresh notification sent');
  }

  // Test if we can call the functions
  console.log('\nTesting function calls...');
  
  try {
    const { data, error } = await supabase.rpc('get_user_learning_paths', {
      p_user_id: 'test-user-id'
    });
    
    if (error) {
      console.error('Error calling get_user_learning_paths:', error.message);
    } else {
      console.log('Successfully called get_user_learning_paths');
    }
  } catch (e) {
    console.error('Exception calling function:', e.message);
  }
}

checkFunctions().catch(console.error);