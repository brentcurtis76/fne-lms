#!/usr/bin/env node

/**
 * Complete fix for meeting documents feature
 * Creates storage bucket and verifies all database tables
 */

const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceRoleKey) {
  console.error('Missing environment variables. Please check NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceRoleKey);

async function fixMeetingDocuments() {
  console.log('🔧 Fixing meeting documents system...\n');

  let hasErrors = false;

  try {
    // Step 1: Create storage bucket
    console.log('1. Creating meeting-documents storage bucket...');
    
    // First, try to delete the bucket if it exists (in case it's misconfigured)
    const { error: deleteError } = await supabase.storage.deleteBucket('meeting-documents');
    if (deleteError && !deleteError.message.includes('not found')) {
      console.log('   ⚠️  Could not delete existing bucket:', deleteError.message);
    }
    
    // Create the bucket with proper configuration
    const { data: bucket, error: bucketError } = await supabase.storage.createBucket('meeting-documents', {
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

    if (bucketError) {
      if (bucketError.message.includes('already exists')) {
        console.log('   ✓ Storage bucket already exists');
        
        // Update bucket configuration
        const { error: updateError } = await supabase.storage.updateBucket('meeting-documents', {
          public: true,
          fileSizeLimit: 10485760,
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
        
        if (updateError) {
          console.log('   ❌ Error updating bucket configuration:', updateError.message);
          hasErrors = true;
        } else {
          console.log('   ✓ Bucket configuration updated');
        }
      } else {
        throw bucketError;
      }
    } else {
      console.log('   ✓ Storage bucket created successfully');
    }

    // Step 2: Verify all required tables exist
    console.log('\n2. Verifying database tables...');
    
    const tables = [
      'simple_meetings',
      'meeting_attachments',
      'meeting_commitments',
      'meeting_attendees'
    ];
    
    for (const tableName of tables) {
      try {
        const { data, error } = await supabase
          .from(tableName)
          .select('id')
          .limit(1);
        
        if (error && error.code === '42P01') {
          console.log(`   ❌ Table '${tableName}' does not exist`);
          hasErrors = true;
        } else if (error) {
          console.log(`   ⚠️  Error checking '${tableName}':`, error.message);
        } else {
          console.log(`   ✓ Table '${tableName}' exists`);
        }
      } catch (e) {
        console.log(`   ❌ Error checking '${tableName}':`, e.message);
        hasErrors = true;
      }
    }

    // Step 3: Test storage bucket access
    console.log('\n3. Testing storage bucket access...');
    
    try {
      // Create a test file
      const testContent = new Blob(['test'], { type: 'text/plain' });
      const testPath = 'test/test-file.txt';
      
      const { data: uploadData, error: uploadError } = await supabase.storage
        .from('meeting-documents')
        .upload(testPath, testContent, {
          upsert: true
        });
      
      if (uploadError) {
        console.log('   ❌ Storage upload test failed:', uploadError.message);
        hasErrors = true;
      } else {
        console.log('   ✓ Storage upload test successful');
        
        // Try to delete the test file
        const { error: deleteError } = await supabase.storage
          .from('meeting-documents')
          .remove([testPath]);
        
        if (deleteError) {
          console.log('   ⚠️  Could not delete test file:', deleteError.message);
        } else {
          console.log('   ✓ Storage delete test successful');
        }
      }
    } catch (e) {
      console.log('   ❌ Storage test error:', e.message);
      hasErrors = true;
    }

    // Step 4: Storage bucket policies reminder
    console.log('\n4. Storage RLS policies...');
    console.log('   ℹ️  Please configure the following RLS policies in Supabase dashboard:');
    console.log('      1. Go to Storage > Policies in your Supabase dashboard');
    console.log('      2. Select the "meeting-documents" bucket');
    console.log('      3. Create these policies:');
    console.log('         - INSERT: authenticated users can upload');
    console.log('         - SELECT: public read access (or authenticated)');
    console.log('         - DELETE: users can delete their own files');

    // Final summary
    if (hasErrors) {
      console.log('\n❌ Setup completed with errors. Please address the issues above.');
      console.log('\nRequired actions:');
      console.log('1. Run the SQL migration: database/fix-meeting-system-complete.sql');
      console.log('2. Configure storage RLS policies in Supabase dashboard');
      console.log('3. Re-run this script to verify everything is working');
    } else {
      console.log('\n✅ Setup completed successfully!');
      console.log('\nNext steps:');
      console.log('1. Configure storage RLS policies in Supabase dashboard (see above)');
      console.log('2. Test the meeting document upload feature');
    }

  } catch (error) {
    console.error('\n❌ Setup failed:', error.message);
    process.exit(1);
  }
}

// Run the fix
fixMeetingDocuments();