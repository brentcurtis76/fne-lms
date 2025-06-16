const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

// Use the service role key for database modifications
const supabaseUrl = 'https://sxlogxqzmarhqsblxmtj.supabase.co';
const supabaseServiceRoleKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InN4bG9neHF6bWFyaHFzYmx4bXRqIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc0NzMyMjIyMSwiZXhwIjoyMDYyODk4MjIxfQ.OiyMUeIoCc_mH7G5xZms1AhDyYM3jXqqIjccSL0JmWI';

const supabase = createClient(supabaseUrl, supabaseServiceRoleKey);

async function applySchoolsClientsIntegration() {
  try {
    console.log('Starting schools-clients integration...\n');
    
    // Read the SQL file
    const sqlPath = path.join(__dirname, '..', 'database', 'integrate-schools-clients.sql');
    const sqlContent = fs.readFileSync(sqlPath, 'utf8');
    
    // Split SQL into individual statements
    const statements = sqlContent
      .split(/;(?=\s*(?:--|CREATE|ALTER|DROP|INSERT|UPDATE|DELETE|$))/i)
      .map(s => s.trim())
      .filter(s => s.length > 0 && !s.startsWith('--'));
    
    console.log(`Found ${statements.length} SQL statements to execute\n`);
    
    let successCount = 0;
    let errorCount = 0;
    
    for (let i = 0; i < statements.length; i++) {
      const statement = statements[i] + ';';
      const firstLine = statement.split('\n')[0].substring(0, 50);
      
      try {
        // For ALTER TABLE statements, we need to check if column already exists
        if (statement.includes('ALTER TABLE') && statement.includes('ADD COLUMN')) {
          // Extract table and column name
          const tableMatch = statement.match(/ALTER TABLE (\w+)/i);
          const columnMatch = statement.match(/ADD COLUMN IF NOT EXISTS (\w+)/i);
          
          if (tableMatch && columnMatch) {
            const tableName = tableMatch[1];
            const columnName = columnMatch[1];
            
            // Check if column exists
            const { data: testData, error: testError } = await supabase
              .from(tableName)
              .select(columnName)
              .limit(1);
            
            if (!testError || !testError.message.includes('column')) {
              console.log(`✓ Column ${columnName} already exists in ${tableName}`);
              successCount++;
              continue;
            }
          }
        }
        
        // Since Supabase doesn't have exec_sql, we'll output the SQL for manual execution
        console.log(`Statement ${i + 1}: ${firstLine}...`);
        console.log('  (Needs manual execution in Supabase SQL Editor)');
        
      } catch (error) {
        console.error(`✗ Error with statement ${i + 1}: ${error.message}`);
        errorCount++;
      }
    }
    
    console.log('\n' + '='.repeat(70));
    console.log('IMPORTANT: Schools-Clients Integration SQL needs to be run manually!');
    console.log('='.repeat(70));
    console.log('\n1. Go to your Supabase dashboard');
    console.log('2. Navigate to SQL Editor');
    console.log('3. Create a new query');
    console.log('4. Copy and paste the following SQL:');
    console.log('\n' + '='.repeat(70) + '\n');
    
    // Output the full SQL for manual execution
    console.log(sqlContent);
    
    console.log('\n' + '='.repeat(70));
    console.log('5. Click "Run" to execute the SQL');
    console.log('6. The integration will be complete!');
    console.log('='.repeat(70) + '\n');
    
  } catch (error) {
    console.error('Error reading SQL file:', error);
  }
}

// Run the integration
applySchoolsClientsIntegration();