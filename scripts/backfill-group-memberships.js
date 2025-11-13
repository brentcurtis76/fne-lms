#!/usr/bin/env node

/**
 * Backfill Group Memberships Script
 *
 * Phase 1: Retroactive Backfill for Group Assignments
 *
 * This script ensures that all group assignments have properly provisioned:
 * 1. Exactly one group per (assignment_id, community_id) pair
 * 2. All enrolled students as members (unless consultant-managed)
 *
 * Usage:
 *   node scripts/backfill-group-memberships.js [--dry-run] [--batch-size=100]
 *
 * Flags:
 *   --dry-run         Preview changes without committing
 *   --batch-size=<n>  Number of members to insert per batch (default: 100)
 *
 * Requirements:
 *   - NEXT_PUBLIC_SUPABASE_URL in .env.local
 *   - SUPABASE_SERVICE_ROLE_KEY in .env.local
 *
 * Exit Codes:
 *   0 = Success
 *   1 = Fatal error
 *   2 = Validation error (missing env vars)
 */

require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');

// ============================================================================
// CLI Argument Parsing
// ============================================================================

function parseArgs() {
  const args = process.argv.slice(2);
  const config = {
    dryRun: false,
    batchSize: 100
  };

  for (const arg of args) {
    if (arg === '--dry-run') {
      config.dryRun = true;
    } else if (arg.startsWith('--batch-size=')) {
      const size = parseInt(arg.split('=')[1], 10);
      if (isNaN(size) || size < 1) {
        console.error('❌ Invalid batch size. Must be a positive integer.');
        process.exit(2);
      }
      config.batchSize = size;
    } else {
      console.error(`❌ Unknown argument: ${arg}`);
      console.error('Usage: node scripts/backfill-group-memberships.js [--dry-run] [--batch-size=100]');
      process.exit(2);
    }
  }

  return config;
}

// ============================================================================
// Environment Validation
// ============================================================================

function validateEnvironment() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseServiceKey) {
    console.error('❌ Missing required environment variables:');
    console.error('   NEXT_PUBLIC_SUPABASE_URL:', supabaseUrl ? '✓' : '✗');
    console.error('   SUPABASE_SERVICE_ROLE_KEY:', supabaseServiceKey ? '✓' : '✗');
    console.error('');
    console.error('Please ensure .env.local contains both variables.');
    process.exit(2);
  }

  return { supabaseUrl, supabaseServiceKey };
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Check if assignment is consultant-managed
 */
async function isConsultantManaged(supabase, assignmentId) {
  const { data, error } = await supabase
    .from('group_assignment_settings')
    .select('consultant_managed')
    .eq('assignment_id', assignmentId)
    .maybeSingle();

  if (error) {
    console.error(`   ⚠️  Error fetching settings: ${error.message}`);
    return false; // Default to auto-managed
  }

  return data?.consultant_managed || false;
}

/**
 * Ensure exactly one group exists for (assignment_id, community_id)
 * Returns group ID or null on error/duplicates (per spec: do NOT modify duplicates)
 */
async function ensureGroup(supabase, { assignmentId, communityId, isConsultantManaged, dryRun }) {
  // Check for existing groups
  const { data: existingGroups, error: fetchError } = await supabase
    .from('group_assignment_groups')
    .select('id, name, created_at')
    .eq('assignment_id', assignmentId)
    .eq('community_id', communityId)
    .order('created_at', { ascending: true });

  if (fetchError) {
    console.error(`   ❌ Error fetching groups: ${fetchError.message}`);
    return null;
  }

  // Handle duplicates - DO NOT MODIFY (per design doc)
  if (existingGroups && existingGroups.length > 1) {
    console.error(`   ❌ Found ${existingGroups.length} duplicate groups - SKIPPING (manual cleanup required)`);
    console.error(`   │  Group IDs: ${existingGroups.map(g => g.id).join(', ')}`);
    return null; // Force manual cleanup before provisioning
  }

  // Group exists
  if (existingGroups && existingGroups.length === 1) {
    return existingGroups[0].id;
  }

  // Create new group
  if (dryRun) {
    console.log(`   📝 [DRY-RUN] Would create group`);
    return 'dry-run-group-id'; // Placeholder for dry-run
  }

  const { data: newGroup, error: insertError } = await supabase
    .from('group_assignment_groups')
    .insert({
      assignment_id: assignmentId,
      community_id: communityId,
      name: `Grupo ${communityId.substring(0, 8)}-${Date.now()}`,
      is_consultant_managed: isConsultantManaged
    })
    .select('id')
    .single();

  if (insertError) {
    console.error(`   ❌ Error creating group: ${insertError.message}`);
    return null;
  }

  console.log(`   ✅ Created group: ${newGroup.id}`);
  return newGroup.id;
}

