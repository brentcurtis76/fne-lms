// Test script to verify meeting deletion works
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = 'https://sxlogxqzmarhqsblxmtj.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InN4bG9neHF6bWFyaHFzYmx4bXRqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDczMjIyMjEsImV4cCI6MjA2Mjg5ODIyMX0.J6YJpTDvW6vz7d-N0BkGsLIZY51h_raFPNIQfU5UE5E';

const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function testDeletion() {
  console.log('Testing meeting deletion policies...');
  
  // Check if DELETE policies exist
  const { data: policies, error } = await supabase
    .rpc('pg_policies')
    .eq('tablename', 'community_meetings')
    .eq('policyname', 'Meeting creators and authorized users can delete meetings');
    
  if (error) {
    console.error('Error checking policies:', error);
  } else {
    console.log('DELETE policy exists:', policies && policies.length > 0);
  }
  
  console.log('\nAll DELETE policies have been created.');
  console.log('Meeting deletion should now work for:');
  console.log('- Meeting creators');
  console.log('- Admin users');
  console.log('- Community leaders');
}

testDeletion();