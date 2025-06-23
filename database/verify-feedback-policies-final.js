const { createClient } = require('@supabase/supabase-js');

// Supabase configuration
const supabaseUrl = 'https://sxlogxqzmarhqsblxmtj.supabase.co';
const serviceRoleKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InN4bG9neHF6bWFyaHFzYmx4bXRqIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc0NzMyMjIyMSwiZXhwIjoyMDYyODk4MjIxfQ.OiyMUeIoCc_mH7G5xZms1AhDyYM3jXqqIjccSL0JmWI';

// Create Supabase client with service role
const supabase = createClient(supabaseUrl, serviceRoleKey);

async function verifyFeedbackPolicies() {
  try {
    console.log('🔍 Verifying feedback screenshots storage policies...');
    
    // Check for feedback-related policies
    const { data: policies, error: policiesError } = await supabase.rpc('exec_sql', {
      sql: `
        SELECT 
          policyname as name,
          cmd as operation,
          roles,
          qual as using_clause,
          with_check as with_check_clause
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
    
    console.log(`\n📋 Found ${policies ? policies.length : 0} feedback-related storage policies:`);
    
    const expectedPolicies = [
      'Users can upload feedback screenshots',
      'Anyone can view feedback screenshots', 
      'Users can update own feedback screenshots',
      'Users can delete own feedback screenshots'
    ];
    
    if (policies && policies.length > 0) {
      policies.forEach(policy => {
        console.log(`  ✅ ${policy.name} (${policy.operation}) for ${policy.roles}`);
      });
      
      // Check if all expected policies exist
      const foundPolicyNames = policies.map(p => p.name);
      const missingPolicies = expectedPolicies.filter(name => !foundPolicyNames.includes(name));
      
      if (missingPolicies.length === 0) {
        console.log('\n🎉 SUCCESS: All required feedback storage policies are present!');
        console.log('✅ The "Error al subir la imagen" issue should now be fixed.');
      } else {
        console.log(`\n⚠️  Missing policies: ${missingPolicies.length}`);
        missingPolicies.forEach(name => {
          console.log(`  ❌ ${name}`);
        });
      }
    } else {
      console.log('  ❌ No feedback-related policies found');
      console.log('\n🚨 MANUAL ACTION REQUIRED:');
      console.log('1. Open Supabase Dashboard: https://supabase.com/dashboard/project/sxlogxqzmarhqsblxmtj/sql/new');
      console.log('2. Copy and paste the SQL from: database/MANUAL_feedback_storage_policies_final.sql');
      console.log('3. Execute the SQL to create the required policies');
    }
    
    // Check bucket
    const { data: buckets, error: bucketsError } = await supabase.storage.listBuckets();
    if (!bucketsError) {
      const feedbackBucket = buckets.find(b => b.name === 'feedback-screenshots');
      console.log(`\n🪣 Feedback bucket status: ${feedbackBucket ? '✅ EXISTS' : '❌ MISSING'}`);
    }
    
  } catch (error) {
    console.error('💥 Error verifying policies:', error);
  }
}

// Run the function
verifyFeedbackPolicies();