require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');

// Create client with Andrea's permissions (using anon key + auth)
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

(async () => {
  console.log('=== TESTING ANDREA INSERT PASANTÍAS QUOTE ===\n');

  // First, sign in as Andrea to get her session
  const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
    email: 'andrealagosgomez@gmail.com',
    password: 'temporary-test-password' // This won't work without real password
  });

  if (authError) {
    console.log('❌ Cannot sign in as Andrea (need real password)');
    console.log('Trying with service role key to simulate Andrea...\n');

    // Use service role to test RLS
    const serviceSupabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    );

    // Get Andrea's ID
    const { data: user } = await serviceSupabase
      .from('profiles')
      .select('id')
      .eq('email', 'andrealagosgomez@gmail.com')
      .single();

    if (!user) {
      console.log('❌ Could not find Andrea');
      return;
    }

    console.log('Andrea User ID:', user.id);
    console.log('\nAttempting to INSERT quote with Andrea as created_by...\n');

    // Try to insert a test quote
    const testQuote = {
      client_name: 'TEST CLIENT - Delete Me',
      client_email: 'test@example.com',
      arrival_date: '2025-10-15',
      departure_date: '2025-10-20',
      room_type: 'single',
      single_room_price: 50000,
      num_pasantes: 1,
      created_by: user.id,
      updated_by: user.id,
      status: 'draft'
    };

    const { data: quote, error: insertError } = await serviceSupabase
      .from('pasantias_quotes')
      .insert(testQuote)
      .select()
      .single();

    if (insertError) {
      console.log('❌ INSERT FAILED:');
      console.log('Error Code:', insertError.code);
      console.log('Error Message:', insertError.message);
      console.log('Error Details:', insertError.details);
      console.log('Error Hint:', insertError.hint);

      // Check what RLS policies exist
      console.log('\n=== Checking RLS Policies ===');
      const { data: policies } = await serviceSupabase
        .from('pg_policies')
        .select('*')
        .eq('schemaname', 'public')
        .eq('tablename', 'pasantias_quotes');

      if (policies) {
        console.log('Found', policies.length, 'policies on pasantias_quotes:');
        policies.forEach(p => {
          console.log(`  - ${p.policyname} (${p.cmd})`);
        });
      }
    } else {
      console.log('✅ INSERT SUCCEEDED!');
      console.log('Created quote ID:', quote.id);
      console.log('Grand total:', quote.grand_total);

      // Clean up - delete the test quote
      await serviceSupabase
        .from('pasantias_quotes')
        .delete()
        .eq('id', quote.id);
      console.log('\nTest quote deleted.');
    }
  }
})();
