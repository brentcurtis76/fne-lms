const { createClient } = require('@supabase/supabase-js');

// Supabase configuration
const supabaseUrl = 'https://sxlogxqzmarhqsblxmtj.supabase.co';
const serviceRoleKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InN4bG9neHF6bWFyaHFzYmx4bXRqIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc0NzMyMjIyMSwiZXhwIjoyMDYyODk4MjIxfQ.OiyMUeIoCc_mH7G5xZms1AhDyYM3jXqqIjccSL0JmWI';

// Create Supabase client with service role
const supabase = createClient(supabaseUrl, serviceRoleKey);

async function checkFeedbackPolicies() {
  try {
    console.log('🔍 Checking existing storage policies...');
    
    // Check current policies
    const { data: policies, error: policiesError } = await supabase.rpc('exec_sql', {
      sql: `SELECT policyname as name, cmd as operation, roles FROM pg_policies WHERE schemaname = 'storage' AND tablename = 'objects' ORDER BY policyname`
    });
    
    if (policiesError) {
      console.error('❌ Error fetching policies:', policiesError);
      return;
    }
    
    console.log(`📋 Found ${policies ? policies.length : 0} total storage.objects policies:`);
    if (policies && policies.length > 0) {
      policies.forEach(policy => {
        console.log(`  - ${policy.name} (${policy.operation}) for ${policy.roles}`);
      });
    }
    
    // Check specifically for feedback policies
    const feedbackPolicies = policies ? policies.filter(p => p.name.toLowerCase().includes('feedback')) : [];
    console.log(`\n🎯 Feedback-related policies: ${feedbackPolicies.length}`);
    if (feedbackPolicies.length > 0) {
      feedbackPolicies.forEach(policy => {
        console.log(`  ✅ ${policy.name} (${policy.operation}) for ${policy.roles}`);
      });
    } else {
      console.log('  ❌ No feedback-related policies found');
    }
    
    // Check bucket existence
    const { data: buckets, error: bucketsError } = await supabase.storage.listBuckets();
    if (bucketsError) {
      console.error('❌ Error checking buckets:', bucketsError);
    } else {
      const feedbackBucket = buckets.find(b => b.name === 'feedback-screenshots');
      console.log(`\n🪣 Feedback bucket exists: ${feedbackBucket ? '✅ Yes' : '❌ No'}`);
      if (feedbackBucket) {
        console.log(`   - ID: ${feedbackBucket.id}`);
        console.log(`   - Public: ${feedbackBucket.public}`);
        console.log(`   - Created: ${feedbackBucket.created_at}`);
      }
    }
    
  } catch (error) {
    console.error('💥 Error checking policies:', error);
  }
}

// Run the function
checkFeedbackPolicies();