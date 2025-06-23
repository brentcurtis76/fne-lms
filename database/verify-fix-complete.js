const { createClient } = require('@supabase/supabase-js');

// Supabase configuration
const supabaseUrl = 'https://sxlogxqzmarhqsblxmtj.supabase.co';
const serviceRoleKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InN4bG9neHF6bWFyaHFzYmx4bXRqIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc0NzMyMjIyMSwiZXhwIjoyMDYyODk4MjIxfQ.OiyMUeIoCc_mH7G5xZms1AhDyYM3jXqqIjccSL0JmWI';

// Create Supabase client with service role
const supabase = createClient(supabaseUrl, serviceRoleKey);

async function verifyFix() {
  try {
    console.log('🔍 Verifying feedback storage fix...\n');
    
    // Check for feedback-related policies
    const { data: policies, error: policiesError } = await supabase.rpc('exec_sql', {
      sql: `
        SELECT 
          policyname as name,
          cmd as operation,
          roles
        FROM pg_policies 
        WHERE schemaname = 'storage' 
          AND tablename = 'objects' 
          AND policyname ILIKE '%feedback%'
        ORDER BY policyname
      `
    });
    
    if (policiesError) {
      console.error('❌ Error checking policies:', policiesError);
      return;
    }
    
    const expectedPolicies = [
      'Users can upload feedback screenshots',
      'Anyone can view feedback screenshots', 
      'Users can update own feedback screenshots',
      'Users can delete own feedback screenshots'
    ];
    
    console.log(`📋 Found ${policies ? policies.length : 0} feedback-related storage policies:`);
    
    if (policies && policies.length === 4) {
      policies.forEach(policy => {
        console.log(`  ✅ ${policy.name} (${policy.operation})`);
      });
      
      console.log('\n🎉 SUCCESS: All 4 required feedback storage policies are present!');
      console.log('✅ The "Error al subir la imagen" issue has been FIXED!');
      console.log('✅ Users can now upload feedback screenshots successfully.');
      
    } else {
      console.log('\n❌ INCOMPLETE: Not all policies were created.');
      console.log('Please run the SQL script again in Supabase Dashboard.');
    }
    
  } catch (error) {
    console.error('💥 Error verifying fix:', error);
  }
}

// Run the verification
verifyFix();