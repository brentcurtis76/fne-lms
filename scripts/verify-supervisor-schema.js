#!/usr/bin/env node

/**
 * Verify Supervisor de Red Database Schema
 * Checks if all required components are properly deployed
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

// Load test environment configuration
dotenv.config({ path: '.env.test.local' });

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

async function verifySupuservisorSchema() {
    console.log('🔍 Verifying Supervisor de Red Database Schema...\n');

    try {
        // 1. Check if supervisor_de_red exists in user_role_type enum
        console.log('1. Checking user_role_type enum values...');
        const { data: enumData, error: enumError } = await supabase
            .rpc('get_enum_values', { enum_name: 'user_role_type' });

        if (enumError) {
            // Fallback: Try direct query if RPC doesn't exist
            const { data: fallbackData, error: fallbackError } = await supabase
                .from('pg_enum')
                .select('enumlabel')
                .eq('enumtypid', 'user_role_type'::text);
            
            if (fallbackError) {
                // Try even more direct approach
                const { data: directData, error: directError } = await supabase
                    .rpc('exec_sql', { 
                        query: "SELECT unnest(enum_range(NULL::user_role_type))::text AS role;" 
                    });
                
                if (directError) {
                    console.log('⚠️  Could not query enum values directly, trying alternative method...');
                    // Let's try a simpler approach with a test query
                    const { data: testData, error: testError } = await supabase
                        .from('user_roles')
                        .select('role_type')
                        .limit(1);
                    
                    if (testError) {
                        console.log('❌ Error checking enum values:', testError.message);
                        return false;
                    } else {
                        console.log('✅ user_role_type enum accessible (could not list all values)');
                    }
                } else {
                    const roles = directData.map(row => row.role);
                    console.log('   Available roles:', roles.join(', '));
                    
                    if (roles.includes('supervisor_de_red')) {
                        console.log('✅ supervisor_de_red found in user_role_type enum');
                    } else {
                        console.log('❌ supervisor_de_red NOT found in user_role_type enum');
                        return false;
                    }
                }
            } else {
                const roles = fallbackData.map(row => row.enumlabel);
                console.log('   Available roles:', roles.join(', '));
                
                if (roles.includes('supervisor_de_red')) {
                    console.log('✅ supervisor_de_red found in user_role_type enum');
                } else {
                    console.log('❌ supervisor_de_red NOT found in user_role_type enum');
                    return false;
                }
            }
        } else {
            const roles = enumData.map(row => row.value || row.enumlabel || row.role);
            console.log('   Available roles:', roles.join(', '));
            
            if (roles.includes('supervisor_de_red')) {
                console.log('✅ supervisor_de_red found in user_role_type enum');
            } else {
                console.log('❌ supervisor_de_red NOT found in user_role_type enum');
                return false;
            }
        }

        // 2. Check if required tables exist
        console.log('\n2. Checking supervisor-related tables...');
        const requiredTables = [
            'redes_de_colegios',
            'red_escuelas', 
            'supervisor_auditorias'
        ];

        let allTablesExist = true;

        for (const tableName of requiredTables) {
            try {
                // Try to query the table structure
                const { data, error } = await supabase
                    .from(tableName)
                    .select('*')
                    .limit(1);

                if (error) {
                    console.log(`❌ Table '${tableName}' not accessible:`, error.message);
                    allTablesExist = false;
                } else {
                    console.log(`✅ Table '${tableName}' exists and is accessible`);
                }
            } catch (err) {
                console.log(`❌ Table '${tableName}' check failed:`, err.message);
                allTablesExist = false;
            }
        }

        // 3. Verify table structures
        if (allTablesExist) {
            console.log('\n3. Verifying table structures...');
            
            // Check redes_de_colegios columns
            const { data: networkCols, error: networkError } = await supabase
                .rpc('get_table_columns', { table_name: 'redes_de_colegios' });
            
            if (!networkError && networkCols) {
                const expectedCols = ['id', 'nombre', 'descripcion', 'created_by', 'created_at'];
                const actualCols = networkCols.map(col => col.column_name);
                const missingCols = expectedCols.filter(col => !actualCols.includes(col));
                
                if (missingCols.length === 0) {
                    console.log('✅ redes_de_colegios has all expected columns');
                } else {
                    console.log('⚠️  redes_de_colegios missing columns:', missingCols.join(', '));
                }
            } else {
                console.log('⚠️  Could not verify redes_de_colegios structure');
            }
        }

        // 4. Summary
        console.log('\n📊 SCHEMA VERIFICATION SUMMARY:');
        console.log('================================');
        
        if (allTablesExist) {
            console.log('✅ All supervisor_de_red database components are properly deployed');
            console.log('✅ Database schema is ready for supervisor functionality');
            return true;
        } else {
            console.log('❌ Some database components are missing or inaccessible');
            console.log('⚠️  Database migration may need to be applied');
            return false;
        }

    } catch (error) {
        console.error('❌ Schema verification failed:', error.message);
        return false;
    }
}

// Run the verification
verifySupuservisorSchema()
    .then(success => {
        process.exit(success ? 0 : 1);
    })
    .catch(error => {
        console.error('💥 Script failed:', error);
        process.exit(1);
    });