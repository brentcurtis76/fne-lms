#!/usr/bin/env node

/**
 * Merge Duplicate Groups Script
 *
 * Phase 0.5: Cleanup duplicate groups before applying UNIQUE constraint
 *
 * This script merges duplicate groups found by check-duplicate-group-assignments.js
 * by keeping the oldest group and moving all members/submissions to it.
 *
 * Usage:
 *   node scripts/merge-duplicate-groups.js [--dry-run] [--batch-size=100]
 *
 * Flags:
 *   --dry-run         Preview changes without committing
 *   --batch-size=<n>  Batch size for processing (default: 100)
 *
 * Requirements:
 *   - NEXT_PUBLIC_SUPABASE_URL in .env.local
 *   - SUPABASE_SERVICE_ROLE_KEY in .env.local
 *
 * Exit Codes:
 *   0 = Success (all duplicates merged)
 *   1 = Errors encountered
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
      console.error('Usage: node scripts/merge-duplicate-groups.js [--dry-run] [--batch-size=100]');
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
 * Get all duplicate group sets (same logic as check script)
 */
async function getDuplicateSets(supabase) {
  const { data: allGroups, error } = await supabase
    .from('group_assignment_groups')
    .select('id, assignment_id, community_id, name, created_at, is_consultant_managed')
    .order('created_at', { ascending: true });

  if (error) {
    throw new Error(`Failed to fetch groups: ${error.message}`);
  }

  // Build map of (assignment_id, community_id) -> groups[]
  const groupMap = new Map();

  for (const group of allGroups) {
    const key = `${group.assignment_id}:${group.community_id}`;
    if (!groupMap.has(key)) {
      groupMap.set(key, []);
    }
    groupMap.get(key).push(group);
  }

  // Find all keys with multiple groups
  const duplicateSets = [];
  for (const [key, groups] of groupMap.entries()) {
    if (groups.length > 1) {
      const [assignmentId, communityId] = key.split(':');
      duplicateSets.push({
        assignmentId,
        communityId,
        groups  // Already sorted by created_at ASC
      });
    }
  }

  return duplicateSets;
}

/**
 * Analyze a group to count members and submissions
 */
async function analyzeGroup(supabase, groupId) {
  const [membersResult, submissionsResult] = await Promise.all([
    supabase
      .from('group_assignment_members')
      .select('id', { count: 'exact', head: true })
      .eq('group_id', groupId),
    supabase
      .from('group_assignment_submissions')
      .select('id', { count: 'exact', head: true })
      .eq('group_id', groupId)
  ]);

  return {
    members: membersResult.count || 0,
    submissions: submissionsResult.count || 0
  };
}

/**
 * Merge a duplicate group into the kept group
 */
async function mergeGroup(supabase, { keepId, duplicateId, dryRun, stats }) {
  // Analyze duplicate group before merge
  const analysis = await analyzeGroup(supabase, duplicateId);

  if (dryRun) {
    console.log(`   ├─ [DRY-RUN] Would merge: ${duplicateId} (${analysis.members} members, ${analysis.submissions} submissions)`);
    stats.membersMoved += analysis.members;
    stats.submissionsMoved += analysis.submissions;
    stats.groupsDeleted += 1;
    return;
  }

  // Move members
  if (analysis.members > 0) {
    const { error: membersError } = await supabase
      .from('group_assignment_members')
      .update({ group_id: keepId })
      .eq('group_id', duplicateId);

    if (membersError) {
      throw new Error(`Failed to move members: ${membersError.message}`);
    }
  }

  // Move submissions
  if (analysis.submissions > 0) {
    const { error: submissionsError } = await supabase
      .from('group_assignment_submissions')
      .update({ group_id: keepId })
      .eq('group_id', duplicateId);

    if (submissionsError) {
      throw new Error(`Failed to move submissions: ${submissionsError.message}`);
    }
  }

  // Delete duplicate group
  const { error: deleteError } = await supabase
    .from('group_assignment_groups')
    .delete()
    .eq('id', duplicateId);

  if (deleteError) {
    throw new Error(`Failed to delete group: ${deleteError.message}`);
  }

  console.log(`   ├─ Merged: ${duplicateId} (${analysis.members} members, ${analysis.submissions} submissions)`);

  stats.membersMoved += analysis.members;
  stats.submissionsMoved += analysis.submissions;
  stats.groupsDeleted += 1;
}

/**
 * Validate merge results
 */
async function validateMerge(supabase, { keepId, duplicateIds, expectedMembers, expectedSubmissions }) {
  const analysis = await analyzeGroup(supabase, keepId);

  if (analysis.members !== expectedMembers) {
    console.error(`   ⚠️  Warning: Expected ${expectedMembers} members, found ${analysis.members}`);
  }

  if (analysis.submissions !== expectedSubmissions) {
    console.error(`   ⚠️  Warning: Expected ${expectedSubmissions} submissions, found ${analysis.submissions}`);
  }

  // Verify duplicates are deleted
  for (const duplicateId of duplicateIds) {
    const { data, error } = await supabase
      .from('group_assignment_groups')
      .select('id')
      .eq('id', duplicateId)
      .maybeSingle();

    if (data) {
      console.error(`   ⚠️  Warning: Duplicate group ${duplicateId} still exists`);
    }
  }
}

