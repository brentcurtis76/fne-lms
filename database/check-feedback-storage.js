const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = 'https://sxlogxqzmarhqsblxmtj.supabase.co';
const supabaseServiceRoleKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InN4bG9neHF6bWFyaHFzYmx4bXRqIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc0NzMyMjIyMSwiZXhwIjoyMDYyODk4MjIxfQ.OiyMUeIoCc_mH7G5xZms1AhDyYM3jXqqIjccSL0JmWI';

const supabase = createClient(supabaseUrl, supabaseServiceRoleKey);

async function checkAndSetupFeedbackStorage() {
  try {
    console.log('=== CHECKING FEEDBACK STORAGE SETUP ===\n');
    
    // 1. Check if bucket exists
    console.log('1. Checking if feedback-screenshots bucket exists...');
    const { data: buckets, error: listError } = await supabase.storage.listBuckets();
    if (listError) {
      console.error('Error listing buckets:', listError);
      return;
    }
    
    const existingBucket = buckets.find(b => b.id === 'feedback-screenshots');
    if (existingBucket) {
      console.log('✓ Bucket feedback-screenshots already exists');
      console.log('  Details:', JSON.stringify(existingBucket, null, 2));
    } else {
      console.log('✗ Bucket does not exist, creating...');
      
      // Create bucket
      const { data, error } = await supabase.storage.createBucket('feedback-screenshots', {
        public: true,
        fileSizeLimit: 5242880, // 5MB
        allowedMimeTypes: ['image/jpeg', 'image/png', 'image/webp']
      });
      
      if (error) {
        console.error('Error creating bucket:', error);
        return;
      } else {
        console.log('✓ Bucket created successfully');
      }
    }
    
    // 2. Check and create RLS policies using raw SQL
    console.log('\n2. Setting up RLS policies...');
    
    const setupSQL = `
      -- Create the storage bucket with proper configuration
      INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
      VALUES (
        'feedback-screenshots',
        'feedback-screenshots',
        true,
        5242880,
        ARRAY['image/jpeg', 'image/png', 'image/webp']::text[]
      )
      ON CONFLICT (id) DO UPDATE
      SET 
        public = true,
        file_size_limit = 5242880,
        allowed_mime_types = ARRAY['image/jpeg', 'image/png', 'image/webp']::text[];

      -- Drop existing policies if they exist
      DROP POLICY IF EXISTS "Users can upload feedback screenshots" ON storage.objects;
      DROP POLICY IF EXISTS "Anyone can view feedback screenshots" ON storage.objects;
      DROP POLICY IF EXISTS "Users can update own feedback screenshots" ON storage.objects;
      DROP POLICY IF EXISTS "Users can delete own feedback screenshots" ON storage.objects;

      -- Create policies
      CREATE POLICY "Users can upload feedback screenshots"
      ON storage.objects FOR INSERT
      WITH CHECK (
        bucket_id = 'feedback-screenshots' AND
        auth.uid() IS NOT NULL AND
        (storage.foldername(name))[1] = 'feedback' AND
        (storage.foldername(name))[2] = auth.uid()::text
      );

      CREATE POLICY "Anyone can view feedback screenshots"
      ON storage.objects FOR SELECT
      USING (bucket_id = 'feedback-screenshots');

      CREATE POLICY "Users can update own feedback screenshots"
      ON storage.objects FOR UPDATE
      USING (
        bucket_id = 'feedback-screenshots' AND
        auth.uid()::text = (storage.foldername(name))[2]
      );

      CREATE POLICY "Users can delete own feedback screenshots"
      ON storage.objects FOR DELETE
      USING (
        bucket_id = 'feedback-screenshots' AND
        auth.uid()::text = (storage.foldername(name))[2]
      );

      -- Grant permissions
      GRANT ALL ON storage.objects TO authenticated;
      GRANT SELECT ON storage.objects TO anon;
    `;
    
    const { data: sqlResult, error: sqlError } = await supabase.rpc('exec_sql', { 
      sql: setupSQL 
    });
    
    if (sqlError) {
      console.error('Error executing SQL:', sqlError);
      
      // Try alternative approach - execute policies one by one
      console.log('\n3. Trying alternative approach - executing policies individually...');
      
      const policies = [
        `CREATE POLICY IF NOT EXISTS "Users can upload feedback screenshots"
         ON storage.objects FOR INSERT
         WITH CHECK (
           bucket_id = 'feedback-screenshots' AND
           auth.uid() IS NOT NULL AND
           (storage.foldername(name))[1] = 'feedback' AND
           (storage.foldername(name))[2] = auth.uid()::text
         );`,
        
        `CREATE POLICY IF NOT EXISTS "Anyone can view feedback screenshots"
         ON storage.objects FOR SELECT
         USING (bucket_id = 'feedback-screenshots');`,
        
        `CREATE POLICY IF NOT EXISTS "Users can update own feedback screenshots"
         ON storage.objects FOR UPDATE
         USING (
           bucket_id = 'feedback-screenshots' AND
           auth.uid()::text = (storage.foldername(name))[2]
         );`,
        
        `CREATE POLICY IF NOT EXISTS "Users can delete own feedback screenshots"
         ON storage.objects FOR DELETE
         USING (
           bucket_id = 'feedback-screenshots' AND
           auth.uid()::text = (storage.foldername(name))[2]
         );`
      ];
      
      for (const policy of policies) {
        const { error: policyError } = await supabase.rpc('exec_sql', { sql: policy });
        if (policyError) {
          console.error('Error creating policy:', policyError);
        } else {
          console.log('✓ Policy created successfully');
        }
      }
    } else {
      console.log('✓ All SQL commands executed successfully');
    }
    
    // 3. Verify setup
    console.log('\n4. Verifying setup...');
    const { data: finalBuckets, error: finalError } = await supabase.storage.listBuckets();
    if (finalError) {
      console.error('Error verifying buckets:', finalError);
    } else {
      const bucket = finalBuckets.find(b => b.id === 'feedback-screenshots');
      if (bucket) {
        console.log('✓ Bucket verification successful');
        console.log('  Configuration:', JSON.stringify(bucket, null, 2));
      } else {
        console.log('✗ Bucket not found after creation');
      }
    }
    
    console.log('\n=== SETUP COMPLETE ===');
    
  } catch (err) {
    console.error('Unexpected error:', err);
  }
}

checkAndSetupFeedbackStorage();