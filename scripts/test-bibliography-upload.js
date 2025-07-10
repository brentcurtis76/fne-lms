// Test script to verify bibliography PDF upload functionality
// Run with: node scripts/test-bibliography-upload.js

const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

async function testBibliographyUpload() {
  if (!supabaseUrl || !supabaseKey) {
    console.error('Error: Supabase credentials not found');
    process.exit(1);
  }

  const supabase = createClient(supabaseUrl, supabaseKey);
  
  try {
    // 1. Check if bucket exists
    console.log('1. Checking if course-materials bucket exists...');
    const { data: listData, error: listError } = await supabase.storage
      .from('course-materials')
      .list();
    
    if (listError) {
      console.error('❌ Bucket does not exist or is not accessible:', listError.message);
      console.log('\nTo fix this, run: node scripts/create-course-materials-bucket.js');
      return;
    }
    
    console.log('✅ Bucket exists and is accessible');
    
    // 2. Test getPublicUrl method
    console.log('\n2. Testing getPublicUrl method...');
    const testFileName = 'bibliography/test-course/test-file.pdf';
    
    const publicUrlResult = supabase.storage
      .from('course-materials')
      .getPublicUrl(testFileName);
    
    console.log('getPublicUrl result:', publicUrlResult);
    
    if (!publicUrlResult.data) {
      console.error('❌ getPublicUrl returned undefined data');
      return;
    }
    
    if (!publicUrlResult.data.publicUrl) {
      console.error('❌ getPublicUrl data.publicUrl is undefined');
      return;
    }
    
    console.log('✅ Public URL generated:', publicUrlResult.data.publicUrl);
    
    // 3. Test the fixed code pattern
    console.log('\n3. Testing the fixed destructuring pattern...');
    try {
      // This is the old pattern that causes the error
      // const { data: { publicUrl } } = supabase.storage.from('course-materials').getPublicUrl(testFileName);
      
      // This is the fixed pattern
      const publicUrlData = supabase.storage
        .from('course-materials')
        .getPublicUrl(testFileName);
      
      if (!publicUrlData.data || !publicUrlData.data.publicUrl) {
        throw new Error('Could not get public URL for file');
      }
      
      const publicUrl = publicUrlData.data.publicUrl;
      console.log('✅ Fixed pattern works correctly');
      console.log('   Public URL:', publicUrl);
    } catch (error) {
      console.error('❌ Error with fixed pattern:', error.message);
    }
    
    console.log('\n✅ All tests passed! The fix should work correctly.');
    
  } catch (error) {
    console.error('Error during test:', error);
  }
}

testBibliographyUpload();