/**
 * Get all enrolled students in a course for a specific community
 */
async function getCommunityStudents(supabase, courseId, communityId) {
  // Step 1: Get all enrolled user IDs for this course
  const { data: enrollments, error: enrollError } = await supabase
    .from('course_enrollments')
    .select('user_id')
    .eq('course_id', courseId)
    .eq('status', 'active');

  if (enrollError) {
    console.error(`   ❌ Error fetching enrollments: ${enrollError.message}`);
    return [];
  }

  if (!enrollments || enrollments.length === 0) {
    return [];
  }

  const enrolledUserIds = enrollments.map(e => e.user_id);

  // Step 2: Filter by community membership
  const { data: userRoles, error: rolesError } = await supabase
    .from('user_roles')
    .select('user_id')
    .in('user_id', enrolledUserIds)
    .eq('community_id', communityId)
    .eq('is_active', true);

  if (rolesError) {
    console.error(`   ❌ Error fetching community members: ${rolesError.message}`);
    return [];
  }

  // Extract unique user IDs
  const userIds = [...new Set(userRoles.map(r => r.user_id))];
  return userIds;
}

/**
 * Get distinct communities with enrollments for a course
 */
async function getCourseCommunities(supabase, courseId) {
  // Step 1: Get all enrolled user IDs for this course
  const { data: enrollments, error: enrollError } = await supabase
    .from('course_enrollments')
    .select('user_id')
    .eq('course_id', courseId)
    .eq('status', 'active');

  if (enrollError) {
    console.error(`   ❌ Error fetching enrollments: ${enrollError.message}`);
    return [];
  }

  if (!enrollments || enrollments.length === 0) {
    return [];
  }

  const userIds = enrollments.map(e => e.user_id);

  // Step 2: Get community IDs for these users
  const { data: userRoles, error: rolesError } = await supabase
    .from('user_roles')
    .select('community_id')
    .in('user_id', userIds)
    .eq('is_active', true)
    .not('community_id', 'is', null);

  if (rolesError) {
    console.error(`   ❌ Error fetching user roles: ${rolesError.message}`);
    return [];
  }

  // Extract unique community IDs
  const communityIds = [...new Set(userRoles.map(r => r.community_id).filter(Boolean))];
  return communityIds;
}

/**
 * Batch insert members with ON CONFLICT DO NOTHING
 * Uses ignoreDuplicates to ensure idempotency (re-runs don't modify existing members)
 */
async function insertMembers(supabase, { assignmentId, groupId, userIds, communityId, batchSize, dryRun }) {
  const members = userIds.map(userId => ({
    assignment_id: assignmentId,
    group_id: groupId,
    user_id: userId,
    community_id: communityId,
    role: 'member',
    joined_at: new Date().toISOString()
  }));

  let totalAdded = 0;

  for (let i = 0; i < members.length; i += batchSize) {
    const batch = members.slice(i, i + batchSize);

    if (dryRun) {
      console.log(`   └─ [DRY-RUN] Would add ${batch.length} members (batch ${Math.floor(i / batchSize) + 1})`);
      totalAdded += batch.length;
    } else {
      // Use upsert with ignoreDuplicates: true for ON CONFLICT DO NOTHING behavior
      const { error } = await supabase
        .from('group_assignment_members')
        .upsert(batch, {
          onConflict: 'assignment_id,user_id',
          ignoreDuplicates: true  // DO NOTHING on conflict (idempotent)
        });

      if (error) {
        console.error(`   ❌ Error inserting batch: ${error.message}`);
        continue;
      }

      console.log(`   └─ Added ${batch.length} members (batch ${Math.floor(i / batchSize) + 1})`);
      totalAdded += batch.length;
    }
  }

  return totalAdded;
}

// ============================================================================
// Main Backfill Function
// ============================================================================

