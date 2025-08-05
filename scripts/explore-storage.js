const { createClient } = require('@supabase/supabase-js');

// Load environment variables
require('dotenv').config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('Missing Supabase environment variables');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function exploreStorage() {
  try {
    console.log('🔍 Exploring Supabase Storage...\n');
    
    // 1. List all buckets
    console.log('📦 Available Storage Buckets:');
    const { data: buckets, error: bucketsError } = await supabase.storage.listBuckets();
    
    if (bucketsError) {
      console.error('Error listing buckets:', bucketsError);
      return;
    }
    
    if (!buckets || buckets.length === 0) {
      console.log('No storage buckets found');
      return;
    }
    
    buckets.forEach((bucket, index) => {
      console.log(`${index + 1}. ${bucket.name} (${bucket.public ? 'Public' : 'Private'})`);
    });
    
    console.log('\n');
    
    // 2. Look for each bucket and explore contents
    for (const bucket of buckets) {
      console.log(`🗂️  Exploring bucket: "${bucket.name}"`);
      
      // List contents of the bucket
      const { data: files, error: filesError } = await supabase.storage
        .from(bucket.name)
        .list('', {
          limit: 100,
          offset: 0
        });
      
      if (filesError) {
        console.error(`  Error listing files in ${bucket.name}:`, filesError);
        continue;
      }
      
      if (!files || files.length === 0) {
        console.log(`  No files found in ${bucket.name}`);
        continue;
      }
      
      console.log(`  Found ${files.length} items:`);
      files.forEach(file => {
        console.log(`    ${file.name} (${file.metadata?.size || 'unknown size'})`);
      });
      
      // Look specifically for "Equipo" folder
      const equipoFolder = files.find(file => 
        file.name.toLowerCase().includes('equipo') || 
        file.name.toLowerCase().includes('team')
      );
      
      if (equipoFolder) {
        console.log(`\n  🎯 Found potential Equipo folder: "${equipoFolder.name}"`);
        
        // List contents of Equipo folder
        const { data: equipoFiles, error: equipoError } = await supabase.storage
          .from(bucket.name)
          .list(equipoFolder.name, {
            limit: 100,
            offset: 0
          });
        
        if (equipoError) {
          console.error(`    Error listing Equipo folder contents:`, equipoError);
        } else if (equipoFiles && equipoFiles.length > 0) {
          console.log(`    Equipo folder contents (${equipoFiles.length} items):`);
          equipoFiles.forEach(file => {
            console.log(`      ${file.name} (${file.metadata?.size || 'unknown size'})`);
          });
        }
      }
      
      console.log('\n');
    }
    
    // 3. Try to access a specific bucket that might contain resources
    const potentialBuckets = ['resources', 'images', 'assets', 'public', 'media'];
    
    for (const bucketName of potentialBuckets) {
      console.log(`🔍 Checking for bucket: "${bucketName}"`);
      
      const { data: files, error } = await supabase.storage
        .from(bucketName)
        .list('', { limit: 10 });
      
      if (!error && files) {
        console.log(`  ✅ Found bucket "${bucketName}" with ${files.length} items`);
        
        // Look for Equipo folder
        const { data: equipoCheck, error: equipoError } = await supabase.storage
          .from(bucketName)
          .list('Equipo', { limit: 50 });
        
        if (!equipoError && equipoCheck && equipoCheck.length > 0) {
          console.log(`  🎯 Found Equipo folder in "${bucketName}" with ${equipoCheck.length} files:`);
          
          equipoCheck.forEach(file => {
            const { data: publicUrl } = supabase.storage
              .from(bucketName)
              .getPublicUrl(`Equipo/${file.name}`);
            
            console.log(`    📷 ${file.name}`);
            console.log(`       URL: ${publicUrl.publicUrl}`);
          });
        }
      } else {
        console.log(`  ❌ Bucket "${bucketName}" not found or inaccessible`);
      }
    }
    
  } catch (error) {
    console.error('Unexpected error:', error);
  }
}

exploreStorage();