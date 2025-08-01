#!/usr/bin/env node

const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = 'https://sxlogxqzmarhqsblxmtj.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InN4bG9neHF6bWFyaHFzYmx4bXRqIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc0NzMyMjIyMSwiZXhwIjoyMDYyODk4MjIxfQ.OiyMUeIoCc_mH7G5xZms1AhDyYM3jXqqIjccSL0JmWI';

const supabase = createClient(supabaseUrl, supabaseKey);

async function checkTableSchema() {
    console.log('🔍 Checking table schemas...');
    
    try {
        // Just try to select all columns from user_roles to see what exists
        const { data: userRolesSample, error: userRolesError } = await supabase
            .from('user_roles')
            .select('*')
            .limit(1);

        if (userRolesError) {
            console.error('❌ Error querying user_roles:', userRolesError);
        } else {
            console.log('👤 user_roles table columns:');
            if (userRolesSample && userRolesSample.length > 0) {
                console.log(Object.keys(userRolesSample[0]));
            } else {
                console.log('No data in user_roles table');
            }
        }

        // Check profiles table
        const { data: profilesSample, error: profilesError } = await supabase
            .from('profiles')
            .select('*')
            .limit(1);

        if (profilesError) {
            console.error('❌ Error querying profiles:', profilesError);
        } else {
            console.log('👤 profiles table columns:');
            if (profilesSample && profilesSample.length > 0) {
                console.log(Object.keys(profilesSample[0]));
            } else {
                console.log('No data in profiles table');
            }
        }

        // Check learning_path_assignments table
        const { data: assignmentsSample, error: assignmentsError } = await supabase
            .from('learning_path_assignments')
            .select('*')
            .limit(1);

        if (assignmentsError) {
            console.error('❌ Error querying learning_path_assignments:', assignmentsError);
        } else {
            console.log('📋 learning_path_assignments table columns:');
            if (assignmentsSample && assignmentsSample.length > 0) {
                console.log(Object.keys(assignmentsSample[0]));
            } else {
                console.log('No data in learning_path_assignments table');
            }
        }

    } catch (error) {
        console.error('❌ Check failed:', error.message);
    }
}

// Run the check
checkTableSchema().then(() => {
    console.log('✅ Schema check completed');
    process.exit(0);
}).catch(error => {
    console.error('❌ Schema check failed:', error);
    process.exit(1);
});