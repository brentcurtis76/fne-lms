#!/usr/bin/env node
/**
 * Delete test submission script
 *
 * Cleans up test submissions from group assignments including:
 * - Submission records from database
 * - Uploaded files from storage
 * - Notifications sent to consultants
 *
 * Usage:
 *   node scripts/delete-test-submission.js <assignment-id> <user-email>
 *
 * Example:
 *   node scripts/delete-test-submission.js abc123 juan.reyesar@liceonacionaldellolleo.cl
 */

const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error('❌ Missing environment variables');
  console.error('Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

// Use service role key for admin operations
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

async function deleteTestSubmission(assignmentId, userEmail) {
  console.log('🗑️  Deleting test submission...\n');
  console.log(`Assignment ID: ${assignmentId}`);
  console.log(`User Email: ${userEmail}\n`);

  try {
    // 1. Get user ID from email
    console.log('Step 1: Looking up user...');
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('id, first_name, last_name')
      .eq('email', userEmail)
      .single();

    if (profileError || !profile) {
      console.log('❌ User not found with email:', userEmail);
      return;
    }

    console.log(`✅ Found user: ${profile.first_name} ${profile.last_name} (${profile.id})\n`);

    // 2. Get submission details
    console.log('Step 2: Finding submission...');
    const { data: submission, error: submissionError } = await supabase
      .from('group_assignment_submissions')
      .select('*, group_assignment_groups(name)')
      .eq('assignment_id', assignmentId)
      .eq('user_id', profile.id)
      .single();

    if (submissionError || !submission) {
      console.log('⚠️  No submission found for this user and assignment');
      console.log('   Checking if there are any submissions for this assignment...');

      const { data: allSubmissions } = await supabase
        .from('group_assignment_submissions')
        .select('user_id')
        .eq('assignment_id', assignmentId);

      if (allSubmissions && allSubmissions.length > 0) {
        console.log(`   Found ${allSubmissions.length} submission(s) for this assignment`);
        console.log('   They may belong to other group members');
      } else {
        console.log('   No submissions found for this assignment at all');
      }
      return;
    }

    const groupId = submission.group_id;
    const fileUrl = submission.file_url;
    const groupName = submission.group_assignment_groups?.name || 'Unknown Group';

    console.log(`✅ Found submission from "${groupName}"`);
    console.log(`   Group ID: ${groupId}`);
    console.log(`   File URL: ${fileUrl || 'None'}\n`);

    // 3. Delete file from storage if exists
    if (fileUrl) {
      console.log('Step 3: Deleting uploaded file from storage...');
      try {
        // Extract file path from URL
        const urlParts = fileUrl.split('/');
        const bucketIndex = urlParts.findIndex(part => part === 'assignments');
        if (bucketIndex !== -1) {
          const filePath = urlParts.slice(bucketIndex + 1).join('/');

          const { error: deleteError } = await supabase.storage
            .from('assignments')
            .remove([filePath]);

          if (deleteError) {
            console.log(`⚠️  Could not delete file: ${deleteError.message}`);
          } else {
            console.log(`✅ Deleted file: ${filePath}\n`);
          }
        }
      } catch (err) {
        console.log(`⚠️  Error deleting file: ${err.message}\n`);
      }
    } else {
      console.log('Step 3: No file to delete (submission has no file_url)\n');
    }

    // 4. Delete all submission records for this group (all members)
    console.log('Step 4: Deleting submission records for all group members...');
    const { data: deletedSubmissions, error: deleteError } = await supabase
      .from('group_assignment_submissions')
      .delete()
      .eq('assignment_id', assignmentId)
      .eq('group_id', groupId)
      .select('user_id');

    if (deleteError) {
      console.log(`❌ Error deleting submissions: ${deleteError.message}`);
    } else {
      console.log(`✅ Deleted ${deletedSubmissions?.length || 0} submission record(s)\n`);
    }

    // 5. Delete related notifications
    console.log('Step 5: Deleting consultant notifications...');
    const { data: deletedNotifications, error: notifError } = await supabase
      .from('notifications')
      .delete()
      .eq('type', 'group_assignment_submitted')
      .eq('data->>assignment_id', assignmentId)
      .eq('data->>group_id', groupId)
      .select('id');

    if (notifError) {
      console.log(`⚠️  Could not delete notifications: ${notifError.message}`);
    } else {
      console.log(`✅ Deleted ${deletedNotifications?.length || 0} notification(s)\n`);
    }

    console.log('=' .repeat(60));
    console.log('🎉 Test submission cleanup complete!');
    console.log('=' .repeat(60));

  } catch (error) {
    console.error('❌ Fatal error:', error.message);
    process.exit(1);
  }
}

// Parse command line arguments
const args = process.argv.slice(2);

if (args.length < 2) {
  console.log('Usage: node scripts/delete-test-submission.js <assignment-id> <user-email>');
  console.log('');
  console.log('Example:');
  console.log('  node scripts/delete-test-submission.js abc123 juan.reyesar@liceonacionaldellolleo.cl');
  process.exit(1);
}

const [assignmentId, userEmail] = args;

deleteTestSubmission(assignmentId, userEmail);
