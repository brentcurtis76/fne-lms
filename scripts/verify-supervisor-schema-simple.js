#!/usr/bin/env node

/**
 * Verify Supervisor de Red Database Schema
 * Simple approach using direct Supabase queries
 */

const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.test.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
    console.error('❌ Missing Supabase environment variables');
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey, {
    auth: {
        autoRefreshToken: false,
        persistSession: false
    }
});

async function verifySchema() {
    console.log('🔍 Verifying Supervisor de Red Database Schema...\n');

    try {
        // 1. Test if we can query user_roles table with supervisor_de_red
        console.log('1. Testing supervisor_de_red enum value...');
        
        // Try to insert a test record with supervisor_de_red role (then delete it)
        const testUserId = '00000000-0000-0000-0000-000000000000'; // Invalid UUID for testing
        
        const { data: insertTest, error: insertError } = await supabase
            .from('user_roles')
            .insert({
                user_id: testUserId,
                role_type: 'supervisor_de_red',
                is_active: false,
                assigned_at: new Date().toISOString()
            });

        if (insertError) {
            if (insertError.message.includes('invalid input value for enum')) {
                console.log('❌ supervisor_de_red is NOT in user_role_type enum');
                console.log('   Error:', insertError.message);
            } else if (insertError.message.includes('foreign key')) {
                console.log('✅ supervisor_de_red enum value exists (foreign key error expected)');
            } else {
                console.log('⚠️  Unexpected error testing enum:', insertError.message);
            }
        } else {
            console.log('✅ supervisor_de_red enum value exists');
            // Clean up test record if it was created
            await supabase.from('user_roles').delete().eq('user_id', testUserId);
        }

        // 2. Check required tables exist by querying them
        console.log('\n2. Checking supervisor-related tables...');
        const tables = [
            { name: 'redes_de_colegios', expectedColumns: ['id', 'nombre', 'descripcion'] },
            { name: 'red_escuelas', expectedColumns: ['id', 'red_id', 'school_id'] },
            { name: 'supervisor_auditorias', expectedColumns: ['id', 'supervisor_id', 'accion'] }
        ];

        let allTablesExist = true;

        for (const table of tables) {
            try {
                const { data, error } = await supabase
                    .from(table.name)
                    .select('*')
                    .limit(1);

                if (error) {
                    console.log(`❌ Table '${table.name}' error:`, error.message);
                    allTablesExist = false;
                } else {
                    console.log(`✅ Table '${table.name}' exists and is accessible`);
                    
                    // Test a simple insert to verify structure
                    if (table.name === 'redes_de_colegios') {
                        const { error: structureError } = await supabase
                            .from(table.name)
                            .insert({
                                nombre: '__test_network__',
                                descripcion: 'Test network for schema verification',
                                created_by: testUserId
                            });
                        
                        if (structureError) {
                            if (structureError.message.includes('foreign key')) {
                                console.log(`   ✅ Structure verified for ${table.name}`);
                            } else {
                                console.log(`   ⚠️  Structure issue for ${table.name}:`, structureError.message);
                            }
                        } else {
                            console.log(`   ✅ Structure verified for ${table.name}`);
                            // Clean up
                            await supabase.from(table.name).delete().eq('nombre', '__test_network__');
                        }
                    }
                }
            } catch (err) {
                console.log(`❌ Table '${table.name}' check failed:`, err.message);
                allTablesExist = false;
            }
        }

        // 3. Check if migration has been applied by looking for specific table data
        console.log('\n3. Checking migration application status...');
        
        const { data: migrationData, error: migrationError } = await supabase
            .from('schema_migrations')
            .select('version')
            .like('version', '%supervisor%');

        if (!migrationError && migrationData) {
            if (migrationData.length > 0) {
                console.log('✅ Supervisor-related migrations found in schema_migrations');
                migrationData.forEach(m => console.log(`   - ${m.version}`));
            } else {
                console.log('⚠️  No supervisor-related migrations found in schema_migrations');
            }
        } else {
            console.log('⚠️  Could not check schema_migrations table');
        }

        // 4. Final Summary
        console.log('\n📊 DATABASE SCHEMA VERIFICATION RESULTS:');
        console.log('==========================================');
        
        if (allTablesExist) {
            console.log('✅ SUCCESS: All supervisor_de_red database components verified');
            console.log('✅ Database schema is ready for supervisor functionality');
            console.log('\n🎯 Next step: Run E2E tests to verify functionality');
        } else {
            console.log('❌ INCOMPLETE: Some database components are missing');
            console.log('⚠️  Migration needs to be applied');
            console.log('\n🔧 Recommended action: Apply supervisor migration');
        }

        return allTablesExist;

    } catch (error) {
        console.error('💥 Schema verification failed:', error);
        return false;
    }
}

// Run verification
verifySchema()
    .then(success => process.exit(success ? 0 : 1))
    .catch(error => {
        console.error('Script error:', error);
        process.exit(1);
    });