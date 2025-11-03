#!/usr/bin/env node
/**
 * Diagnostic script for assignments storage bucket
 *
 * This script verifies the storage bucket configuration after applying
 * the 20250103000002_create_assignments_bucket.sql migration.
 *
 * Checks:
 * 1. Bucket exists and has correct configuration
 * 2. RLS policies are created on storage.objects
 * 3. File upload/read/delete operations work correctly
 *
 * Usage:
 *   node scripts/diagnose-storage-bucket.js
 */

const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  console.error('❌ Missing environment variables');
  console.error('Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

async function runDiagnostics() {
  console.log('🔍 Running Storage Bucket Diagnostics\n');

  let passedChecks = 0;
  let failedChecks = 0;

  // Check 1: Bucket Existence
  console.log('Check 1: Bucket existence and configuration');
  try {
    const { data: buckets, error } = await supabase.storage.listBuckets();

    if (error) {
      console.log('❌ FAIL: Could not list buckets');
      console.log('   Error:', error.message);
      failedChecks++;
    } else {
      const assignmentsBucket = buckets.find(b => b.id === 'assignments');

      if (!assignmentsBucket) {
        console.log('❌ FAIL: assignments bucket does not exist');
        console.log('   Please apply migration: 20250103000002_create_assignments_bucket.sql');
        failedChecks++;
      } else {
        console.log('✅ PASS: assignments bucket exists');
        console.log(`   Public: ${assignmentsBucket.public}`);
        console.log(`   File size limit: ${assignmentsBucket.file_size_limit} bytes`);

        if (assignmentsBucket.public === false) {
          console.log('✅ PASS: Bucket is correctly private');
        } else {
          console.log('⚠️  WARN: Bucket is public (expected private)');
        }

        passedChecks++;
      }
    }
  } catch (err) {
    console.log('❌ FAIL: Unexpected error');
    console.log('   Error:', err.message);
    failedChecks++;
  }

  // Check 2: RLS Policies on storage.objects
  console.log('\nCheck 2: RLS policies on storage.objects');

  // We can't directly query storage.objects policies from the client,
  // but we can test if the policies work by attempting operations
  console.log('⚠️  INFO: Cannot directly query policies from client');
  console.log('   Will test policies by attempting upload operation below');

  // Check 3: File Upload Test (requires authentication)
  console.log('\nCheck 3: File upload test');

  // Check if user is authenticated
  const { data: { session } } = await supabase.auth.getSession();

  if (!session) {
    console.log('⚠️  SKIP: Not authenticated');
    console.log('   To test upload: authenticate first, then rerun script');
    console.log('   Or test manually by uploading via GroupSubmissionModalV2');
  } else {
    try {
      // Create a test file
      const testFileName = `group-submissions/test-assignment/test-group/${Date.now()}.txt`;
      const testContent = 'This is a test file for storage bucket diagnostics';
      const testFile = new Blob([testContent], { type: 'text/plain' });

      console.log(`   Attempting upload: ${testFileName}`);

      const { data, error } = await supabase.storage
        .from('assignments')
        .upload(testFileName, testFile);

      if (error) {
        console.log('❌ FAIL: Upload failed');
        console.log('   Error:', error.message);
        console.log('   Hint: Check if RLS policies are applied correctly');
        failedChecks++;
      } else {
        console.log('✅ PASS: Upload succeeded');
        console.log(`   Path: ${data.path}`);
        passedChecks++;

        // Clean up test file
        console.log('   Cleaning up test file...');
        const { error: deleteError } = await supabase.storage
          .from('assignments')
          .remove([testFileName]);

        if (deleteError) {
          console.log('⚠️  WARN: Could not delete test file');
          console.log('   Error:', deleteError.message);
        } else {
          console.log('✅ Test file deleted successfully');
        }
      }
    } catch (err) {
      console.log('❌ FAIL: Unexpected error during upload test');
      console.log('   Error:', err.message);
      failedChecks++;
    }
  }

  // Check 4: Verify folder path validation
  console.log('\nCheck 4: Folder path validation');

  if (!session) {
    console.log('⚠️  SKIP: Not authenticated');
  } else {
    try {
      // Try to upload outside allowed folder (should fail)
      const invalidFileName = `wrong-folder/test.txt`;
      const testContent = 'This should fail';
      const testFile = new Blob([testContent], { type: 'text/plain' });

      console.log(`   Attempting upload to invalid path: ${invalidFileName}`);

      const { data, error } = await supabase.storage
        .from('assignments')
        .upload(invalidFileName, testFile);

      if (error) {
        console.log('✅ PASS: Upload to invalid path correctly rejected');
        console.log('   Error:', error.message);
        passedChecks++;
      } else {
        console.log('❌ FAIL: Upload to invalid path succeeded (should be rejected)');
        console.log('   Path restriction policy may not be working');
        failedChecks++;

        // Clean up
        await supabase.storage.from('assignments').remove([invalidFileName]);
      }
    } catch (err) {
      console.log('❌ FAIL: Unexpected error');
      console.log('   Error:', err.message);
      failedChecks++;
    }
  }

  // Summary
  console.log('\n' + '='.repeat(60));
  console.log('📊 Diagnostics Summary');
  console.log('='.repeat(60));
  console.log(`✅ Passed: ${passedChecks}`);
  console.log(`❌ Failed: ${failedChecks}`);
  console.log(`📊 Total:  ${passedChecks + failedChecks}`);

  if (failedChecks === 0) {
    console.log('\n🎉 All diagnostics passed! Storage bucket is configured correctly.');
    process.exit(0);
  } else {
    console.log('\n⚠️  Some checks failed. Review the errors above.');
    console.log('\nTroubleshooting:');
    console.log('1. Ensure migration 20250103000002_create_assignments_bucket.sql is applied');
    console.log('2. Check Supabase dashboard > Storage > Policies');
    console.log('3. Verify RLS is enabled on storage.objects table');
    console.log('4. Test manually by uploading via GroupSubmissionModalV2');
    process.exit(1);
  }
}

// Main execution
(async () => {
  try {
    await runDiagnostics();
  } catch (err) {
    console.error('Fatal error running diagnostics:', err);
    process.exit(1);
  }
})();