// ============================================================================
// Main Merge Function
// ============================================================================

async function mergeDuplicateGroups(config) {
  const { supabaseUrl, supabaseServiceKey } = validateEnvironment();
  const { dryRun } = config;

  // Initialize Supabase with service role (bypasses RLS)
  const supabase = createClient(supabaseUrl, supabaseServiceKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  });

  console.log('🔧 Starting duplicate groups merge...');
  console.log(`Mode: ${dryRun ? '🔍 DRY-RUN' : '⚡ LIVE'}`);
  console.log('');

  // Statistics
  const stats = {
    totalSets: 0,
    setsProcessed: 0,
    groupsDeleted: 0,
    membersMoved: 0,
    submissionsMoved: 0,
    setsSkipped: 0,
    errors: 0
  };

  try {
    // Step 1: Get all duplicate sets
    console.log('📊 Finding duplicate groups...');
    const duplicateSets = await getDuplicateSets(supabase);

    if (duplicateSets.length === 0) {
      console.log('✅ No duplicates found. Database is clean!');
      process.exit(0);
    }

    stats.totalSets = duplicateSets.length;
    console.log(`Found ${duplicateSets.length} duplicate set(s) to merge`);
    console.log('');

    // Step 2: Process each duplicate set
    for (let i = 0; i < duplicateSets.length; i++) {
      const set = duplicateSets[i];
      const { assignmentId, communityId, groups } = set;

      console.log(`[${i + 1}/${duplicateSets.length}] Assignment: ${assignmentId.substring(0, 20)}...`);
      console.log(`   Community: ${communityId.substring(0, 20)}...`);

      try {
        // Check if any group is consultant-managed
        const hasConsultantManaged = groups.some(g => g.is_consultant_managed);
        if (hasConsultantManaged) {
          console.log(`   ⚠️  Skipping: Contains consultant-managed group(s)`);
          stats.setsSkipped += 1;
          console.log('');
          continue;
        }

        // Keep first group (oldest)
        const keepGroup = groups[0];
        const duplicateGroups = groups.slice(1);

        console.log(`   ✓ Keeping group: ${keepGroup.id} (created ${new Date(keepGroup.created_at).toLocaleString()})`);

        // Analyze kept group before merge
        const keepAnalysis = await analyzeGroup(supabase, keepGroup.id);
        let expectedMembers = keepAnalysis.members;
        let expectedSubmissions = keepAnalysis.submissions;

        // Merge each duplicate
        for (const duplicate of duplicateGroups) {
          const dupAnalysis = await analyzeGroup(supabase, duplicate.id);
          expectedMembers += dupAnalysis.members;
          expectedSubmissions += dupAnalysis.submissions;

          await mergeGroup(supabase, {
            keepId: keepGroup.id,
            duplicateId: duplicate.id,
            dryRun,
            stats
          });
        }

        // Validate merge (only in live mode)
        if (!dryRun) {
          await validateMerge(supabase, {
            keepId: keepGroup.id,
            duplicateIds: duplicateGroups.map(g => g.id),
            expectedMembers,
            expectedSubmissions
          });
        }

        console.log(`   Summary: ${dryRun ? 'Would merge' : 'Merged'} ${duplicateGroups.length} duplicate group(s)`);
        stats.setsProcessed += 1;

      } catch (error) {
        console.error(`   ❌ Error merging set: ${error.message}`);
        stats.errors += 1;
      }

      console.log('');
    }

    // Step 3: Print final summary
    console.log('═══════════════════════════════════════════════════════════');
    console.log(`${stats.errors > 0 ? '⚠️' : '✅'} MERGE ${dryRun ? 'PREVIEW' : 'COMPLETE'}`);
    console.log('═══════════════════════════════════════════════════════════');
    console.log('');
    console.log('Statistics:');
    console.log(`  Total duplicate sets:    ${stats.totalSets}`);
    console.log(`  Sets processed:          ${stats.setsProcessed}`);
    console.log(`  Sets skipped:            ${stats.setsSkipped}`);
    console.log(`  Groups deleted:          ${stats.groupsDeleted}`);
    console.log(`  Members moved:           ${stats.membersMoved}`);
    console.log(`  Submissions moved:       ${stats.submissionsMoved}`);
    console.log(`  Errors:                  ${stats.errors}`);
    console.log('');

    if (dryRun) {
      console.log('💡 This was a dry-run. To apply changes, run without --dry-run flag.');
      console.log('');
    } else {
      console.log('✅ All changes have been committed to the database.');
      console.log('');
      console.log('Next steps:');
      console.log('1. Verify: node scripts/check-duplicate-group-assignments.js');
      console.log('2. Apply migration: database/migrations/028_add_group_unique_constraint.sql');
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
mergeDuplicateGroups(config);
