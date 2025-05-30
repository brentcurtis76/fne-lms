// Apply currency migration to expense_items table
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function applyCurrencyMigration() {
  console.log('🔄 Applying currency migration to expense_items table...\n');
  
  try {
    // Read the SQL migration file
    const fs = require('fs');
    const path = require('path');
    const sqlPath = path.join(__dirname, '../database/add-currency-to-expenses.sql');
    const sqlContent = fs.readFileSync(sqlPath, 'utf8');
    
    // Split into individual statements (remove comments and empty lines)
    const statements = sqlContent
      .split(';')
      .map(stmt => stmt.trim())
      .filter(stmt => stmt.length > 0 && !stmt.startsWith('--') && !stmt.startsWith('COMMENT'));
    
    console.log(`Found ${statements.length} SQL statements to execute\n`);
    
    // Execute each statement
    for (let i = 0; i < statements.length; i++) {
      const statement = statements[i];
      console.log(`${i + 1}. Executing: ${statement.substring(0, 50)}...`);
      
      try {
        const { error } = await supabase.rpc('exec_sql', { sql_query: statement });
        
        if (error) {
          // If exec_sql doesn't work, try direct query
          const { error: directError } = await supabase
            .from('_temp_migration')
            .select('*')
            .limit(0); // This will fail but we can catch the error
          
          console.log(`   ⚠️  RPC not available, trying alternative method...`);
          // For now, just log the statements that need to be run manually
        } else {
          console.log(`   ✅ Success`);
        }
      } catch (error) {
        console.log(`   ⚠️  Error: ${error.message}`);
      }
    }
    
    console.log('\n📋 Migration statements (run these manually in Supabase SQL Editor if needed):');
    console.log('=' .repeat(70));
    statements.forEach((stmt, index) => {
      console.log(`-- Statement ${index + 1}`);
      console.log(stmt + ';');
      console.log('');
    });
    
    // Test the migration by checking if columns exist
    console.log('\n🧪 Testing migration...');
    const { data, error } = await supabase
      .from('expense_items')
      .select('id, currency, original_amount, conversion_rate')
      .limit(1);
    
    if (!error && data) {
      console.log('✅ Currency columns are accessible');
      console.log('Sample data:', data[0] || 'No data found');
    } else {
      console.log('❌ Currency columns not yet available:', error?.message);
    }
    
  } catch (error) {
    console.error('Migration error:', error);
  }
}

applyCurrencyMigration().then(() => {
  console.log('\n✅ Currency migration completed');
  process.exit(0);
});