const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.test' });

// Get Supabase URL and key from .env.test
// Get Supabase URL and key from .env.test, checking for common variations
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;

// Buckets to create for the test environment
const bucketNames = ['community-images', 'course-materials', 'assignments'];

async function provisionTestEnvironment() {
  if (!supabaseUrl || !supabaseKey) {
    console.error('Error: Supabase credentials not found in .env.test');
    console.log('Ensure .env.test contains NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY');
    process.exit(1);
  }

  console.log(`Connecting to Supabase test environment at ${supabaseUrl}`);
  const supabase = createClient(supabaseUrl, supabaseKey);

  for (const bucketName of bucketNames) {
    try {
      console.log(`\n--- Processing bucket: ${bucketName} ---`);
      // 1. Check if bucket exists
      const { data: existingBucket, error: getError } = await supabase.storage.getBucket(bucketName);

      if (getError && getError.statusCode !== '404') {
          console.error(`Error checking for bucket ${bucketName}:`, getError.message);
          continue;
      }

      if (existingBucket) {
        console.log(`✅ Bucket '${bucketName}' already exists. Skipping creation.`);
      } else {
        // 2. Create the bucket if it doesn't exist
        console.log(`Creating bucket '${bucketName}'...`);
        const { data, error: createError } = await supabase.storage.createBucket(bucketName, {
          public: true, // Make bucket public
        });

        if (createError) {
          throw createError;
        }
        console.log(`✅ Successfully created bucket '${bucketName}'.`);
      }

    } catch (error) {
      console.error(`❌ Error processing bucket '${bucketName}':`, error.message);
    }
  }
  console.log('\nProvisioning complete.');
}

provisionTestEnvironment();
