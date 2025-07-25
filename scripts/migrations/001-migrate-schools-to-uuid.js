/**
 * FNE LMS Database Migration: Schools Table UUID Conversion
 * 
 * Migration: 001-migrate-schools-to-uuid
 * Purpose: Convert schools.id from INTEGER to UUID with proper dependency handling
 * 
 * This migration uses the Supabase client to clear existing data and then executes
 * the UUID conversion via direct SQL commands. This approach bypasses connection issues.
 * 
 * Dependencies: @supabase/supabase-js - already in package.json
 */

const { createClient } = require('@supabase/supabase-js');
const path = require('path');

// Load environment variables from .env.local
require('dotenv').config({ path: path.join(process.cwd(), '.env.local') });

/**
 * Get the Supabase client - this approach works reliably
 */
function getSupabaseClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  
  if (!supabaseUrl || !serviceKey) {
    throw new Error('Missing required environment variables: NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  }
  
  return createClient(supabaseUrl, serviceKey);
}

/**
 * Clear existing data using Supabase client (this works reliably)
 */
async function clearExistingData() {
  console.log('🧹 Clearing existing data from schools and related tables...');
  
  const supabase = getSupabaseClient();
  
  try {
    // Clear schools table
    const { error: schoolsError } = await supabase
      .from('schools')
      .delete()
      .neq('id', 0); // Delete all records
    
    if (schoolsError) {
      console.warn(`⚠️  Warning clearing schools: ${schoolsError.message}`);
    } else {
      console.log('✅ Cleared schools table');
    }
    
    // Clear generations table if it exists
    try {
      const { error: genError } = await supabase
        .from('generations')
        .delete()
        .neq('id', 0);
      
      if (genError) {
        console.warn(`⚠️  Warning clearing generations: ${genError.message}`);
      } else {
        console.log('✅ Cleared generations table');
      }
    } catch (error) {
      console.log('ℹ️  Generations table may not exist or is already clear');
    }
    
    // Clear communities table if it exists
    try {
      const { error: commError } = await supabase
        .from('communities')
        .delete()
        .neq('id', 0);
      
      if (commError) {
        console.warn(`⚠️  Warning clearing communities: ${commError.message}`);
      } else {
        console.log('✅ Cleared communities table');
      }
    } catch (error) {
      console.log('ℹ️  Communities table may not exist or is already clear');
    }
    
    return true;
  } catch (error) {
    console.error('❌ Data clearing failed:', error.message);
    return false;
  }
}

/**
 * Generate the comprehensive SQL commands for UUID migration with full dependency handling
 */
function generateMigrationSQL() {
  return `
-- =====================================================
-- FNE LMS Sandbox: Schools Table UUID Migration
-- COMPREHENSIVE DEPENDENCY RESOLUTION VERSION
-- =====================================================
-- Execute these commands in Supabase SQL Editor
-- =====================================================

BEGIN;

-- =====================================================
-- PHASE 1: COMPREHENSIVE DEPENDENCY DISCOVERY & REMOVAL
-- =====================================================

-- Step 1A: Drop ALL views that might depend on schools or school_id columns
DO $$
DECLARE
    view_record RECORD;
BEGIN
    RAISE NOTICE 'Discovering and dropping views that depend on schools...';
    
    -- Get all views in public schema
    FOR view_record IN 
        SELECT schemaname, viewname, definition
        FROM pg_views 
        WHERE schemaname = 'public'
    LOOP
        -- Check if view definition contains references to schools or school_id
        IF view_record.definition ~* 'schools|school_id' THEN
            BEGIN
                EXECUTE format('DROP VIEW IF EXISTS %I.%I CASCADE', view_record.schemaname, view_record.viewname);
                RAISE NOTICE 'Dropped view %.% (contained schools reference)', view_record.schemaname, view_record.viewname;
            EXCEPTION WHEN OTHERS THEN
                RAISE NOTICE 'Could not drop view %.%: %', view_record.schemaname, view_record.viewname, SQLERRM;
            END;
        END IF;
    END LOOP;
END $$;

-- Step 1B: Drop ALL triggers that might depend on schools or school_id columns
DO $$
DECLARE
    trigger_record RECORD;
BEGIN
    RAISE NOTICE 'Discovering and dropping triggers that depend on schools...';
    
    -- Get all triggers in public schema
    FOR trigger_record IN 
        SELECT 
            trigger_name,
            event_object_table,
            action_statement
        FROM information_schema.triggers 
        WHERE trigger_schema = 'public'
        AND (event_object_table = 'schools' 
             OR event_object_table = 'generations'
             OR action_statement ~* 'school')
    LOOP
        BEGIN
            EXECUTE format('DROP TRIGGER IF EXISTS %I ON %I CASCADE', 
                         trigger_record.trigger_name, 
                         trigger_record.event_object_table);
            RAISE NOTICE 'Dropped trigger % on table %', 
                       trigger_record.trigger_name, 
                       trigger_record.event_object_table;
        EXCEPTION WHEN OTHERS THEN
            RAISE NOTICE 'Could not drop trigger %: %', trigger_record.trigger_name, SQLERRM;
        END;
    END LOOP;
END $$;

-- Step 1C: Drop ALL rules that might depend on schools columns
DO $$
DECLARE
    rule_record RECORD;
BEGIN
    RAISE NOTICE 'Discovering and dropping rules that depend on schools...';
    
    -- Get all rules in public schema
    FOR rule_record IN 
        SELECT rulename, tablename
        FROM pg_rules 
        WHERE schemaname = 'public'
        AND (tablename = 'schools' OR definition ~* 'school')
    LOOP
        BEGIN
            EXECUTE format('DROP RULE IF EXISTS %I ON %I CASCADE', 
                         rule_record.rulename, 
                         rule_record.tablename);
            RAISE NOTICE 'Dropped rule % on table %', rule_record.rulename, rule_record.tablename;
        EXCEPTION WHEN OTHERS THEN
            RAISE NOTICE 'Could not drop rule %: %', rule_record.rulename, SQLERRM;
        END;
    END LOOP;
END $$;

-- Step 1D: Drop ALL functions that might depend on schools columns (simplified)
DO $$
DECLARE
    func_record RECORD;
    func_def text;
BEGIN
    RAISE NOTICE 'Discovering and dropping functions that depend on schools...';
    
    -- Get all non-aggregate functions that might reference schools
    FOR func_record IN 
        SELECT 
            n.nspname as schema_name,
            p.proname as function_name,
            pg_get_function_identity_arguments(p.oid) as args,
            p.oid,
            p.prokind
        FROM pg_proc p
        JOIN pg_namespace n ON p.pronamespace = n.oid
        WHERE n.nspname = 'public'
        AND p.prokind IN ('f', 'p', 'w') -- Only functions, procedures, and window functions
    LOOP
        BEGIN
            -- Get function definition to check for school references
            func_def := pg_get_functiondef(func_record.oid);
            
            IF func_def ~* 'school' THEN
                EXECUTE format('DROP FUNCTION IF EXISTS %I.%I(%s) CASCADE', 
                             func_record.schema_name,
                             func_record.function_name,
                             func_record.args);
                RAISE NOTICE 'Dropped function %.%(%)', 
                           func_record.schema_name, 
                           func_record.function_name,
                           func_record.args;
            END IF;
        EXCEPTION WHEN OTHERS THEN
            RAISE NOTICE 'Could not process function %: %', func_record.function_name, SQLERRM;
        END;
    END LOOP;
END $$;

-- =====================================================
-- PHASE 2: FOREIGN KEY CONSTRAINT REMOVAL
-- =====================================================

-- Step 2: Drop foreign key constraints that reference schools.id
DO $$ 
DECLARE
    r RECORD;
BEGIN
    RAISE NOTICE 'Dropping foreign key constraints that reference schools.id...';
    
    FOR r IN (
        SELECT tc.constraint_name, tc.table_name
        FROM information_schema.table_constraints AS tc 
        JOIN information_schema.constraint_column_usage AS ccu
            ON ccu.constraint_name = tc.constraint_name
        WHERE tc.constraint_type = 'FOREIGN KEY' 
            AND ccu.table_name = 'schools'
            AND ccu.column_name = 'id'
            AND tc.table_schema = 'public'
    ) LOOP
        BEGIN
            EXECUTE format('ALTER TABLE public.%I DROP CONSTRAINT IF EXISTS %I', r.table_name, r.constraint_name);
            RAISE NOTICE 'Dropped FK constraint % from table %', r.constraint_name, r.table_name;
        EXCEPTION WHEN OTHERS THEN
            RAISE NOTICE 'Could not drop FK constraint %: %', r.constraint_name, SQLERRM;
        END;
    END LOOP;
END $$;

-- =====================================================
-- PHASE 3: COLUMN TYPE CONVERSION
-- =====================================================

-- Step 3: Drop primary key constraint on schools
DO $$
BEGIN
    ALTER TABLE public.schools DROP CONSTRAINT IF EXISTS schools_pkey;
    RAISE NOTICE 'Dropped schools primary key constraint';
END $$;

-- Step 4: Drop sequence if it exists
DO $$
BEGIN
    DROP SEQUENCE IF EXISTS public.schools_id_seq CASCADE;
    RAISE NOTICE 'Dropped schools_id_seq sequence if it existed';
END $$;

-- Step 5: Convert schools.id to UUID
DO $$
BEGIN
    ALTER TABLE public.schools ALTER COLUMN id TYPE uuid USING gen_random_uuid();
    ALTER TABLE public.schools ALTER COLUMN id SET DEFAULT gen_random_uuid();
    ALTER TABLE public.schools ALTER COLUMN id SET NOT NULL;
    RAISE NOTICE 'Converted schools.id to UUID with default gen_random_uuid()';
END $$;

-- Step 6: Re-create primary key on schools
DO $$
BEGIN
    ALTER TABLE public.schools ADD PRIMARY KEY (id);
    RAISE NOTICE 'Re-created schools primary key constraint';
END $$;

-- =====================================================
-- PHASE 4: FOREIGN KEY COLUMN CONVERSION
-- =====================================================

-- Step 7: Convert foreign key columns to UUID (handle each table individually)
DO $$ 
DECLARE
    table_record RECORD;
    column_record RECORD;
BEGIN
    RAISE NOTICE 'Converting foreign key columns to UUID...';
    
    -- Get all tables that have columns referencing schools
    FOR table_record IN (
        SELECT DISTINCT kcu.table_name
        FROM information_schema.key_column_usage kcu
        JOIN information_schema.constraint_column_usage ccu
            ON ccu.constraint_name = kcu.constraint_name
        WHERE ccu.table_name = 'schools' 
            AND ccu.column_name = 'id'
            AND kcu.table_schema = 'public'
    ) LOOP
        -- Get all columns in this table that reference schools.id
        FOR column_record IN (
            SELECT kcu.column_name
            FROM information_schema.key_column_usage kcu
            JOIN information_schema.constraint_column_usage ccu
                ON ccu.constraint_name = kcu.constraint_name
            WHERE ccu.table_name = 'schools' 
                AND ccu.column_name = 'id'
                AND kcu.table_schema = 'public'
                AND kcu.table_name = table_record.table_name
        ) LOOP
            BEGIN
                -- Clear existing data first
                EXECUTE format('UPDATE public.%I SET %I = NULL', 
                             table_record.table_name, 
                             column_record.column_name);
                
                -- Convert column type to UUID
                EXECUTE format('ALTER TABLE public.%I ALTER COLUMN %I TYPE uuid USING NULL', 
                             table_record.table_name, 
                             column_record.column_name);
                
                RAISE NOTICE 'Converted %.% to UUID', table_record.table_name, column_record.column_name;
                
            EXCEPTION WHEN OTHERS THEN
                RAISE NOTICE 'Could not convert %.%: %', table_record.table_name, column_record.column_name, SQLERRM;
            END;
        END LOOP;
    END LOOP;
END $$;

-- =====================================================
-- PHASE 5: FOREIGN KEY CONSTRAINT RECREATION
-- =====================================================

-- Step 8: Re-create foreign key constraints
DO $$ 
DECLARE
    r RECORD;
BEGIN
    RAISE NOTICE 'Re-creating foreign key constraints...';
    
    FOR r IN (
        SELECT DISTINCT 
            kcu.table_name, 
            kcu.column_name,
            kcu.constraint_name
        FROM information_schema.key_column_usage kcu
        JOIN information_schema.constraint_column_usage ccu
            ON ccu.constraint_name = kcu.constraint_name
        WHERE ccu.table_name = 'schools' 
            AND ccu.column_name = 'id'
            AND kcu.table_schema = 'public'
    ) LOOP
        BEGIN
            EXECUTE format(
                'ALTER TABLE public.%I ADD CONSTRAINT %I FOREIGN KEY (%I) REFERENCES public.schools(id)',
                r.table_name, r.constraint_name, r.column_name
            );
            RAISE NOTICE 'Re-created FK constraint % on table %.%', r.constraint_name, r.table_name, r.column_name;
        EXCEPTION WHEN OTHERS THEN
            RAISE NOTICE 'Could not recreate FK constraint %: %', r.constraint_name, SQLERRM;
        END;
    END LOOP;
END $$;

-- =====================================================
-- PHASE 6: VERIFICATION
-- =====================================================

-- Step 9: Verify the migration
DO $$
BEGIN
    RAISE NOTICE 'Verifying migration results...';
END $$;

SELECT 
    column_name,
    data_type,
    column_default,
    is_nullable
FROM information_schema.columns 
WHERE table_name = 'schools' 
    AND table_schema = 'public'
    AND column_name = 'id';

COMMIT;

-- =====================================================
-- MIGRATION COMPLETE
-- =====================================================
-- Expected result should show:
-- column_name | data_type | column_default    | is_nullable
-- id          | uuid      | gen_random_uuid() | NO
--
-- IMPORTANT NOTES:
-- 1. This migration drops ALL views, triggers, rules, and functions
--    that reference schools or school_id columns
-- 2. These objects will need to be recreated manually if still needed
-- 3. The application should recreate necessary objects automatically
--    when it runs, or they can be recreated manually
-- =====================================================
`;
}

/**
 * Main migration execution
 */
async function runMigration() {
  console.log('🚀 Starting Schools Table UUID Migration');
  console.log('=====================================');
  console.log(`Target: ${process.env.NEXT_PUBLIC_SUPABASE_URL}`);
  console.log(`Environment: ${process.env.FNE_LMS_ENVIRONMENT || 'development'}`);
  console.log('');
  
  // Validate environment
  if (process.env.FNE_LMS_ENVIRONMENT !== 'sandbox') {
    throw new Error('This migration can only be run against sandbox environment');
  }
  
  try {
    // Step 1: Clear existing data using Supabase client
    const clearSuccess = await clearExistingData();
    if (!clearSuccess) {
      console.log('⚠️  Data clearing had some issues, but proceeding with migration...');
    }
    
    // Step 2: Provide SQL commands for manual execution
    console.log('\n📋 UUID MIGRATION SQL COMMANDS');
    console.log('==============================');
    console.log('Due to connection limitations, please execute the following SQL commands');
    console.log('in the Supabase SQL Editor:\n');
    console.log('1. Go to https://supabase.com/dashboard/project/fsgdgghyrsccvbpjolwo/sql');
    console.log('2. Copy and paste the entire SQL block below');
    console.log('3. Click "Run" to execute the migration\n');
    
    const migrationSQL = generateMigrationSQL();
    console.log(migrationSQL);
    
    console.log('\n🎯 POST-MIGRATION STEPS');
    console.log('=======================');
    console.log('After running the SQL commands above:');
    console.log('1. Verify the migration completed successfully');
    console.log('2. Run the data seeding script: npm run seed:all');
    console.log('3. Check dashboard functionality at /admin/new-reporting');
    
    return true;
    
  } catch (error) {
    console.error('❌ Migration preparation failed:', error.message);
    throw error;
  }
}

/**
 * Test UUID generation after migration (using Supabase client)
 */
async function testUUIDGeneration() {
  console.log('\n🧪 Testing UUID generation...');
  
  const supabase = getSupabaseClient();
  
  try {
    // Insert a test record
    const { data: insertResult, error: insertError } = await supabase
      .from('schools')
      .insert({ name: 'Migration Test School', has_generations: true })
      .select('id, name')
      .single();
    
    if (insertError) {
      throw new Error(`Insert failed: ${insertError.message}`);
    }
    
    const testSchool = insertResult;
    console.log('✅ UUID generation test successful:');
    console.log(`   - Generated ID: ${testSchool.id}`);
    console.log(`   - ID type: ${typeof testSchool.id}`);
    console.log(`   - School name: ${testSchool.name}`);
    
    // Verify it's a valid UUID format
    const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (uuidPattern.test(testSchool.id)) {
      console.log('✅ Generated ID is a valid UUID format');
    } else {
      throw new Error('Generated ID is not a valid UUID format');
    }
    
    // Clean up test record
    const { error: deleteError } = await supabase
      .from('schools')
      .delete()
      .eq('id', testSchool.id);
    
    if (deleteError) {
      console.warn(`⚠️  Warning cleaning up test record: ${deleteError.message}`);
    } else {
      console.log('✅ Test record cleaned up');
    }
    
  } catch (error) {
    console.error('❌ UUID generation test failed:', error.message);
    throw error;
  }
}

/**
 * Main execution
 */
async function main() {
  try {
    console.log('🏗️  FNE LMS Database Migration Tool');
    console.log('Migration: 001-migrate-schools-to-uuid');
    
    // Run migration preparation
    const success = await runMigration();
    
    if (success) {
      console.log('\n✅ MIGRATION PREPARATION COMPLETED!');
      console.log('===================================');
      console.log('The SQL commands have been generated and displayed above.');
      console.log('Please execute them in the Supabase SQL Editor, then run:');
      console.log('');
      console.log('node scripts/migrations/001-migrate-schools-to-uuid.js --test');
      console.log('');
      console.log('This will test the UUID generation after the SQL migration.');
      
      process.exit(0);
    }
    
  } catch (error) {
    console.error('\n💥 MIGRATION PREPARATION FAILED');
    console.error('================================');
    console.error('Error:', error.message);
    
    process.exit(1);
  }
}

/**
 * Test-only execution
 */
async function testOnly() {
  try {
    console.log('🧪 Running UUID generation test only...');
    await testUUIDGeneration();
    
    console.log('\n🎉 MIGRATION VERIFICATION SUCCESSFUL!');
    console.log('====================================');
    console.log('✅ Schools table is using UUID primary key');
    console.log('✅ UUID generation is working correctly');
    console.log('✅ Ready for data seeding');
    console.log('\nNext steps:');
    console.log('1. Run data seeding script: npm run seed:all');
    console.log('2. Verify dashboard functionality at /admin/new-reporting');
    
    process.exit(0);
    
  } catch (error) {
    console.error('\n❌ MIGRATION VERIFICATION FAILED');
    console.error('=================================');
    console.error('Error:', error.message);
    console.error('\nPlease check that the SQL migration was executed successfully.');
    
    process.exit(1);
  }
}

// Execute migration if run directly
if (require.main === module) {
  if (process.argv.includes('--test')) {
    testOnly();
  } else {
    main();
  }
}

module.exports = { runMigration, testUUIDGeneration };