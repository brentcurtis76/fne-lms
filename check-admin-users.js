#!/usr/bin/env node

const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = 'https://sxlogxqzmarhqsblxmtj.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InN4bG9neHF6bWFyaHFzYmx4bXRqIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc0NzMyMjIyMSwiZXhwIjoyMDYyODk4MjIxfQ.OiyMUeIoCc_mH7G5xZms1AhDyYM3jXqqIjccSL0JmWI';

const supabase = createClient(supabaseUrl, supabaseKey);

async function checkAdminUsers() {
    console.log('🔍 Checking admin users in database...');
    
    try {
        // Check all admin users
        const { data: adminRoles, error: rolesError } = await supabase
            .from('user_roles')
            .select(`
                user_id, 
                role, 
                is_active,
                profiles!user_roles_user_id_fkey!inner(email, first_name, last_name)
            `)
            .eq('role', 'admin')
            .eq('is_active', true);

        if (rolesError) {
            console.error('❌ Error fetching admin roles:', rolesError);
            return;
        }

        console.log('👑 Admin users found:', adminRoles?.length || 0);
        
        if (adminRoles && adminRoles.length > 0) {
            adminRoles.forEach((admin, index) => {
                console.log(`${index + 1}. ${admin.profiles.email} (${admin.profiles.first_name} ${admin.profiles.last_name})`);
                console.log(`   User ID: ${admin.user_id}`);
            });
        }

        // Also check for equipo_directivo and consultor roles
        const { data: otherAdminRoles, error: otherError } = await supabase
            .from('user_roles')
            .select(`
                user_id, 
                role, 
                is_active,
                profiles!user_roles_user_id_fkey!inner(email, first_name, last_name)
            `)
            .in('role', ['equipo_directivo', 'consultor'])
            .eq('is_active', true);

        if (otherError) {
            console.error('❌ Error fetching other admin roles:', otherError);
            return;
        }

        console.log('🎯 Other admin-level users found:', otherAdminRoles?.length || 0);
        
        if (otherAdminRoles && otherAdminRoles.length > 0) {
            otherAdminRoles.forEach((admin, index) => {
                console.log(`${index + 1}. ${admin.profiles.email} (${admin.profiles.first_name} ${admin.profiles.last_name}) - ${admin.role}`);
                console.log(`   User ID: ${admin.user_id}`);
            });
        }

        // Get a sample learning path
        const { data: learningPaths, error: pathError } = await supabase
            .from('learning_paths')
            .select('id, name')
            .limit(3);

        console.log('📚 Sample learning paths:');
        if (learningPaths) {
            learningPaths.forEach((path, index) => {
                console.log(`${index + 1}. ${path.name} (ID: ${path.id})`);
            });
        }

    } catch (error) {
        console.error('❌ Check failed:', error.message);
    }
}

// Run the check
checkAdminUsers().then(() => {
    console.log('✅ Check completed');
    process.exit(0);
}).catch(error => {
    console.error('❌ Check failed:', error);
    process.exit(1);
});