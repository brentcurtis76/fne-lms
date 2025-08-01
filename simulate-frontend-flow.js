#!/usr/bin/env node

const { createClient } = require('@supabase/supabase-js');

// Load environment variables
require('dotenv').config({ path: '.env.local' });

console.log('🔍 SIMULATING FRONTEND FLOW');
console.log('============================');

async function simulateFrontendFlow() {
  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    // Step 1: Simulate getUserAssignedPaths from /api/learning-paths/my-paths
    console.log('📱 Step 1: Simulating /api/learning-paths/my-paths call...');
    
    const supabase = createClient(supabaseUrl, supabaseServiceKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false
      }
    });

    const userId = '4ae17b21-8977-425c-b05a-ca7cdb8b9df5';

    // Simulate the exact logic from getUserAssignedPaths
    console.log('🔄 Getting user communities...');
    
    const { data: userRoles, error: rolesError } = await supabase
      .from('user_roles')
      .select('community_id')
      .eq('user_id', userId)
      .eq('is_active', true)
      .not('community_id', 'is', null);

    if (rolesError) throw rolesError;

    const communityIds = (userRoles || []).map((role) => role.community_id);
    console.log('👥 User communities:', communityIds);

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

    const { data: assignments, error } = await query;
    if (error) throw error;

    // Process like the API does
    const pathMap = new Map();
    (assignments || []).forEach((assignment) => {
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

    const assignedPaths = Array.from(pathMap.values());
    console.log('✅ getUserAssignedPaths result:');
    assignedPaths.forEach((path, index) => {
      console.log(`   ${index + 1}. ${path.name} (ID: "${path.id}")`);
    });

    // Step 2: Simulate getUserPathProgress for each path (this happens in my-paths API)
    console.log('\n📊 Step 2: Simulating getUserPathProgress calls...');
    
    const pathsWithProgress = [];
    
    for (const path of assignedPaths) {
      console.log(`\n🎯 Processing path: ${path.name}`);
      console.log(`   Input ID: "${path.id}" (type: ${typeof path.id})`);
      
      try {
        // Simulate getUserPathProgress logic
        console.log('   🔄 Getting path courses...');
        
        const { data: pathCourses, error: coursesError } = await supabase
          .from('learning_path_courses')
          .select('course_id')
          .eq('learning_path_id', path.id)
          .order('sequence_order');

        if (coursesError) {
          console.error('   ❌ Courses error:', coursesError);
          throw coursesError;
        }

        const courseIds = pathCourses.map((pc) => pc.course_id);
        console.log(`   📚 Found ${courseIds.length} courses`);

        // Get user's enrollment status for these courses
        let enrollments = [];
        if (courseIds.length > 0) {
          const { data: enrollmentData, error: enrollmentsError } = await supabase
            .from('course_enrollments')
            .select('course_id, progress_percentage, completed_at')
            .eq('user_id', userId)
            .in('course_id', courseIds);

          if (enrollmentsError) {
            console.error('   ❌ Enrollments error:', enrollmentsError);
            throw enrollmentsError;
          }
          
          enrollments = enrollmentData || [];
        }

        // Count completed courses
        const completedCourses = enrollments.filter((enrollment) => 
          enrollment.progress_percentage >= 100
        ).length;

        // Calculate progress percentage
        const progressPercentage = courseIds.length > 0 
          ? Math.round((completedCourses / courseIds.length) * 100)
          : 0;

        const progress = {
          path_id: path.id,
          total_courses: courseIds.length,
          completed_courses: completedCourses,
          progress_percentage: progressPercentage,
          last_accessed: null
        };

        console.log(`   ✅ Progress calculated:`, progress);

        const pathWithProgress = {
          ...path,
          progress
        };

        console.log(`   🔍 Final path object ID: "${pathWithProgress.id}" (type: ${typeof pathWithProgress.id})`);
        pathsWithProgress.push(pathWithProgress);

      } catch (progressError) {
        console.error(`   ❌ Progress error:`, progressError.message);
        const pathWithProgress = {
          ...path,
          progress: null
        };
        pathsWithProgress.push(pathWithProgress);
      }
    }

    console.log('\n🎯 Step 3: Final my-paths API response simulation:');
    console.log(JSON.stringify(pathsWithProgress, null, 2));

    // Step 3: Simulate what happens when user clicks on a path
    console.log('\n🖱️  Step 4: Simulating user click on first path...');
    
    if (pathsWithProgress.length > 0) {
      const firstPath = pathsWithProgress[0];
      console.log(`👆 User clicks on: "${firstPath.name}"`);
      console.log(`📝 handlePathClick called with: "${firstPath.id}"`);
      console.log(`🔗 router.push called with: "/my-paths/${firstPath.id}"`);
      console.log(`📍 Final URL would be: /my-paths/${firstPath.id}`);
      
      // Check if this would create undefined
      if (!firstPath.id || firstPath.id === 'undefined') {
        console.log('❌ BUG FOUND: Path ID is undefined or invalid!');
        console.log('🔍 Debugging path object:');
        console.log('   All keys:', Object.keys(firstPath));
        console.log('   ID value:', firstPath.id);
        console.log('   ID type:', typeof firstPath.id);
        console.log('   Original path from DB:', JSON.stringify(assignments[0]?.path, null, 2));
      } else {
        console.log('✅ Path ID looks valid for navigation');
      }
    }

  } catch (error) {
    console.error('❌ Simulation Error:', error);
    console.error('Stack:', error.stack);
  }
}

simulateFrontendFlow();