// Simple storage policy fix for image uploads
// Run with: node scripts/simple-storage-fix.js

const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY;

async function fixStoragePolicies() {
  if (!supabaseUrl || !supabaseServiceKey) {
    console.error('Error: Missing Supabase credentials');
    process.exit(1);
  }

  console.log('🔧 Fixing storage policies for image uploads...');
  
  const supabase = createClient(supabaseUrl, supabaseServiceKey);
  
  try {
    // Test current bucket access
    console.log('📋 Testing current bucket access...');
    const { data: listData, error: listError } = await supabase.storage.from('resources').list();
    
    if (listError) {
      console.log('❌ Bucket list error:', listError.message);
    } else {
      console.log(`✅ Bucket accessible, contains ${listData.length} files`);
    }
    
    // Try to get bucket info
    console.log('📋 Getting bucket info...');
    const { data: buckets, error: bucketsError } = await supabase.storage.listBuckets();
    
    if (bucketsError) {
      console.error('❌ Cannot list buckets:', bucketsError.message);
    } else {
      console.log('✅ Available buckets:');
      buckets.forEach(bucket => {
        console.log(`  - ${bucket.name} (public: ${bucket.public})`);
      });
    }
    
    // Check if resources bucket exists and is public
    const resourcesBucket = buckets?.find(b => b.name === 'resources');
    if (resourcesBucket) {
      if (!resourcesBucket.public) {
        console.log('🔧 Making resources bucket public...');
        const { error: updateError } = await supabase.storage.updateBucket('resources', {
          public: true
        });
        
        if (updateError) {
          console.error('❌ Failed to make bucket public:', updateError.message);
        } else {
          console.log('✅ Resources bucket is now public');
        }
      } else {
        console.log('✅ Resources bucket is already public');
      }
    } else {
      console.log('🔧 Creating resources bucket...');
      const { error: createError } = await supabase.storage.createBucket('resources', {
        public: true,
        fileSizeLimit: 52428800, // 50MB
        allowedMimeTypes: ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'application/pdf']
      });
      
      if (createError) {
        console.error('❌ Failed to create bucket:', createError.message);
      } else {
        console.log('✅ Resources bucket created successfully');
      }
    }
    
    // Test file upload
    console.log('🧪 Testing file upload...');
    const testFile = Buffer.from('test file content');
    const testFileName = `test-${Date.now()}.txt`;
    
    const { error: uploadError } = await supabase.storage
      .from('resources')
      .upload(testFileName, testFile, {
        contentType: 'text/plain'
      });
    
    if (uploadError) {
      console.error('❌ Upload test failed:', uploadError.message);
      console.log('This suggests RLS policies need to be configured in Supabase dashboard');
    } else {
      console.log('✅ Upload test successful');
      
      // Clean up test file
      await supabase.storage.from('resources').remove([testFileName]);
      console.log('🧹 Test file cleaned up');
    }
    
    console.log('\n📋 Summary:');
    console.log('If uploads are still failing, you need to:');
    console.log('1. Go to Supabase Dashboard > Storage > Policies');
    console.log('2. Create policies for the "objects" table');
    console.log('3. Allow INSERT, SELECT, UPDATE, DELETE for public users on bucket_id = "resources"');
    
  } catch (error) {
    console.error('💥 Error:', error.message);
  }
}

fixStoragePolicies();