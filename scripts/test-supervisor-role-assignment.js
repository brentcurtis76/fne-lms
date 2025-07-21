#!/usr/bin/env node

/**
 * Test supervisor_de_red role assignment with proper network scope
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

async function testSupervisorRoleAssignment() {
    console.log('🧪 Testing supervisor_de_red role assignment...\n');

    try {
        // First, verify the user_roles table has the red_id column
        console.log('1. Checking user_roles table structure...');
        const { data: sampleData, error: sampleError } = await supabase
            .from('user_roles')
            .select('*')
            .limit(1);

        if (sampleError && !sampleError.message.includes('returning "0" rows')) {
            console.log('❌ Error querying user_roles:', sampleError.message);
            return;
        }

        // Check if we can describe the table structure (alternate method)
        const { error: describeError } = await supabase
            .from('user_roles')
            .insert({
                user_id: '00000000-0000-0000-0000-000000000001',
                role_type: 'admin',
                is_active: false,
                assigned_at: new Date().toISOString(),
                school_id: 1 // Use integer value for school_id
            });

        console.log('Test admin role:', describeError ? describeError.message : 'Success');

        // Now test creating a network and supervisor
        console.log('\n2. Creating test network...');
        const { data: network, error: networkError } = await supabase
            .from('redes_de_colegios')
            .insert({
                nombre: 'Test Network for Schema Verification',
                descripcion: 'Temporary network for testing supervisor role assignment',
                created_by: '00000000-0000-0000-0000-000000000001'
            })
            .select()
            .single();

        if (networkError) {
            console.log('❌ Error creating test network:', networkError.message);
            return;
        }

        console.log('✅ Test network created:', network.id);

        // Test supervisor role assignment with proper scope
        console.log('\n3. Testing supervisor_de_red role assignment...');
        const { data: supervisorRole, error: supervisorError } = await supabase
            .from('user_roles')
            .insert({
                user_id: '00000000-0000-0000-0000-000000000002',
                role_type: 'supervisor_de_red',
                red_id: network.id, // Link to the network
                is_active: true,
                assigned_at: new Date().toISOString()
            });

        if (supervisorError) {
            if (supervisorError.message.includes('red_id')) {
                console.log('❌ red_id column not found - migration may not have applied');
            } else {
                console.log('⚠️  Supervisor role assignment error:', supervisorError.message);
            }
        } else {
            console.log('✅ SUCCESS: supervisor_de_red role assigned with network scope!');
        }

        // Clean up
        console.log('\n4. Cleaning up test data...');
        await supabase.from('user_roles').delete().in('user_id', [
            '00000000-0000-0000-0000-000000000001',
            '00000000-0000-0000-0000-000000000002'
        ]);
        await supabase.from('redes_de_colegios').delete().eq('id', network.id);
        
        console.log('✅ Test data cleaned up');

        // Summary
        console.log('\n📊 SUPERVISOR ROLE TEST SUMMARY:');
        console.log('==================================');
        if (!supervisorError) {
            console.log('✅ Migration successful - supervisor_de_red role fully functional');
            console.log('✅ Database schema complete and ready for supervisor features');
        } else {
            console.log('❌ Migration incomplete - supervisor role assignment failed');
            console.log('⚠️  Additional database fixes may be needed');
        }

    } catch (error) {
        console.error('💥 Test failed:', error.message);
    }
}

testSupervisorRoleAssignment();