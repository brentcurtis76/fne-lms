#!/usr/bin/env node

const { createClient } = require('@supabase/supabase-js');

// Load environment variables
require('dotenv').config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

console.log('🔍 CHECKING LEARNING PATH ASSIGNMENTS - FIXED QUERY');
console.log('===================================================');

async function checkAssignments() {
  try {
    // Create service role client to bypass RLS
    const supabase = createClient(supabaseUrl, supabaseServiceKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false
      }
    });
    
    // Check learning path assignments without the ambiguous relationship
    console.log('📚 Checking learning path assignments...');
    const { data: assignments, error: assignmentError } = await supabase
      .from('learning_path_assignments')
      .select(`
        *,
        path:learning_paths(id, name, description)
      `)
      .limit(10);

    if (assignmentError) {
      console.error('❌ Error fetching assignments:', assignmentError);
    } else {
      console.log('✅ Found assignments:');
      console.log(`📊 Total assignments: ${assignments.length}`);
      
      assignments.forEach((assignment, index) => {
        console.log(`${index + 1}. Assignment ID: ${assignment.id}`);
        console.log(`   User ID: ${assignment.user_id}`);
        console.log(`   Group ID: ${assignment.group_id}`);
        console.log(`   Path: ${assignment.path?.name} (ID: ${assignment.path?.id})`);
        console.log(`   Assigned At: ${assignment.assigned_at}`);
        console.log('   ---');
      });
    }

    // Check if specific user has assignments (admin user)
    console.log('\n👤 Checking assignments for admin user (4ae17b21-8977-425c-b05a-ca7cdb8b9df5)...');
    const { data: adminAssignments, error: adminError } = await supabase
      .from('learning_path_assignments')
      .select(`
        *,
        path:learning_paths(*)
      `)
      .eq('user_id', '4ae17b21-8977-425c-b05a-ca7cdb8b9df5');

    if (adminError) {
      console.error('❌ Error fetching admin assignments:', adminError);
    } else {
      console.log('✅ Admin assignments found:', adminAssignments.length);
      adminAssignments.forEach((assignment, index) => {
        console.log(`${index + 1}. Path: ${assignment.path?.name} (ID: ${assignment.path?.id})`);
        console.log(`   Full path object:`, JSON.stringify(assignment.path, null, 2));
      });
    }

    // Test the same query that the API uses
    console.log('\n🔄 Testing API-style query (getUserAssignedPaths simulation)...');
    
    const userId = '4ae17b21-8977-425c-b05a-ca7cdb8b9df5'; // Admin user
    
    // First, get the user's community IDs (groups they belong to)
    const { data: userRoles, error: rolesError } = await supabase
      .from('user_roles')
      .select('community_id')
      .eq('user_id', userId)
      .eq('is_active', true)
      .not('community_id', 'is', null);

    if (rolesError) {
      console.error('❌ Error fetching user roles:', rolesError);
      return;
    }

    console.log('👥 User communities:', userRoles);
    const communityIds = (userRoles || []).map((role) => role.community_id);

    // Build the query for assignments
    let query = supabase
      .from('learning_path_assignments')
      .select(`
        *,
        path:learning_paths(*)
      `);

    // Add filters based on what we have
    if (communityIds.length > 0) {
      // User has communities, get both direct and group assignments
      query = query.or(`user_id.eq.${userId},group_id.in.(${communityIds.join(',')})`);
    } else {
      // User has no communities, only get direct assignments
      query = query.eq('user_id', userId);
    }

    const { data: apiStyleAssignments, error: apiStyleError } = await query;

    if (apiStyleError) {
      console.error('❌ Error with API-style query:', apiStyleError);
    } else {
      console.log('✅ API-style query results:');
      console.log(`📊 Found ${apiStyleAssignments.length} assignments`);
      
      // Process like the API does
      const pathMap = new Map();
      (apiStyleAssignments || []).forEach((assignment) => {
        if (assignment.path && !pathMap.has(assignment.path.id)) {
          pathMap.set(assignment.path.id, {
            id: assignment.path.id, // Explicitly set the ID at top level
            name: assignment.path.name,
            description: assignment.path.description,
            created_at: assignment.path.created_at,
            updated_at: assignment.path.updated_at,
            assigned_at: assignment.assigned_at,
            assignment_id: assignment.id
          });
        }
      });

      const finalPaths = Array.from(pathMap.values());
      console.log('🎯 Final processed paths (as API would return):');
      console.log(JSON.stringify(finalPaths, null, 2));
    }

  } catch (error) {
    console.error('❌ Unexpected Error:', error);
  }
}

checkAssignments();