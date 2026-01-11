/**
 * Demo Data Cleanup
 * Removes all demo data created by the seeder
 *
 * Usage: npm run demo:cleanup
 */

import { createClient } from '@supabase/supabase-js';
import { DEMO_CONFIG } from './config';

async function cleanupDemoData() {
  console.log('\n========================================');
  console.log('  FNE LMS Demo Data Cleanup');
  console.log('========================================\n');

  // Validate environment variables
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseServiceKey) {
    console.error('ERROR: Missing environment variables.');
    console.error('Please ensure NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are set in .env.local');
    process.exit(1);
  }

  // Create Supabase client with service role key for admin operations
  const supabase = createClient(supabaseUrl, supabaseServiceKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  });

  try {
    // Find the demo school
    const { data: school, error: schoolFindError } = await supabase
      .from('schools')
      .select('id, name')
      .eq('name', DEMO_CONFIG.DEMO_SCHOOL_NAME)
      .single();

    if (schoolFindError || !school) {
      console.log(`No demo school found with name "${DEMO_CONFIG.DEMO_SCHOOL_NAME}".`);
      console.log('Nothing to clean up.\n');
      return;
    }

    console.log(`Found demo school: ${school.name} (ID: ${school.id})\n`);
    console.log('Cleaning up demo data...\n');

    // Step 1: Delete migration plan entries
    console.log('Step 1: Deleting migration plan entries...');
    const { error: migrationError, count: migrationCount } = await supabase
      .from('ab_migration_plan')
      .delete({ count: 'exact' })
      .eq('school_id', school.id);

    if (migrationError) {
      console.error(`  Warning: ${migrationError.message}`);
    } else {
      console.log(`  Deleted ${migrationCount || 0} migration plan entries`);
    }

    // Step 2: Delete transversal context
    console.log('Step 2: Deleting transversal context...');
    const { error: contextError } = await supabase
      .from('school_transversal_context')
      .delete()
      .eq('school_id', school.id);

    if (contextError) {
      console.error(`  Warning: ${contextError.message}`);
    } else {
      console.log('  Deleted transversal context');
    }

    // Step 3: Get communities and workspaces for cleanup
    console.log('Step 3: Finding communities and workspaces...');
    const { data: communities } = await supabase
      .from('growth_communities')
      .select('id')
      .eq('school_id', school.id);

    for (const community of communities || []) {
      // Get workspace
      const { data: workspace } = await supabase
        .from('community_workspaces')
        .select('id')
        .eq('community_id', community.id)
        .single();

      if (workspace) {
        // Delete meetings and related data
        console.log(`  Cleaning workspace ${workspace.id}...`);

        const { data: meetings } = await supabase
          .from('community_meetings')
          .select('id')
          .eq('workspace_id', workspace.id);

        for (const meeting of meetings || []) {
          await supabase.from('meeting_agreements').delete().eq('meeting_id', meeting.id);
          await supabase.from('meeting_commitments').delete().eq('meeting_id', meeting.id);
          await supabase.from('meeting_tasks').delete().eq('meeting_id', meeting.id);
          await supabase.from('meeting_attendees').delete().eq('meeting_id', meeting.id);
        }

        await supabase.from('community_meetings').delete().eq('workspace_id', workspace.id);

        // Delete posts and related data
        const { data: posts } = await supabase
          .from('community_posts')
          .select('id')
          .eq('workspace_id', workspace.id);

        for (const post of posts || []) {
          await supabase.from('post_comments').delete().eq('post_id', post.id);
          await supabase.from('post_reactions').delete().eq('post_id', post.id);
          await supabase.from('post_media').delete().eq('post_id', post.id);
          await supabase.from('post_hashtags').delete().eq('post_id', post.id);
          await supabase.from('post_mentions').delete().eq('post_id', post.id);
          await supabase.from('saved_posts').delete().eq('post_id', post.id);
        }

        await supabase.from('community_posts').delete().eq('workspace_id', workspace.id);

        // Delete messages
        await supabase.from('community_messages').delete().eq('workspace_id', workspace.id);
        await supabase.from('message_threads').delete().eq('workspace_id', workspace.id);

        // Delete documents
        await supabase.from('community_documents').delete().eq('workspace_id', workspace.id);
        await supabase.from('document_folders').delete().eq('workspace_id', workspace.id);

        // Delete workspace activity
        await supabase.from('workspace_activities').delete().eq('workspace_id', workspace.id);

        // Delete workspace
        await supabase.from('community_workspaces').delete().eq('id', workspace.id);
      }
    }
    console.log('  Deleted workspace data');

    // Step 4: Delete user roles for this school
    console.log('Step 4: Deleting user roles...');
    const { error: rolesError, count: rolesCount } = await supabase
      .from('user_roles')
      .delete({ count: 'exact' })
      .eq('school_id', school.id);

    if (rolesError) {
      console.error(`  Warning: ${rolesError.message}`);
    } else {
      console.log(`  Deleted ${rolesCount || 0} user roles`);
    }

    // Step 5: Delete demo profiles (by email pattern)
    console.log('Step 5: Deleting demo profiles...');
    const { error: profilesError, count: profilesCount } = await supabase
      .from('profiles')
      .delete({ count: 'exact' })
      .like('email', `%${DEMO_CONFIG.DEMO_EMAIL_DOMAIN}`);

    if (profilesError) {
      console.error(`  Warning: ${profilesError.message}`);
    } else {
      console.log(`  Deleted ${profilesCount || 0} demo profiles`);
    }

    // Step 6: Delete communities
    console.log('Step 6: Deleting communities...');
    const { error: communitiesError, count: communitiesCount } = await supabase
      .from('growth_communities')
      .delete({ count: 'exact' })
      .eq('school_id', school.id);

    if (communitiesError) {
      console.error(`  Warning: ${communitiesError.message}`);
    } else {
      console.log(`  Deleted ${communitiesCount || 0} communities`);
    }

    // Step 7: Delete generations
    console.log('Step 7: Deleting generations...');
    const { error: generationsError, count: generationsCount } = await supabase
      .from('generations')
      .delete({ count: 'exact' })
      .eq('school_id', school.id);

    if (generationsError) {
      console.error(`  Warning: ${generationsError.message}`);
    } else {
      console.log(`  Deleted ${generationsCount || 0} generations`);
    }

    // Step 8: Delete school
    console.log('Step 8: Deleting school...');
    const { error: schoolError } = await supabase
      .from('schools')
      .delete()
      .eq('id', school.id);

    if (schoolError) {
      console.error(`  Warning: ${schoolError.message}`);
    } else {
      console.log(`  Deleted school "${school.name}"`);
    }

    console.log('\n========================================');
    console.log('  Demo Data Cleanup Complete!');
    console.log('========================================\n');

  } catch (error) {
    console.error('\nERROR during cleanup:');
    console.error(error);
    process.exit(1);
  }
}

// Run the cleanup
cleanupDemoData();
