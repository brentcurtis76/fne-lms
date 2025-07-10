// Apply storage policies for course-materials bucket
// Run with: node scripts/apply-storage-policies.js

const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

async function applyStoragePolicies() {
  if (!supabaseUrl || !supabaseServiceKey) {
    console.error('Error: Missing Supabase credentials in .env.local');
    process.exit(1);
  }

  console.log('🔧 Checking course-materials bucket and policies...\n');
  
  // Create Supabase client with service role key
  const supabase = createClient(supabaseUrl, supabaseServiceKey);
  
  try {
    // First check if the bucket exists
    const { data: buckets, error: bucketError } = await supabase
      .storage
      .listBuckets();

    if (bucketError) {
      console.error('Error listing buckets:', bucketError);
      return;
    }

    const courseMaterialsBucket = buckets.find(b => b.name === 'course-materials');
    
    if (!courseMaterialsBucket) {
      console.log('❌ Bucket "course-materials" not found!');
      console.log('📦 Creating course-materials bucket...');
      
      const { data: newBucket, error: createError } = await supabase
        .storage
        .createBucket('course-materials', {
          public: true,
          fileSizeLimit: 10485760, // 10MB
          allowedMimeTypes: [
            'application/pdf',
            'application/msword',
            'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
            'application/vnd.ms-excel',
            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            'application/vnd.ms-powerpoint',
            'application/vnd.openxmlformats-officedocument.presentationml.presentation',
            'image/jpeg',
            'image/png',
            'image/gif',
            'image/webp'
          ]
        });

      if (createError) {
        console.error('Error creating bucket:', createError);
        return;
      }

      console.log('✅ Bucket created successfully!');
    } else {
      console.log('✅ Bucket "course-materials" already exists');
    }

    console.log('\n📋 Storage Policy Instructions:');
    console.log('================================');
    console.log('\n⚠️  IMPORTANT: Storage RLS policies must be applied through the Supabase Dashboard.\n');
    console.log('To apply the policies:');
    console.log('1. Go to: https://supabase.com/dashboard/project/sxlogxqzmarhqsblxmtj/sql/new');
    console.log('2. Copy and paste the SQL from: database/add-course-materials-storage-policies.sql');
    console.log('3. Run the query\n');
    
    console.log('The policies will enable:');
    console.log('  ✅ Authenticated users to upload files');
    console.log('  ✅ Public access to view files');
    console.log('  ✅ Users to update their own uploads');
    console.log('  ✅ Users to delete their own uploads\n');

    // Test the bucket access
    console.log('🧪 Testing bucket access...');
    const { data, error } = await supabase.storage.from('course-materials').list();
    
    if (error) {
      console.log('⚠️  Bucket test returned error (this is expected if policies are not yet applied):', error.message);
      console.log('   Once you apply the policies through the dashboard, file uploads will work.');
    } else {
      console.log('✅ Bucket access test successful');
      console.log(`📁 Found ${data ? data.length : 0} files in course-materials bucket`);
    }
    
  } catch (error) {
    console.error('💥 Error:', error.message);
    process.exit(1);
  }
}

applyStoragePolicies();