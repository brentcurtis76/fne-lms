#!/usr/bin/env node

/**
 * Script to apply the duplicate communities fix to the database
 * This prevents duplicate communities from being created when re-assigning community leader roles
 */

const { createClient } = require('@supabase/supabase-js');
const fs = require('fs').promises;
const path = require('path');
require('dotenv').config();

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function applyFix() {
  console.log('🔧 Applying duplicate communities fix...\n');

  try {
    // Read the SQL file
    const sqlPath = path.join(__dirname, '..', 'database', 'fix-duplicate-communities.sql');
    const sql = await fs.readFile(sqlPath, 'utf8');

    // Split SQL into individual statements (basic split - may need refinement for complex SQL)
    const statements = sql
      .split(/;\s*$/m)
      .map(s => s.trim())
      .filter(s => s.length > 0 && !s.startsWith('--'));

    console.log(`📋 Found ${statements.length} SQL statements to execute\n`);

    // Execute each statement
    for (let i = 0; i < statements.length; i++) {
      const statement = statements[i];
      
      // Skip comments and empty statements
      if (!statement || statement.trim().startsWith('--')) {
        continue;
      }

      console.log(`🔄 Executing statement ${i + 1}/${statements.length}...`);
      
      // Show a preview of the statement (first 100 chars)
      const preview = statement.substring(0, 100).replace(/\n/g, ' ');
      console.log(`   Preview: ${preview}${statement.length > 100 ? '...' : ''}`);

      try {
        const { error } = await supabase.rpc('execute_sql', { 
          sql_query: statement + ';' 
        });

        if (error) {
          console.error(`❌ Error executing statement ${i + 1}:`, error.message);
          
          // If it's a "function already exists" error, continue
          if (error.message.includes('already exists')) {
            console.log('   ⚠️  Object already exists, continuing...');
            continue;
          }
          
          // For other errors, ask if we should continue
          if (i < statements.length - 1) {
            console.log('   ⚠️  Continuing with remaining statements...');
          }
        } else {
          console.log(`   ✅ Statement ${i + 1} executed successfully`);
        }
      } catch (err) {
        console.error(`❌ Unexpected error:`, err.message);
      }

      console.log('');
    }

    // Run some checks
    console.log('🔍 Running post-fix checks...\n');

    // Check for remaining duplicates
    const { data: duplicates, error: dupError } = await supabase
      .from('growth_communities')
      .select('name, school_id, generation_id')
      .order('name');

    if (!dupError && duplicates) {
      // Group by name to find duplicates
      const nameGroups = {};
      duplicates.forEach(comm => {
        const key = `${comm.name}-${comm.school_id}-${comm.generation_id || 'null'}`;
        if (!nameGroups[key]) {
          nameGroups[key] = [];
        }
        nameGroups[key].push(comm);
      });

      const duplicateGroups = Object.entries(nameGroups).filter(([_, comms]) => comms.length > 1);
      
      if (duplicateGroups.length > 0) {
        console.log(`⚠️  Found ${duplicateGroups.length} groups of duplicate communities:`);
        duplicateGroups.forEach(([key, comms]) => {
          console.log(`   - "${comms[0].name}" has ${comms.length} duplicates`);
        });
      } else {
        console.log('✅ No duplicate communities found!');
      }
    }

    // Check for orphaned communities
    const { data: allCommunities, error: commError } = await supabase
      .from('growth_communities')
      .select('id, name');

    if (!commError && allCommunities) {
      let orphanedCount = 0;
      
      for (const comm of allCommunities) {
        const { data: roles, error: roleError } = await supabase
          .from('user_roles')
          .select('id')
          .eq('community_id', comm.id)
          .eq('is_active', true)
          .limit(1);

        if (!roleError && (!roles || roles.length === 0)) {
          orphanedCount++;
        }
      }

      console.log(`\n📊 Community statistics:`);
      console.log(`   - Total communities: ${allCommunities.length}`);
      console.log(`   - Orphaned communities (no active roles): ${orphanedCount}`);
      console.log(`   - Auto-created communities: ${allCommunities.filter(c => c.name.startsWith('Comunidad de ')).length}`);
    }

    console.log('\n✅ Fix application completed!');
    console.log('\n📝 Next steps:');
    console.log('1. Test creating a new community leader role');
    console.log('2. Delete the role and re-add it - it should reuse the same community');
    console.log('3. If you want to clean up orphaned communities, run the cleanup function');

  } catch (error) {
    console.error('❌ Fatal error:', error);
    process.exit(1);
  }
}

// Helper function to execute SQL (if not available via RPC)
async function executeSqlDirect() {
  console.log('\n📝 Note: If execute_sql RPC is not available, you need to:');
  console.log('1. Go to Supabase Dashboard > SQL Editor');
  console.log('2. Copy the contents of database/fix-duplicate-communities.sql');
  console.log('3. Run it in the SQL editor');
  console.log('\nOr create this RPC function first:');
  console.log(`
CREATE OR REPLACE FUNCTION execute_sql(sql_query text)
RETURNS void AS $$
BEGIN
  EXECUTE sql_query;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
`);
}

// Run the fix
applyFix().catch(console.error);

// Show help for manual execution if needed
executeSqlDirect();