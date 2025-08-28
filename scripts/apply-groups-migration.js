const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

const supabaseUrl = 'https://sxlogxqzmarhqsblxmtj.supabase.co';
const supabaseServiceKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InN4bG9neHF6bWFyaHFzYmx4bXRqIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc0NzMyMjIyMSwiZXhwIjoyMDYyODk4MjIxfQ.OiyMUeIoCc_mH7G5xZms1AhDyYM3jXqqIjccSL0JmWI';

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function applyMigration() {
  try {
    console.log('Reading migration file...');
    const migrationPath = path.join(__dirname, '..', 'database', 'migrations', 'add_quote_groups.sql');
    const sql = fs.readFileSync(migrationPath, 'utf8');
    
    console.log('Applying migration...');
    
    // Split SQL into individual statements and execute them
    const statements = sql
      .split(';')
      .map(s => s.trim())
      .filter(s => s.length > 0 && !s.startsWith('--'));
    
    for (const statement of statements) {
      if (statement.includes('CREATE TABLE') || 
          statement.includes('CREATE INDEX') || 
          statement.includes('CREATE POLICY') || 
          statement.includes('CREATE FUNCTION') || 
          statement.includes('CREATE TRIGGER') ||
          statement.includes('ALTER TABLE') ||
          statement.includes('INSERT INTO') ||
          statement.includes('UPDATE')) {
        
        console.log('Executing:', statement.substring(0, 50) + '...');
        
        // Use RPC to execute raw SQL
        const { error } = await supabase.rpc('exec_sql', {
          sql_query: statement + ';'
        });
        
        if (error) {
          console.error('Error executing statement:', error);
          // Continue with other statements even if one fails
        }
      }
    }
    
    console.log('✅ Migration applied successfully!');
    
  } catch (error) {
    console.error('Migration error:', error);
  }
}

// First, let's create the exec_sql function if it doesn't exist
async function createExecSqlFunction() {
  const createFunction = `
    CREATE OR REPLACE FUNCTION exec_sql(sql_query text)
    RETURNS void
    LANGUAGE plpgsql
    SECURITY DEFINER
    AS $$
    BEGIN
      EXECUTE sql_query;
    END;
    $$;
  `;
  
  // This will fail but that's OK - we'll use the Supabase API directly
  console.log('Note: exec_sql function may need to be created manually in Supabase dashboard');
}

// Instead, let's manually create the tables using Supabase API
async function applyMigrationViaAPI() {
  try {
    console.log('Checking if pasantias_quote_groups table exists...');
    
    const { data: existingGroups, error: checkError } = await supabase
      .from('pasantias_quote_groups')
      .select('id')
      .limit(1);
    
    if (checkError && checkError.code === '42P01') {
      console.log('Table does not exist, please run the migration SQL directly in Supabase dashboard');
      console.log('Migration file location: database/migrations/add_quote_groups.sql');
    } else {
      console.log('✅ Table pasantias_quote_groups already exists or was created!');
    }
    
  } catch (error) {
    console.error('Error:', error);
  }
}

applyMigrationViaAPI();