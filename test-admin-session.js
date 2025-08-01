#!/usr/bin/env node

const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = 'https://sxlogxqzmarhqsblxmtj.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InN4bG9neHF6bWFyaHFzYmx4bXRqIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc0NzMyMjIyMSwiZXhwIjoyMDYyODk4MjIxfQ.OiyMUeIoCc_mH7G5xZms1AhDyYM3jXqqIjccSL0JmWI';

const supabase = createClient(supabaseUrl, supabaseKey);

async function testAdminSession() {
    console.log('🔍 Testing admin session logic...');
    
    try {
        // Find an admin user
        const { data: adminUsers, error: adminError } = await supabase
            .from('user_roles')
            .select(`
                user_id, 
                role_type, 
                is_active
            `)
            .eq('role_type', 'admin')
            .eq('is_active', true)
            .limit(1);

        if (adminError || !adminUsers || adminUsers.length === 0) {
            console.log('❌ No admin users found, checking for other admin roles...');
            
            // Try equipo_directivo
            const { data: otherAdmins, error: otherError } = await supabase
                .from('user_roles')
                .select(`
                    user_id, 
                    role_type, 
                    is_active
                `)
                .in('role_type', ['equipo_directivo', 'consultor'])
                .eq('is_active', true)
                .limit(1);

            if (otherError || !otherAdmins || otherAdmins.length === 0) {
                console.error('❌ No admin-level users found at all');
                return;
            }

            console.log('✅ Found admin-level user with role:', otherAdmins[0].role_type);
            console.log('   User ID:', otherAdmins[0].user_id);

            // Test the admin access logic
            const testUserId = otherAdmins[0].user_id;
            
            // This mimics what the API does
            const { data: userRoles } = await supabase
                .from('user_roles')
                .select('role_type')
                .eq('user_id', testUserId)
                .eq('is_active', true);

            const hasAdminAccess = userRoles?.some(role => 
                ['admin', 'equipo_directivo', 'consultor'].includes(role.role_type)
            );

            console.log('🔑 Admin access check result:', hasAdminAccess);
            console.log('   User roles found:', userRoles?.map(r => r.role_type));

            return;
        }

        const adminUser = adminUsers[0];
        console.log('✅ Found admin user:', adminUser.user_id);

        // Test the admin access logic
        const { data: userRoles } = await supabase
            .from('user_roles')
            .select('role_type')
            .eq('user_id', adminUser.user_id)
            .eq('is_active', true);

        const hasAdminAccess = userRoles?.some(role => 
            ['admin', 'equipo_directivo', 'consultor'].includes(role.role_type)
        );

        console.log('🔑 Admin access check result:', hasAdminAccess);
        console.log('   User roles found:', userRoles?.map(r => r.role_type));

        // Test with a learning path
        const { data: learningPaths, error: pathError } = await supabase
            .from('learning_paths')
            .select('id, name')
            .limit(1);

        if (pathError || !learningPaths || learningPaths.length === 0) {
            console.error('❌ No learning paths found');
            return;
        }

        const testPath = learningPaths[0];
        console.log('📚 Test learning path:', testPath.name);

        console.log('✅ Admin should have access to all learning paths without assignment');

    } catch (error) {
        console.error('❌ Test failed:', error.message);
    }
}

// Run the test
testAdminSession().then(() => {
    console.log('✅ Test completed');
    process.exit(0);
}).catch(error => {
    console.error('❌ Test failed:', error);
    process.exit(1);
});