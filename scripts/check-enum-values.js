#!/usr/bin/env node

/**
 * Check user_role_type enum values directly
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

async function checkEnum() {
    console.log('🔍 Checking user_role_type enum values...\n');

    try {
        // Check existing user_roles to see what values are in use
        const { data: existingRoles, error: rolesError } = await supabase
            .from('user_roles')
            .select('role_type')
            .limit(20);

        if (!rolesError && existingRoles) {
            const uniqueRoles = [...new Set(existingRoles.map(r => r.role_type))];
            console.log('✅ Currently used role_type values:');
            uniqueRoles.forEach(role => console.log(`   - ${role}`));
            
            if (uniqueRoles.includes('supervisor_de_red')) {
                console.log('\n✅ supervisor_de_red is actively used in user_roles table');
            } else {
                console.log('\n⚠️  supervisor_de_red not found in current user_roles data');
            }
        }

        // Try creating a minimal test user_role with proper scope
        console.log('\n🧪 Testing supervisor_de_red enum acceptance...');
        
        const testData = {
            user_id: '00000000-0000-0000-0000-000000000001', // Test UUID
            role_type: 'supervisor_de_red',
            is_active: false,
            assigned_at: new Date().toISOString(),
            red_id: '00000000-0000-0000-0000-000000000002' // Add red_id for scope
        };

        const { data: testInsert, error: testError } = await supabase
            .from('user_roles')
            .insert(testData);

        if (testError) {
            if (testError.message.includes('invalid input value for enum')) {
                console.log('❌ supervisor_de_red NOT in user_role_type enum');
                console.log('   Need to apply database migration');
            } else if (testError.message.includes('foreign key')) {
                console.log('✅ supervisor_de_red enum exists (foreign key constraint triggered as expected)');
            } else if (testError.message.includes('violates check constraint')) {
                console.log('✅ supervisor_de_red enum exists (check constraint means role is recognized but scope validation failed)');
                console.log('   This is expected - supervisor_de_red requires red_id for organizational scope');
            } else {
                console.log('⚠️  Unexpected error:', testError.message);
            }
        } else {
            console.log('✅ supervisor_de_red enum exists and test insert successful');
            // Clean up test record
            await supabase.from('user_roles').delete().match(testData);
        }

        console.log('\n📊 ENUM VERIFICATION COMPLETE');
        
    } catch (error) {
        console.error('❌ Enum check failed:', error);
    }
}

checkEnum();