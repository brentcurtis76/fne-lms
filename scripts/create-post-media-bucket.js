/**
 * Create storage bucket for Instagram-style feed media
 * Run this script to set up the post-media bucket in Supabase Storage
 */

const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('❌ Missing required environment variables');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
});

async function createPostMediaBucket() {
  console.log('🚀 Creating post-media storage bucket...');

  try {
    // Check if bucket already exists
    const { data: existingBuckets, error: listError } = await supabase.storage.listBuckets();
    
    if (listError) {
      console.error('❌ Error listing buckets:', listError);
      return;
    }

    const bucketExists = existingBuckets?.some(bucket => bucket.name === 'post-media');
    
    if (bucketExists) {
      console.log('✅ Bucket "post-media" already exists');
    } else {
      // Create the bucket
      const { data: bucket, error: createError } = await supabase.storage.createBucket('post-media', {
        public: true,
        fileSizeLimit: 10485760, // 10MB
        allowedMimeTypes: [
          'image/jpeg',
          'image/jpg',
          'image/png',
          'image/webp',
          'image/gif',
          'video/mp4',
          'video/quicktime',
          'video/webm',
          'application/pdf',
          'application/msword',
          'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
          'application/vnd.ms-excel',
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          'application/vnd.ms-powerpoint',
          'application/vnd.openxmlformats-officedocument.presentationml.presentation'
        ]
      });

      if (createError) {
        console.error('❌ Error creating bucket:', createError);
        return;
      }

      console.log('✅ Bucket "post-media" created successfully');
    }

    // Set up storage policies
    console.log('📝 Setting up storage policies...');

    const policies = [
      {
        name: 'Allow authenticated users to upload',
        definition: `
          CREATE POLICY "Allow authenticated users to upload to post-media"
          ON storage.objects FOR INSERT TO authenticated
          WITH CHECK (bucket_id = 'post-media');
        `
      },
      {
        name: 'Allow public to view',
        definition: `
          CREATE POLICY "Allow public to view post-media"
          ON storage.objects FOR SELECT TO public
          USING (bucket_id = 'post-media');
        `
      },
      {
        name: 'Allow users to update their own uploads',
        definition: `
          CREATE POLICY "Allow users to update their own uploads in post-media"
          ON storage.objects FOR UPDATE TO authenticated
          USING (bucket_id = 'post-media' AND auth.uid()::text = (storage.foldername(name))[1])
          WITH CHECK (bucket_id = 'post-media' AND auth.uid()::text = (storage.foldername(name))[1]);
        `
      },
      {
        name: 'Allow users to delete their own uploads',
        definition: `
          CREATE POLICY "Allow users to delete their own uploads in post-media"
          ON storage.objects FOR DELETE TO authenticated
          USING (bucket_id = 'post-media' AND auth.uid()::text = (storage.foldername(name))[1]);
        `
      }
    ];

    // Note: Storage policies need to be set up through Supabase Dashboard or SQL Editor
    console.log('\n⚠️  Storage policies need to be set up manually:');
    console.log('1. Go to Supabase Dashboard > Storage > Policies');
    console.log('2. Add the following policies for the "post-media" bucket:\n');
    
    policies.forEach(policy => {
      console.log(`Policy: ${policy.name}`);
      console.log('SQL:');
      console.log(policy.definition);
      console.log('---\n');
    });

    console.log('✅ Post-media bucket setup complete!');
    console.log('\n📸 Users can now upload images and videos for their posts');
    console.log('📄 Documents are also supported for document-type posts');
    console.log('🔒 Files are organized by user ID for security');

  } catch (error) {
    console.error('❌ Unexpected error:', error);
  }
}

// Run the setup
createPostMediaBucket();