#!/usr/bin/env node

/**
 * Check user_roles table schema
 */

const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.test.local' });

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    {
        auth: { autoRefreshToken: false, persistSession: false }
    }
);

async function checkUserRolesSchema() {
    console.log('🔍 Checking user_roles table schema...\n');

    try {
        // Get a sample record to see the structure
        const { data, error } = await supabase
            .from('user_roles')
            .select('*')
            .limit(1);

        if (error) {
            console.log('❌ Error querying user_roles:', error.message);
            return;
        }

        if (data && data.length > 0) {
            console.log('✅ Current user_roles table structure:');
            const columns = Object.keys(data[0]);
            columns.forEach(col => console.log(`   - ${col}`));
            
            console.log('\n🔍 Expected supervisor-related columns:');
            const expectedCols = ['red_id'];
            expectedCols.forEach(col => {
                if (columns.includes(col)) {
                    console.log(`   ✅ ${col} - Present`);
                } else {
                    console.log(`   ❌ ${col} - Missing`);
                }
            });
        } else {
            console.log('⚠️  No data in user_roles table, creating sample record to check schema...');
            
            // Try to see what columns are available by attempting different inserts
            const testInserts = [
                { user_id: '00000000-0000-0000-0000-000000000001', role_type: 'docente', is_active: false, assigned_at: new Date().toISOString() },
                { user_id: '00000000-0000-0000-0000-000000000002', role_type: 'supervisor_de_red', is_active: false, assigned_at: new Date().toISOString() }
            ];
            
            for (const testData of testInserts) {
                const { error: testError } = await supabase
                    .from('user_roles')
                    .insert(testData);
                
                console.log(`Test ${testData.role_type}:`, testError ? testError.message : 'Success');
            }
        }

        // Test supervisor_de_red enum directly
        console.log('\n🧪 Testing supervisor_de_red enum...');
        const { error: supervisorError } = await supabase
            .from('user_roles')
            .insert({
                user_id: '00000000-0000-0000-0000-000000000003',
                role_type: 'supervisor_de_red',
                is_active: false,
                assigned_at: new Date().toISOString()
            });

        if (supervisorError) {
            if (supervisorError.message.includes('invalid input value for enum')) {
                console.log('❌ supervisor_de_red NOT in enum');
            } else {
                console.log('✅ supervisor_de_red IN enum (other error:', supervisorError.message.split('.')[0], ')');
            }
        } else {
            console.log('✅ supervisor_de_red enum works perfectly');
        }

    } catch (error) {
        console.error('❌ Schema check failed:', error);
    }
}

checkUserRolesSchema();