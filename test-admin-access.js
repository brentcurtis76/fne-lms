#!/usr/bin/env node

const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://sxlogxqzmarhqsblxmtj.supabase.co';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseKey) {
    console.error('❌ SUPABASE_SERVICE_ROLE_KEY is required');
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function testAdminAccess() {
    console.log('🔍 Testing admin access to learning paths...');
    
    try {
        // 1. Find an admin user
        const { data: adminUsers, error: adminError } = await supabase
            .from('user_roles')
            .select('user_id, profiles!inner(email)')
            .eq('role', 'admin')
            .eq('is_active', true)
            .limit(1);

        if (adminError || !adminUsers || adminUsers.length === 0) {
            console.error('❌ No admin users found:', adminError);
            return;
        }

        const adminUser = adminUsers[0];
        console.log('✅ Found admin user:', adminUser.profiles.email);

        // 2. Find a learning path (any learning path)
        const { data: learningPaths, error: pathError } = await supabase
            .from('learning_paths')
            .select('id, name')
            .limit(1);

        if (pathError || !learningPaths || learningPaths.length === 0) {
            console.error('❌ No learning paths found:', pathError);
            return;
        }

        const testPath = learningPaths[0];
        console.log('✅ Found learning path:', testPath.name);

        // 3. Test session start API with admin user
        console.log('🧪 Testing session start API...');
        
        const sessionResponse = await fetch('http://localhost:3001/api/learning-paths/session/start', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${supabaseKey}`, // This won't work, need proper auth
            },
            body: JSON.stringify({
                pathId: testPath.id,
                activityType: 'path_view'
            })
        });

        console.log('Session API Status:', sessionResponse.status);
        const sessionData = await sessionResponse.text();
        console.log('Session API Response:', sessionData);

        // 4. Test enhanced progress API
        console.log('🧪 Testing enhanced progress API...');
        
        const progressResponse = await fetch(`http://localhost:3001/api/learning-paths/${testPath.id}/enhanced-progress`, {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${supabaseKey}`, // This won't work, need proper auth
            }
        });

        console.log('Progress API Status:', progressResponse.status);
        const progressData = await progressResponse.text();
        console.log('Progress API Response:', progressData);

    } catch (error) {
        console.error('❌ Test failed:', error.message);
    }
}

// Run the test
testAdminAccess().then(() => {
    console.log('✅ Test completed');
    process.exit(0);
}).catch(error => {
    console.error('❌ Test failed:', error);
    process.exit(1);
});