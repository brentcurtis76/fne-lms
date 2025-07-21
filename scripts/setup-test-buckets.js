/**
 * Sets up storage buckets in local Supabase for testing
 */

const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: './.env.test.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function setupBuckets() {
  console.log('Setting up storage buckets for local testing...');
  
  const buckets = [
    { 
      name: 'community-images', 
      public: true,
      fileSizeLimit: 5242880, // 5MB
      allowedMimeTypes: ['image/jpeg', 'image/png', 'image/webp']
    },
    { 
      name: 'course-materials', 
      public: false,
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
        'image/png'
      ]
    },
    { 
      name: 'assignments', 
      public: false,
      fileSizeLimit: 10485760, // 10MB
      allowedMimeTypes: [
        'application/pdf',
        'application/msword',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'image/jpeg',
        'image/png'
      ]
    },
    {
      name: 'post-media',
      public: false,
      fileSizeLimit: 52428800, // 50MB
      allowedMimeTypes: [
        'image/jpeg',
        'image/png',
        'image/gif',
        'image/webp',
        'video/mp4',
        'video/quicktime',
        'application/pdf'
      ]
    },
    {
      name: 'feedback-screenshots',
      public: false,
      fileSizeLimit: 5242880, // 5MB
      allowedMimeTypes: ['image/jpeg', 'image/png', 'image/webp']
    }
  ];

  for (const bucket of buckets) {
    try {
      // Check if bucket exists
      const { data: existingBucket, error: checkError } = await supabase
        .storage
        .getBucket(bucket.name);
      
      if (checkError && checkError.message.includes('not found')) {
        // Create bucket
        const { data, error } = await supabase.storage.createBucket(bucket.name, {
          public: bucket.public,
          fileSizeLimit: bucket.fileSizeLimit,
          allowedMimeTypes: bucket.allowedMimeTypes
        });
        
        if (error) {
          console.error(`❌ Error creating bucket ${bucket.name}:`, error.message);
        } else {
          console.log(`✅ Created bucket: ${bucket.name}`);
        }
      } else if (!checkError) {
        console.log(`✅ Bucket already exists: ${bucket.name}`);
      } else {
        console.error(`❌ Error checking bucket ${bucket.name}:`, checkError.message);
      }
    } catch (error) {
      console.error(`❌ Unexpected error with bucket ${bucket.name}:`, error);
    }
  }

  console.log('Storage bucket setup complete!');
}

setupBuckets().catch(console.error);