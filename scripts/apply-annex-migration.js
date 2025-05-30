// This script applies the database migration to add annex support to the contratos table
// Run with: node scripts/apply-annex-migration.js

const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: '.env.local' });

// Get Supabase URL and key from environment variables
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY; // Note: Requires service role key

async function applyAnnexMigration() {
  if (!supabaseUrl || !supabaseKey) {
    console.error('Error: Supabase URL or Service Role Key not found in environment variables');
    console.log('Make sure you have a .env.local file with:');
    console.log('NEXT_PUBLIC_SUPABASE_URL=your-supabase-url');
    console.log('SUPABASE_SERVICE_ROLE_KEY=your-service-role-key');
    process.exit(1);
  }

  console.log(`Connecting to Supabase at ${supabaseUrl}`);
  
  // Create Supabase client with service role key (has admin privileges)
  const supabase = createClient(supabaseUrl, supabaseKey);
  
  try {
    // Read the migration SQL file
    const migrationPath = path.join(__dirname, '../database/add-annex-support.sql');
    
    if (!fs.existsSync(migrationPath)) {
      console.error(`Error: Migration file not found at ${migrationPath}`);
      process.exit(1);
    }
    
    const migrationSQL = fs.readFileSync(migrationPath, 'utf8');
    
    console.log('Applying annex support migration to contratos table...');
    console.log('This will add the following columns:');
    console.log('  - is_anexo (BOOLEAN)');
    console.log('  - parent_contrato_id (UUID)');
    console.log('  - anexo_numero (INTEGER)');
    console.log('  - anexo_fecha (DATE)');
    console.log('  - numero_participantes (INTEGER)');
    console.log('  - nombre_ciclo (VARCHAR)');
    console.log('');
    
    // Split the SQL into individual statements and execute them one by one
    const statements = migrationSQL
      .split(';')
      .map(stmt => stmt.trim())
      .filter(stmt => stmt.length > 0 && !stmt.startsWith('--'));
    
    for (let i = 0; i < statements.length; i++) {
      const statement = statements[i];
      if (statement.length === 0) continue;
      
      console.log(`Executing statement ${i + 1}/${statements.length}...`);
      
      try {
        const { error } = await supabase.rpc('exec_sql', { 
          sql: statement + ';' 
        });
        
        if (error) {
          // Check if error is about column already existing
          if (error.message.includes('already exists')) {
            console.log(`⚠️  Column already exists, skipping: ${error.message}`);
            continue;
          }
          throw error;
        }
        
        console.log(`✅ Statement ${i + 1} executed successfully`);
      } catch (stmtError) {
        console.error(`❌ Error in statement ${i + 1}:`, stmtError.message);
        console.log(`Statement: ${statement}`);
        throw stmtError;
      }
    }
    
    console.log('\n✅ Annex migration applied successfully!');
    
    // Verify the columns were added
    console.log('Verifying columns were added...');
    
    // Try to select from the contratos table with the new columns
    const { data, error: selectError } = await supabase
      .from('contratos')
      .select('is_anexo, parent_contrato_id, anexo_numero, anexo_fecha, numero_participantes, nombre_ciclo')
      .limit(1);
    
    if (selectError) {
      console.warn(`Warning: Could not verify columns: ${selectError.message}`);
    } else {
      console.log('✅ Columns verified successfully!');
      console.log('Sample data:', data);
    }
    
    console.log('\n🎉 Annex support has been successfully added to the contratos table!');
    console.log('You can now:');
    console.log('  - Create annexes for existing contracts');
    console.log('  - Link annexes to parent contracts');
    console.log('  - Track annex numbers and dates');
    console.log('  - Specify participant numbers and cycle names');
    
  } catch (error) {
    console.error('Error applying annex migration:', error.message);
    process.exit(1);
  }
}

applyAnnexMigration();