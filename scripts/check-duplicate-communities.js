#!/usr/bin/env node

/**
 * Script to check for duplicate communities in the database
 * Run this before and after applying the fix to see the difference
 */

const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

async function checkDuplicates() {
  console.log('🔍 Checking for duplicate communities...\n');

  try {
    // Get all communities
    const { data: communities, error } = await supabase
      .from('growth_communities')
      .select('id, name, school_id, generation_id, created_at')
      .order('name, created_at');

    if (error) {
      console.error('❌ Error fetching communities:', error);
      return;
    }

    console.log(`📊 Total communities found: ${communities.length}\n`);

    // Group by name + school + generation to find duplicates
    const groups = {};
    communities.forEach(comm => {
      const key = `${comm.name}::${comm.school_id || 'null'}::${comm.generation_id || 'null'}`;
      if (!groups[key]) {
        groups[key] = [];
      }
      groups[key].push(comm);
    });

    // Find groups with duplicates
    const duplicateGroups = Object.entries(groups)
      .filter(([_, comms]) => comms.length > 1)
      .sort((a, b) => b[1].length - a[1].length); // Sort by number of duplicates

    if (duplicateGroups.length === 0) {
      console.log('✅ No duplicate communities found!\n');
    } else {
      console.log(`⚠️  Found ${duplicateGroups.length} groups of duplicate communities:\n`);
      
      duplicateGroups.forEach(([key, comms], index) => {
        console.log(`${index + 1}. "${comms[0].name}" (${comms.length} duplicates)`);
        console.log(`   School ID: ${comms[0].school_id || 'None'}`);
        console.log(`   Generation ID: ${comms[0].generation_id || 'None'}`);
        console.log('   Community IDs and creation dates:');
        comms.forEach(comm => {
          console.log(`   - ${comm.id} (created: ${new Date(comm.created_at).toLocaleString()})`);
        });
        console.log('');
      });
    }

    // Check for orphaned communities (no active roles)
    console.log('🔍 Checking for orphaned communities...\n');
    
    let orphanedCount = 0;
    const orphanedCommunities = [];
    
    for (const comm of communities) {
      const { data: roles, error: roleError } = await supabase
        .from('user_roles')
        .select('id, role_type, user_id')
        .eq('community_id', comm.id)
        .eq('is_active', true);

      if (!roleError && (!roles || roles.length === 0)) {
        orphanedCount++;
        orphanedCommunities.push(comm);
      }
    }

    if (orphanedCount > 0) {
      console.log(`⚠️  Found ${orphanedCount} orphaned communities (no active roles):\n`);
      orphanedCommunities.slice(0, 10).forEach((comm, index) => {
        console.log(`${index + 1}. ${comm.name} (ID: ${comm.id})`);
      });
      if (orphanedCommunities.length > 10) {
        console.log(`   ... and ${orphanedCommunities.length - 10} more\n`);
      }
    } else {
      console.log('✅ No orphaned communities found!\n');
    }

    // Summary statistics
    console.log('📈 Summary Statistics:');
    console.log(`   - Total communities: ${communities.length}`);
    console.log(`   - Unique communities: ${Object.keys(groups).length}`);
    console.log(`   - Duplicate groups: ${duplicateGroups.length}`);
    console.log(`   - Total duplicates: ${communities.length - Object.keys(groups).length}`);
    console.log(`   - Orphaned communities: ${orphanedCount}`);
    console.log(`   - Auto-created communities: ${communities.filter(c => c.name.startsWith('Comunidad de ')).length}`);
    console.log(`   - Manual communities: ${communities.filter(c => !c.name.startsWith('Comunidad de ')).length}`);

  } catch (error) {
    console.error('❌ Unexpected error:', error);
  }
}

// Run the check
checkDuplicates();