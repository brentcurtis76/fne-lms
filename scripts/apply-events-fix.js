const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function applyEventsFix() {
  try {
    console.log('Applying events public access fix...\n');
    
    // Read the SQL file
    const sqlPath = path.join(__dirname, '..', 'database', 'migrations', 'fix_events_public_access.sql');
    const sql = fs.readFileSync(sqlPath, 'utf8');
    
    console.log('SQL to execute:');
    console.log(sql);
    console.log('\nExecuting...');
    
    // Execute the SQL
    const { data, error } = await supabase.rpc('exec_sql', { sql_query: sql });
    
    if (error) {
      // Try alternative approach - execute statements one by one
      console.log('Batch execution failed, trying individual statements...');
      
      const statements = sql
        .split(';')
        .map(s => s.trim())
        .filter(s => s.length > 0 && !s.startsWith('--'));
      
      for (const statement of statements) {
        console.log(`\nExecuting: ${statement.substring(0, 50)}...`);
        const { error: stmtError } = await supabase.rpc('exec_sql', { 
          sql_query: statement + ';' 
        });
        
        if (stmtError) {
          console.error('Statement error:', stmtError.message);
          // Continue with other statements
        } else {
          console.log('Statement executed successfully');
        }
      }
    } else {
      console.log('Migration applied successfully!');
    }
    
    // Test the fix
    console.log('\n--- Testing the fix ---');
    const anonSupabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    );
    
    const { data: testData, error: testError } = await anonSupabase
      .from('events')
      .select('id, title')
      .eq('is_published', true)
      .limit(2);
      
    if (testError) {
      console.error('Test failed:', testError.message);
      console.log('\nThe fix may not have been applied correctly.');
    } else {
      console.log('Test successful! Anonymous users can now access events.');
      console.log('Sample events:', testData.map(e => e.title).join(', '));
    }
    
  } catch (error) {
    console.error('Unexpected error:', error);
  }
}

applyEventsFix();