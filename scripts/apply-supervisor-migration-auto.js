const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function applyMigration() {
  console.log('🚀 Applying Supervisor de Red migration automatically...\n');

  try {
    // Step 1: Try to create the enum value
    console.log('Step 1: Adding supervisor_de_red to enum...');
    
    // First, let's check if the tables already exist
    const { data: existingTables, error: checkError } = await supabase
      .from('redes_de_colegios')
      .select('id')
      .limit(1);

    if (!checkError || checkError.code !== '42P01') {
      console.log('✅ Tables already exist! Migration may have been applied.');
      return;
    }

    // Create tables one by one using Supabase admin API
    console.log('\nStep 2: Creating redes_de_colegios table...');
    
    // Unfortunately, Supabase JS client doesn't support DDL operations directly
    // We need to use the SQL endpoint, but that requires additional setup
    
    console.log('\n❌ Cannot create tables directly via JavaScript client.');
    console.log('\n📝 Please follow these steps manually:');
    console.log('\n1. Go to your Supabase Dashboard');
    console.log('2. Navigate to SQL Editor');
    console.log('3. Run the following SQL in TWO PARTS:\n');
    
    console.log('--- PART 1 (Run this first) ---');
    console.log(`
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_enum 
        WHERE enumlabel = 'supervisor_de_red' 
        AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'user_role_type')
    ) THEN
        ALTER TYPE user_role_type ADD VALUE 'supervisor_de_red';
    END IF;
END
$$;
`);

    console.log('\n--- PART 2 (Run after Part 1) ---');
    console.log('Copy and run the contents of /database/add-supervisor-de-red-role-fixed.sql starting from BEGIN;');
    
    console.log('\n💡 TIP: The fixed SQL file has all the necessary CREATE TABLE statements.');

  } catch (error) {
    console.error('❌ Error:', error);
  }
}

applyMigration();