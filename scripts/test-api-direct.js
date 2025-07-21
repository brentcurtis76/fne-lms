import { createClient } from '@supabase/supabase-js';
import fetch from 'node-fetch';

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

async function testAPIDirectly() {
    console.log('🔍 Testing Learning Paths API Directly...\n');

    // 1. Create test user and data (same as E2E test)
    const testEmail = `test.api.${Date.now()}@example.com`;
    const testPassword = 'TestPassword123!';

    console.log('1. Creating test user and data...');
    const { data: authUser, error: authError } = await supabase.auth.admin.createUser({
        email: testEmail,
        password: testPassword,
        email_confirm: true
    });

    if (authError) {
        console.error('❌ Failed to create auth user:', authError);
        return;
    }

    console.log('✅ Test user created:', authUser.user.id);

    try {
        // Create all the required data
        await supabase.from('profiles').insert({
            id: authUser.user.id,
            email: testEmail,
            name: 'API Test User',
            first_name: 'API',
            last_name: 'Test',
            approval_status: 'approved',
            must_change_password: false
        });

        const { data: school } = await supabase.from('schools').select('id').limit(1).single();
        if (school) {
            await supabase.from('user_roles').insert({
                user_id: authUser.user.id,
                role_type: 'docente',
                is_active: true,
                school_id: school.id
            });
        }

        // Create instructor
        const { data: instructor } = await supabase.from('instructors').insert({
            full_name: 'Test Instructor'
        }).select().single();

        // Create course
        const { data: course } = await supabase.from('courses').insert({
            title: 'API Test Course',
            description: 'Test course for API',
            instructor_id: instructor.id,
            category: 'programming',
            duration_hours: 10,
            difficulty_level: 'beginner',
            created_by: authUser.user.id,
            is_published: true
        }).select().single();

        // Create learning path
        const { data: learningPath } = await supabase.from('learning_paths').insert({
            name: 'API Test Learning Path',
            description: 'Test learning path for API',
            created_by: authUser.user.id
        }).select().single();

        // Link course to path
        await supabase.from('learning_path_courses').insert({
            learning_path_id: learningPath.id,
            course_id: course.id,
            sequence_order: 1
        });

        // Assign path to user
        await supabase.from('learning_path_assignments').insert({
            path_id: learningPath.id,
            user_id: authUser.user.id,
            assigned_by: authUser.user.id
        });

        console.log('✅ All test data created successfully');

        // 2. Now test the API endpoint with different authentication methods
        console.log('\n2. Testing API endpoint with service role...');

        // Start the dev server process in background for API testing
        console.log('Note: Make sure dev server is running on port 3000');

        // Test with different approaches
        await testAPIEndpoint(authUser.user, testEmail, testPassword);

    } finally {
        // Cleanup
        console.log('\n🧹 Cleaning up...');
        await supabase.auth.admin.deleteUser(authUser.user.id);
        console.log('✅ Cleanup completed');
    }
}

async function testAPIEndpoint(user, email, password) {
    console.log('\n--- Testing API Endpoint ---');
    
    // Method 1: Direct service role call to the API
    console.log('\n1. Testing with direct fetch to API endpoint...');
    try {
        const response = await fetch('http://localhost:3000/api/learning-paths/my-paths', {
            method: 'GET',
            headers: {
                'Content-Type': 'application/json',
            }
        });

        if (!response.ok) {
            const errorText = await response.text();
            console.log(`❌ API returned ${response.status}: ${errorText}`);
        } else {
            const data = await response.json();
            console.log('✅ API call succeeded:', data);
        }
    } catch (error) {
        console.log('❌ Fetch error:', error.message);
    }

    // Method 2: Test the service directly
    console.log('\n2. Testing the LearningPathsService directly...');
    try {
        const { LearningPathsService } = await import('../lib/services/learningPathsService.ts');
        const assignedPaths = await LearningPathsService.getUserAssignedPaths(supabase, user.id);
        console.log(`✅ Service call succeeded: ${assignedPaths.length} paths found`);
        if (assignedPaths.length > 0) {
            assignedPaths.forEach((path, index) => {
                console.log(`   ${index + 1}. ${path.name} (${path.id})`);
            });
        }
    } catch (error) {
        console.log('❌ Service error:', error.message);
    }

    // Method 3: Create an authenticated supabase client and test
    console.log('\n3. Testing with authenticated Supabase client...');
    try {
        // Create a client-side supabase client
        const userSupabase = createClient(
            process.env.NEXT_PUBLIC_SUPABASE_URL,
            process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
        );

        // Sign in as the test user
        const { data: signInData, error: signInError } = await userSupabase.auth.signInWithPassword({
            email,
            password
        });

        if (signInError) {
            console.log('❌ Could not sign in test user:', signInError.message);
            return;
        }

        console.log('✅ Signed in as test user');

        // Now test the service with the authenticated client
        const { LearningPathsService } = await import('../lib/services/learningPathsService.ts');
        const assignedPaths = await LearningPathsService.getUserAssignedPaths(userSupabase, user.id);
        console.log(`✅ Authenticated service call succeeded: ${assignedPaths.length} paths found`);
        
        // Test the actual query that would be used
        const { data: directQuery, error: queryError } = await userSupabase
            .from('learning_path_assignments')
            .select(`
                *,
                path:learning_paths(*)
            `)
            .eq('user_id', user.id);
            
        if (queryError) {
            console.log('❌ Direct authenticated query failed:', queryError.message);
        } else {
            console.log(`✅ Direct authenticated query succeeded: ${directQuery.length} assignments found`);
        }

    } catch (error) {
        console.log('❌ Authenticated client error:', error.message);
    }
}

testAPIDirectly().catch(console.error);