const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = 'https://sxlogxqzmarhqsblxmtj.supabase.co';
const supabaseServiceRoleKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InN4bG9neHF6bWFyaHFzYmx4bXRqIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc0NzMyMjIyMSwiZXhwIjoyMDYyODk4MjIxfQ.OiyMUeIoCc_mH7G5xZms1AhDyYM3jXqqIjccSL0JmWI';

const supabase = createClient(supabaseUrl, supabaseServiceRoleKey);

async function verifyFeedbackStorage() {
  console.log('=== VERIFYING FEEDBACK STORAGE SETUP ===\n');
  
  try {
    // 1. Check bucket configuration
    console.log('1. Checking bucket configuration...');
    const { data: buckets, error: bucketError } = await supabase.storage.listBuckets();
    if (bucketError) {
      console.error('❌ Error listing buckets:', bucketError);
      return;
    }
    
    const feedbackBucket = buckets.find(b => b.id === 'feedback-screenshots');
    if (!feedbackBucket) {
      console.error('❌ feedback-screenshots bucket not found');
      return;
    }
    
    console.log('✅ Bucket exists and configured:');
    console.log(`   • Public: ${feedbackBucket.public}`);
    console.log(`   • Size limit: ${feedbackBucket.file_size_limit} bytes (${feedbackBucket.file_size_limit / 1024 / 1024}MB)`);
    console.log(`   • Allowed types: ${feedbackBucket.allowed_mime_types.join(', ')}`);
    
    // 2. Check RLS policies
    console.log('\n2. Checking RLS policies...');
    const { data: policies, error: policyError } = await supabase.rpc('exec_sql', {
      sql: `SELECT 
              policyname,
              cmd,
              permissive,
              roles,
              qual,
              with_check
            FROM pg_policies 
            WHERE tablename = 'objects' 
              AND schemaname = 'storage'
              AND policyname LIKE '%feedback%'
            ORDER BY policyname`
    });
    
    if (policyError) {
      console.error('❌ Error checking policies:', policyError);
    } else if (!policies || policies.length === 0) {
      console.error('❌ No feedback storage policies found!');
      console.log('\n📋 Action Required:');
      console.log('   Run the SQL in MANUAL_feedback_storage_policies.sql');
      console.log('   in your Supabase Dashboard → SQL Editor');
    } else {
      console.log(`✅ Found ${policies.length} feedback storage policies:`);
      policies.forEach((policy, index) => {
        console.log(`   ${index + 1}. ${policy.policyname} (${policy.cmd})`);
      });
    }
    
    // 3. Test basic access
    console.log('\n3. Testing basic bucket access...');
    const { data: files, error: listError } = await supabase.storage
      .from('feedback-screenshots')
      .list('', { limit: 1 });
    
    if (listError) {
      console.error('❌ Error accessing bucket:', listError);
    } else {
      console.log('✅ Bucket is accessible');
      console.log(`   • Current files: ${files.length}`);
    }
    
    // 4. Summary and next steps
    console.log('\n=== SETUP SUMMARY ===');
    
    const hasBucket = !!feedbackBucket;
    const hasPolicies = policies && policies.length >= 4;
    const bucketAccessible = !listError;
    
    if (hasBucket && hasPolicies && bucketAccessible) {
      console.log('🎉 ✅ FEEDBACK STORAGE FULLY CONFIGURED');
      console.log('   Users should now be able to upload feedback screenshots');
    } else {
      console.log('⚠️  INCOMPLETE SETUP - Action Required:');
      if (!hasBucket) console.log('   • Create feedback-screenshots bucket');
      if (!hasPolicies) console.log('   • Apply RLS policies (run MANUAL_feedback_storage_policies.sql)');
      if (!bucketAccessible) console.log('   • Fix bucket access permissions');
    }
    
    console.log('\n📁 Expected file path format:');
    console.log('   feedback/{user_id}/{timestamp}_{filename}');
    console.log('   Example: feedback/123e4567-e89b-12d3-a456-426614174000/1640995200000_screenshot.png');
    
  } catch (err) {
    console.error('❌ Unexpected error:', err);
  }
}

verifyFeedbackStorage();