require('dotenv').config({ path: '../.env.local' });
const { createClient } = require('@supabase/supabase-js');

// Initialize Supabase client with service role key for admin operations
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function fixInvoiceUploadPolicies() {
  try {
    console.log('🔧 Fixing invoice upload RLS policies...\n');
    
    // First, let's check if the facturas bucket exists
    console.log('📁 Checking facturas bucket...');
    const { data: buckets, error: bucketsError } = await supabase.storage.listBuckets();
    
    if (bucketsError) {
      console.error('❌ Error listing buckets:', bucketsError);
      return;
    }
    
    const facturasBucket = buckets.find(bucket => bucket.id === 'facturas');
    if (facturasBucket) {
      console.log('✅ Facturas bucket exists:', facturasBucket);
    } else {
      console.log('❌ Facturas bucket does not exist');
      console.log('📝 Available buckets:', buckets.map(b => b.id));
      return;
    }
    
    // Test user authentication
    console.log('\n🔍 Checking user authentication...');
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError) {
      console.log('❌ No authenticated user found:', userError.message);
      console.log('💡 This script needs to run in browser context where user is logged in');
    } else {
      console.log('✅ User authenticated:', user?.email);
    }
    
    // Try a test upload to see the exact error
    console.log('\n🧪 Testing file upload...');
    const testFile = new Blob(['test content'], { type: 'text/plain' });
    
    const { data: uploadData, error: uploadError } = await supabase.storage
      .from('facturas')
      .upload(`test_${Date.now()}.txt`, testFile);
    
    if (uploadError) {
      console.error('❌ Test upload failed:', uploadError.message);
      console.error('Full error:', uploadError);
      
      // Check specific RLS policy error
      if (uploadError.message.includes('row-level security')) {
        console.log('\n🔧 RLS policy issue detected. This needs to be fixed in Supabase SQL editor:');
        console.log('\n-- Run this SQL in Supabase SQL Editor:');
        console.log(`
-- Drop existing policies if they exist
DROP POLICY IF EXISTS facturas_view_policy ON storage.objects;
DROP POLICY IF EXISTS facturas_upload_policy ON storage.objects;
DROP POLICY IF EXISTS facturas_update_policy ON storage.objects;
DROP POLICY IF EXISTS facturas_delete_policy ON storage.objects;

-- Create more permissive policies for authenticated users
CREATE POLICY "facturas_all_authenticated" ON storage.objects
FOR ALL USING (
    bucket_id = 'facturas' 
    AND auth.role() = 'authenticated'
);

-- Alternative: If above doesn't work, try this more permissive policy
-- CREATE POLICY "facturas_public_access" ON storage.objects
-- FOR ALL USING (bucket_id = 'facturas');
        `);
      }
    } else {
      console.log('✅ Test upload successful:', uploadData);
      
      // Clean up test file
      const { error: deleteError } = await supabase.storage
        .from('facturas')
        .remove([uploadData.path]);
      
      if (deleteError) {
        console.log('⚠️ Could not clean up test file:', deleteError.message);
      } else {
        console.log('🧹 Test file cleaned up');
      }
    }
    
  } catch (error) {
    console.error('❌ Unexpected error:', error);
  }
}

// Run the fix
fixInvoiceUploadPolicies();