async function backfillGroupMemberships(config) {
  const { supabaseUrl, supabaseServiceKey } = validateEnvironment();
  const { dryRun, batchSize } = config;

  // Initialize Supabase with service role (bypasses RLS)
  const supabase = createClient(supabaseUrl, supabaseServiceKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  });

  console.log('🚀 Starting backfill...');
  console.log(`Mode: ${dryRun ? '🔍 DRY-RUN' : '⚡ LIVE'}`);
  console.log(`Batch size: ${batchSize}`);
  console.log('');

  // Statistics
  const stats = {
    totalAssignments: 0,
    groupsEnsured: 0,
    membersAdded: 0,
    duplicatesFound: 0,
    consultantManaged: 0,
    errors: 0
  };

  try {
    // Step 1: Fetch all group assignments
    const { data: assignments, error: assignmentsError } = await supabase
      .from('blocks')
      .select('id, lesson_id, payload')
      .eq('type', 'group-assignment');

    if (assignmentsError) {
      console.error('❌ Fatal error fetching assignments:', assignmentsError.message);
      process.exit(1);
    }

    if (!assignments || assignments.length === 0) {
      console.log('ℹ️  No group assignments found in database.');
      process.exit(0);
    }

    stats.totalAssignments = assignments.length;
    console.log(`📊 Found ${assignments.length} group assignment(s)\n`);

    // Step 2: Process each assignment
    for (let i = 0; i < assignments.length; i++) {
      const assignment = assignments[i];
      const assignmentTitle = assignment.payload?.title || assignment.id;

      console.log(`[${i + 1}/${assignments.length}] Assignment: ${assignment.id}`);
      console.log(`   Title: ${assignmentTitle}`);

      // Step 2a: Resolve lesson → course
      const { data: lesson, error: lessonError } = await supabase
        .from('lessons')
        .select('id, course_id, title')
        .eq('id', assignment.lesson_id)
        .maybeSingle();

      if (lessonError || !lesson) {
        console.error(`   ❌ Lesson not found: ${assignment.lesson_id}`);
        stats.errors++;
        console.log('');
        continue;
      }

      console.log(`   Course: ${lesson.course_id}`);

      // Step 2b: Check if consultant-managed
      const consultantManaged = await isConsultantManaged(supabase, assignment.id);
      if (consultantManaged) {
        console.log(`   ⚠️  Consultant-managed (will skip member provisioning)`);
        stats.consultantManaged++;
      }

      // Step 2c: Get distinct communities with enrollments
      const communityIds = await getCourseCommunities(supabase, lesson.course_id);

      if (communityIds.length === 0) {
        console.log(`   ℹ️  No enrollments found for this course`);
        console.log('');
        continue;
      }

      console.log(`   Communities: ${communityIds.length}`);

      // Step 2d: Process each community
      for (const communityId of communityIds) {
        console.log(`   ├─ Community: ${communityId.substring(0, 8)}...`);

        // Ensure group exists
        const groupId = await ensureGroup(supabase, {
          assignmentId: assignment.id,
          communityId,
          isConsultantManaged: consultantManaged,
          dryRun
        });

        if (!groupId) {
          console.log(`   │  └─ ❌ Failed to ensure group`);
          stats.errors++;
          continue;
        }

        stats.groupsEnsured++;

        // Skip member provisioning for consultant-managed
        if (consultantManaged) {
          console.log(`   │  └─ ⏭️  Skipping member provisioning (consultant-managed)`);
          continue;
        }

        // Get enrolled students in this community
        const userIds = await getCommunityStudents(supabase, lesson.course_id, communityId);

        if (userIds.length === 0) {
          console.log(`   │  └─ ℹ️  No students found in this community`);
          continue;
        }

        console.log(`   │  └─ Students: ${userIds.length}`);

        // Batch insert members
        const membersAdded = await insertMembers(supabase, {
          assignmentId: assignment.id,
          groupId,
          userIds,
          communityId,
          batchSize,
          dryRun
        });

        stats.membersAdded += membersAdded;
      }

      console.log('');
    }

    // Step 3: Print summary
    console.log('═══════════════════════════════════════════════════════════');
    console.log(`✅ BACKFILL ${dryRun ? 'PREVIEW' : 'COMPLETE'}`);
    console.log('═══════════════════════════════════════════════════════════');
    console.log('');
    console.log('Statistics:');
    console.log(`  Total assignments:       ${stats.totalAssignments}`);
    console.log(`  Groups ensured:          ${stats.groupsEnsured}`);
    console.log(`  Members added:           ${stats.membersAdded}`);
    console.log(`  Consultant-managed:      ${stats.consultantManaged}`);
    console.log(`  Errors encountered:      ${stats.errors}`);
    console.log('');

    if (dryRun) {
      console.log('💡 This was a dry-run. To apply changes, run without --dry-run flag.');
      console.log('');
    } else {
      console.log('✅ All changes have been committed to the database.');
      console.log('');
    }

    process.exit(stats.errors > 0 ? 1 : 0);

  } catch (error) {
    console.error('');
    console.error('═══════════════════════════════════════════════════════════');
    console.error('❌ FATAL ERROR');
    console.error('═══════════════════════════════════════════════════════════');
    console.error('');
    console.error('Error:', error.message);
    console.error('Stack:', error.stack);
    process.exit(1);
  }
}

// ============================================================================
// Entry Point
// ============================================================================

const config = parseArgs();
backfillGroupMemberships(config);
