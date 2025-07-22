/**
 * Apply Network Management Database Migration
 * 
 * This script applies the supervisor/network database migration that creates:
 * - redes_de_colegios (networks table)
 * - red_escuelas (network-school relationships)
 * - supervisor_auditorias (audit trail)
 * 
 * Run with: node apply-network-migration.js
 */

const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('❌ Error: Missing Supabase environment variables');
  console.error('Make sure NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are set in .env.local');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function applyNetworkMigration() {
  try {
    console.log('🚀 Starting network migration...');
    
    // Read the migration file
    const migrationPath = path.join(__dirname, 'supabase/migrations/20250721000002_add_supervisor_de_red_tables.sql');
    
    if (!fs.existsSync(migrationPath)) {
      console.error('❌ Migration file not found:', migrationPath);
      process.exit(1);
    }
    
    const migrationSQL = fs.readFileSync(migrationPath, 'utf8');
    console.log('📁 Read migration file:', migrationPath);
    
    // Check if tables already exist
    console.log('🔍 Checking if tables already exist...');
    const { data: existingTables, error: tableCheckError } = await supabase
      .from('information_schema.tables')
      .select('table_name')
      .eq('table_schema', 'public')
      .in('table_name', ['redes_de_colegios', 'red_escuelas', 'supervisor_auditorias']);
    
    if (tableCheckError) {
      console.log('⚠️ Could not check existing tables (this is normal):', tableCheckError.message);
    } else if (existingTables && existingTables.length > 0) {
      console.log('✅ Some network tables already exist:', existingTables.map(t => t.table_name));
      console.log('📝 This migration may have been partially applied. Continuing anyway...');
    }
    
    // Split the SQL into individual statements
    const statements = migrationSQL
      .split(';')
      .map(s => s.trim())
      .filter(s => s.length > 0 && !s.startsWith('--'));
    
    console.log(`📊 Found ${statements.length} SQL statements to execute`);
    
    // Execute each statement
    for (let i = 0; i < statements.length; i++) {
      const statement = statements[i];
      
      if (statement.includes('DO $$') || statement.includes('END $$')) {
        // Handle DO blocks (these need to be executed as complete blocks)
        console.log(`⏳ Executing DO block (${i + 1}/${statements.length})...`);
      } else {
        console.log(`⏳ Executing statement (${i + 1}/${statements.length}): ${statement.substring(0, 50)}...`);
      }
      
      const { error } = await supabase.rpc('exec_sql', { sql: statement + ';' });
      
      if (error) {
        // Some errors are expected (like "already exists")
        if (error.message.includes('already exists') || error.message.includes('duplicate key')) {
          console.log(`⚠️ Statement ${i + 1} skipped (already exists):`, error.message);
        } else if (error.message.includes('permission denied')) {
          console.error(`❌ Permission denied for statement ${i + 1}. This migration needs to be run manually.`);
          console.error('📋 Please copy the SQL from the migration file and run it in the Supabase Dashboard SQL Editor:');
          console.error(`   File: ${migrationPath}`);
          console.error('   Dashboard: https://supabase.com/dashboard/project/sxlogxqzmarhqsblxmtj/sql');
          return false;
        } else {
          console.error(`❌ Error executing statement ${i + 1}:`, error.message);
          console.error('Statement:', statement);
          return false;
        }
      } else {
        console.log(`✅ Statement ${i + 1} executed successfully`);
      }
    }
    
    // Verify the migration was applied
    console.log('🔍 Verifying migration...');
    const { data: networks, error: verifyError } = await supabase
      .from('redes_de_colegios')
      .select('id')
      .limit(1);
    
    if (verifyError) {
      console.error('❌ Migration verification failed:', verifyError.message);
      return false;
    }
    
    console.log('✅ Migration applied successfully!');
    console.log('🎉 Network management tables are now ready to use');
    
    return true;
    
  } catch (error) {
    console.error('❌ Migration failed:', error.message);
    return false;
  }
}

// Run the migration
applyNetworkMigration().then(success => {
  if (success) {
    console.log('\n🎯 Next steps:');
    console.log('1. Reload the network management page in your browser');
    console.log('2. The "Error al cargar redes" should be resolved');
    console.log('3. You can now create and manage networks!');
  } else {
    console.log('\n🛠️ Manual migration required:');
    console.log('1. Go to Supabase Dashboard: https://supabase.com/dashboard/project/sxlogxqzmarhqsblxmtj/sql');
    console.log('2. Copy the contents of: supabase/migrations/20250721000002_add_supervisor_de_red_tables.sql');
    console.log('3. Paste and execute in the SQL Editor');
    console.log('4. Reload the network management page');
  }
  
  process.exit(success ? 0 : 1);
});