// This script creates the required storage bucket in Supabase
// Run with: node scripts/create-bucket.js

const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

// Get Supabase URL and key from environment variables
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY; // Note: Requires service role key

// Bucket name to create
const bucketName = process.env.NEXT_PUBLIC_STORAGE_BUCKET || 'resources';

async function createBucket() {
  if (!supabaseUrl || !supabaseKey) {
    console.error('Error: Supabase URL or Service Role Key not found in environment variables');
    console.log('Make sure you have a .env.local file with:');
    console.log('NEXT_PUBLIC_SUPABASE_URL=your-supabase-url');
    console.log('NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY=your-service-role-key');
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
      public: true, // Make bucket public
      fileSizeLimit: 10485760, // 10MB file size limit
    });
    
    if (error) {
      throw error;
    }
    
    console.log(`✅ Successfully created bucket '${bucketName}'!`);
    console.log('Bucket details:', data);
    
    // Set bucket policy to public
    console.log(`Setting public policy for bucket '${bucketName}'...`);
    const { error: policyError } = await supabase.storage.from(bucketName).getPublicUrl('test');
    
    if (policyError) {
      console.warn(`Warning: Could not verify public access: ${policyError.message}`);
    } else {
      console.log(`✅ Bucket '${bucketName}' is publicly accessible`);
    }
    
  } catch (error) {
    console.error('Error creating bucket:', error.message);
    process.exit(1);
  }
}

createBucket();
