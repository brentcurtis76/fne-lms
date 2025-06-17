#!/usr/bin/env node

/**
 * Manual script to verify and guide through community customization migration
 * Since exec_sql is not available, this provides the SQL to run manually
 */

const fs = require('fs').promises;
const path = require('path');

async function generateMigrationInstructions() {
  try {
    console.log('🚀 Community Customization Migration Instructions\n');
    console.log('Since automatic migration is not available, please follow these steps:\n');
    
    // Read the SQL file
    const sqlPath = path.join(__dirname, '..', 'database', 'add-community-customization.sql');
    const sql = await fs.readFile(sqlPath, 'utf8');
    
    console.log('1. Go to your Supabase Dashboard');
    console.log('2. Navigate to the SQL Editor');
    console.log('3. Create a new query');
    console.log('4. Copy and paste the following SQL:\n');
    console.log('=' .repeat(80));
    console.log(sql);
    console.log('=' .repeat(80));
    console.log('\n5. Click "Run" to execute the migration\n');
    
    console.log('✅ After running the SQL, you should see:');
    console.log('   - New columns added to community_workspaces table');
    console.log('   - Updated RLS policies for community leaders');
    console.log('   - Trigger for updating timestamps\n');
    
    console.log('📦 Storage Bucket Setup:');
    console.log('   1. Go to Storage in Supabase Dashboard');
    console.log('   2. You mentioned you already created "community-images" bucket ✓');
    console.log('   3. Now add these storage policies:\n');
    
    const storagePolicies = `
-- Allow authenticated users to upload
CREATE POLICY "Authenticated users can upload community images"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'community-images');

-- Allow public read
CREATE POLICY "Public can view community images"
ON storage.objects FOR SELECT
TO public
USING (bucket_id = 'community-images');

-- Allow authenticated users to update their uploads
CREATE POLICY "Users can update their community images"
ON storage.objects FOR UPDATE
TO authenticated
USING (bucket_id = 'community-images');

-- Allow authenticated users to delete their uploads
CREATE POLICY "Users can delete their community images"
ON storage.objects FOR DELETE
TO authenticated
USING (bucket_id = 'community-images');`;
    
    console.log(storagePolicies);
    console.log('\n💡 Run these policies in the SQL Editor as well.\n');
    
    console.log('🎉 Once complete, the Growth Communities customization feature will be ready!');
    console.log('   - Community leaders can rename their communities');
    console.log('   - They can upload custom group images');
    console.log('   - Changes will appear throughout the workspace\n');
    
  } catch (error) {
    console.error('❌ Error reading migration file:', error);
  }
}

// Run the instructions
generateMigrationInstructions();