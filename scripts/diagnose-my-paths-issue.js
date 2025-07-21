import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
    console.error('Missing Supabase environment variables');
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey, {
    auth: {
        autoRefreshToken: false,
        persistSession: false
    }
});

async function diagnoseLearningPathsIssue() {
    console.log('🔍 Diagnosing Learning Paths Issue...\n');

    // 1. Check if we have test data from E2E tests
    console.log('1. Checking for existing learning paths and assignments...');
    
    const { data: allPaths, error: pathsError } = await supabase
        .from('learning_paths')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(5);
    
    if (pathsError) {
        console.error('❌ Error fetching learning paths:', pathsError);
        return;
    }
    
    console.log(`✅ Found ${allPaths.length} learning paths:`);
    allPaths.forEach((path, index) => {
        console.log(`   ${index + 1}. ${path.name} (ID: ${path.id})`);
        console.log(`      Created by: ${path.created_by}`);
        console.log(`      Created at: ${path.created_at}`);
    });

    if (allPaths.length === 0) {
        console.log('❌ No learning paths found. This could be the issue.');
        return;
    }

    // 2. Check assignments
    console.log('\n2. Checking learning path assignments...');
    const { data: assignments, error: assignmentsError } = await supabase
        .from('learning_path_assignments')
        .select(`
            *,
            path:learning_paths!inner(name),
            user:profiles!learning_path_assignments_user_id_fkey(email, first_name, last_name)
        `)
        .limit(10);

    if (assignmentsError) {
        console.error('❌ Error fetching assignments:', assignmentsError);
        return;
    }

    console.log(`✅ Found ${assignments.length} assignments:`);
    assignments.forEach((assignment, index) => {
        console.log(`   ${index + 1}. Path: "${assignment.path?.name}"`);
        console.log(`      Assigned to: ${assignment.user?.email || assignment.user_id}`);
        console.log(`      Assignment ID: ${assignment.id}`);
        console.log(`      User ID: ${assignment.user_id}`);
    });

    if (assignments.length === 0) {
        console.log('❌ No assignments found. This could be the issue.');
        return;
    }

    // 3. Test getUserAssignedPaths logic
    console.log('\n3. Testing getUserAssignedPaths logic for sample users...');
    
    // Get unique user IDs from assignments
    const userIds = [...new Set(assignments.map(a => a.user_id))];
    
    for (const userId of userIds) {
        console.log(`\n   Testing for user: ${userId}`);
        
        try {
            // Replicate the getUserAssignedPaths logic
            const { data: userRoles, error: rolesError } = await supabase
                .from('user_roles')
                .select('community_id')
                .eq('user_id', userId)
                .eq('is_active', true)
                .not('community_id', 'is', null);

            if (rolesError) {
                console.log(`      ❌ Error fetching user roles:`, rolesError);
                continue;
            }

            const communityIds = (userRoles || []).map((role) => role.community_id);
            console.log(`      Community IDs: [${communityIds.join(', ') || 'none'}]`);

            // Build the query for assignments
            let query = supabase
                .from('learning_path_assignments')
                .select(`
                    *,
                    path:learning_paths(*)
                `);

            // Add filters based on what we have
            if (communityIds.length > 0) {
                query = query.or(`user_id.eq.${userId},group_id.in.(${communityIds.join(',')})`);
            } else {
                query = query.eq('user_id', userId);
            }

            const { data: userAssignments, error: assignmentsError } = await query;

            if (assignmentsError) {
                console.log(`      ❌ Error fetching user assignments:`, assignmentsError);
                continue;
            }

            console.log(`      ✅ Found ${userAssignments.length} assignments for this user`);
            userAssignments.forEach((assignment, idx) => {
                console.log(`         ${idx + 1}. ${assignment.path?.name || 'Unknown Path'}`);
                console.log(`            Description: ${assignment.path?.description || 'No description'}`);
            });

            if (userAssignments.length === 0) {
                console.log(`      ❌ No assignments returned for user ${userId}`);
                
                // Debug: Check if assignments exist but query is wrong
                const { data: directCheck } = await supabase
                    .from('learning_path_assignments')
                    .select('*')
                    .eq('user_id', userId);
                
                if (directCheck && directCheck.length > 0) {
                    console.log(`      🔍 DEBUG: Found ${directCheck.length} assignments with direct query`);
                    console.log(`         This suggests the OR query logic might be wrong.`);
                }
            }

        } catch (error) {
            console.log(`      ❌ Exception testing user ${userId}:`, error.message);
        }
    }

    // 4. Check RLS policies
    console.log('\n4. Checking RLS status on relevant tables...');
    
    const tables = ['learning_paths', 'learning_path_assignments', 'learning_path_courses'];
    
    for (const table of tables) {
        try {
            // Try to read from table with service role
            const { data, error } = await supabase
                .from(table)
                .select('*')
                .limit(1);
            
            if (error) {
                console.log(`   ❌ ${table}: ${error.message}`);
            } else {
                console.log(`   ✅ ${table}: Readable with service role (${data.length} records checked)`);
            }
        } catch (e) {
            console.log(`   ❌ ${table}: Exception - ${e.message}`);
        }
    }

    // 5. Test the specific Supabase query that would fail
    console.log('\n5. Testing typical authenticated user query (simulated)...');
    
    // Create a test client that simulates an authenticated user
    const testUserId = userIds[0]; // Use first user ID we found
    
    if (testUserId) {
        console.log(`   Using test user ID: ${testUserId}`);
        
        // This simulates what would happen with auth.uid() in RLS
        try {
            // Direct assignments query
            const { data: directAssignments, error } = await supabase
                .from('learning_path_assignments')
                .select(`
                    *,
                    path:learning_paths(*)
                `)
                .eq('user_id', testUserId);

            if (error) {
                console.log(`   ❌ Direct assignment query failed: ${error.message}`);
            } else {
                console.log(`   ✅ Direct assignment query succeeded: ${directAssignments.length} results`);
            }

        } catch (e) {
            console.log(`   ❌ Query exception: ${e.message}`);
        }
    }

    console.log('\n📊 Summary:');
    console.log(`   - Learning Paths: ${allPaths.length}`);
    console.log(`   - Assignments: ${assignments.length}`);
    console.log(`   - Users with assignments: ${userIds.length}`);
}

diagnoseLearningPathsIssue().catch(console.error);