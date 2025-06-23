const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = 'https://sxlogxqzmarhqsblxmtj.supabase.co';
const supabaseServiceRoleKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InN4bG9neHF6bWFyaHFzYmx4bXRqIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc0NzMyMjIyMSwiZXhwIjoyMDYyODk4MjIxfQ.OiyMUeIoCc_mH7G5xZms1AhDyYM3jXqqIjccSL0JmWI';

const supabase = createClient(supabaseUrl, supabaseServiceRoleKey);

async function checkStoragePolicies() {
  console.log('=== CHECKING STORAGE POLICIES ===\n');
  
  try {
    // Check existing policies on storage.objects
    const { data: policies, error } = await supabase.rpc('exec_sql', {
      sql: `SELECT schemaname, tablename, policyname, permissive, roles, cmd, qual, with_check 
            FROM pg_policies 
            WHERE tablename = 'objects' AND schemaname = 'storage'
            ORDER BY policyname`
    });
    
    if (error) {
      console.error('Error fetching policies:', error);
    } else {
      console.log('Current storage.objects policies:');
      if (policies && policies.length > 0) {
        policies.forEach((policy, index) => {
          console.log(`${index + 1}. ${policy.policyname}`);
          console.log(`   Command: ${policy.cmd}`);
          console.log(`   Roles: ${policy.roles}`);
          if (policy.qual) console.log(`   Condition: ${policy.qual}`);
          if (policy.with_check) console.log(`   With Check: ${policy.with_check}`);
          console.log('');
        });
      } else {
        console.log('No policies found for storage.objects');
      }
    }
    
    // Check bucket configuration
    console.log('\n=== BUCKET CONFIGURATION ===');
    const { data: buckets, error: bucketError } = await supabase.storage.listBuckets();
    if (bucketError) {
      console.error('Error listing buckets:', bucketError);
    } else {
      const feedbackBucket = buckets.find(b => b.id === 'feedback-screenshots');
      if (feedbackBucket) {
        console.log('feedback-screenshots bucket configuration:');
        console.log(JSON.stringify(feedbackBucket, null, 2));
      } else {
        console.log('feedback-screenshots bucket not found');
      }
    }
    
    // Test upload capability (without actually uploading)
    console.log('\n=== TESTING UPLOAD CAPABILITY ===');
    try {
      // Try to list files in the bucket (this will tell us if we have basic access)
      const { data: files, error: listError } = await supabase.storage
        .from('feedback-screenshots')
        .list('', { limit: 1 });
      
      if (listError) {
        console.error('Error accessing bucket:', listError);
      } else {
        console.log('✓ Bucket is accessible for listing files');
        console.log(`Found ${files.length} existing files`);
      }
    } catch (err) {
      console.error('Exception testing bucket access:', err);
    }
    
  } catch (err) {
    console.error('Error:', err);
  }
}

checkStoragePolicies();