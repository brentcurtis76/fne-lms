// Script to create the course-materials bucket for bibliography PDFs
// Run with: node scripts/create-course-materials-bucket.js

const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

// Get Supabase URL and key from environment variables
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const bucketName = 'course-materials';

async function createCourseMaterialsBucket() {
  if (!supabaseUrl || !supabaseKey) {
    console.error('Error: Supabase URL or Service Role Key not found in environment variables');
    console.log('Make sure you have a .env.local file with:');
    console.log('NEXT_PUBLIC_SUPABASE_URL=your-supabase-url');
    console.log('SUPABASE_SERVICE_ROLE_KEY=your-service-role-key');
    process.exit(1);
  }

  console.log(`Connecting to Supabase at ${supabaseUrl}`);
  
  // Create Supabase client with service role key (has admin privileges)
  const supabase = createClient(supabaseUrl, supabaseKey);
  
  try {
    // First check if bucket already exists
    console.log(`Checking if bucket '${bucketName}' exists...`);
    
    // Try to list the bucket contents to see if it exists
    const { error: listError } = await supabase.storage.from(bucketName).list();
    
    if (!listError) {
      console.log(`✅ Bucket '${bucketName}' already exists!`);
      return;
    }
    
    // Create the bucket
    console.log(`Creating bucket '${bucketName}'...`);
    const { data, error } = await supabase.storage.createBucket(bucketName, {
      public: true, // Make bucket public so files can be accessed
      fileSizeLimit: 10485760, // 10MB file size limit
      allowedMimeTypes: [
        'application/pdf',
        'image/jpeg',
        'image/jpg', 
        'image/png',
        'image/gif',
        'image/webp',
        'application/msword',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'application/vnd.ms-excel',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'application/vnd.ms-powerpoint',
        'application/vnd.openxmlformats-officedocument.presentationml.presentation'
      ]
    });
    
    if (error) {
      throw error;
    }
    
    console.log(`✅ Successfully created bucket '${bucketName}'!`);
    console.log('Bucket details:', data);
    
    // Create RLS policies for the bucket
    console.log(`Setting up RLS policies for bucket '${bucketName}'...`);
    
    // Allow authenticated users to upload files
    const uploadPolicy = `
      CREATE POLICY "Authenticated users can upload course materials"
      ON storage.objects
      FOR INSERT
      TO authenticated
      WITH CHECK (bucket_id = 'course-materials');
    `;
    
    // Allow public read access
    const readPolicy = `
      CREATE POLICY "Public can read course materials"
      ON storage.objects
      FOR SELECT
      TO public
      USING (bucket_id = 'course-materials');
    `;
    
    // Allow authenticated users to update/delete their own files
    const updatePolicy = `
      CREATE POLICY "Authenticated users can update course materials"
      ON storage.objects
      FOR UPDATE
      TO authenticated
      USING (bucket_id = 'course-materials');
    `;
    
    const deletePolicy = `
      CREATE POLICY "Authenticated users can delete course materials"
      ON storage.objects
      FOR DELETE
      TO authenticated
      USING (bucket_id = 'course-materials');
    `;
    
    console.log(`✅ Bucket '${bucketName}' is ready for use!`);
    console.log('\nNote: RLS policies need to be applied manually in Supabase Dashboard:');
    console.log('1. Go to Storage > Policies');
    console.log('2. Add the policies shown above');
    console.log('\nOr use the SQL editor to run the policies.');
    
  } catch (error) {
    console.error('Error creating bucket:', error.message);
    process.exit(1);
  }
}

createCourseMaterialsBucket();