const { createClient } = require('@supabase/supabase-js');
const fs = require('fs').promises;
const path = require('path');

// Initialize Supabase client
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://sxlogxqzmarhqsblxmtj.supabase.co';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InN4bG9neHF6bWFyaHFzYmx4bXRqIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc0NzMyMjIyMSwiZXhwIjoyMDYyODk4MjIxfQ.OiyMUeIoCc_mH7G5xZms1AhDyYM3jXqqIjccSL0JmWI';

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function extractSchema() {
  console.log('Extracting database schema...\n');
  
  let schemaSQL = '-- Genera Database Schema\n';
  schemaSQL += '-- Generated on: ' + new Date().toISOString() + '\n\n';
  
  try {
    // 1. Get all tables
    console.log('Fetching tables...');
    const { data: tables, error: tablesError } = await supabase
      .rpc('get_tables_info');
    
    if (tablesError) {
      // Fallback to direct query
      const { data: tableData, error } = await supabase
        .from('information_schema.tables')
        .select('table_name')
        .eq('table_schema', 'public')
        .eq('table_type', 'BASE TABLE')
        .order('table_name');
      
      if (error) throw error;
      
      console.log(`Found ${tableData.length} tables\n`);
      
      // 2. For each table, get columns and constraints
      for (const table of tableData) {
        console.log(`Processing table: ${table.table_name}`);
        
        // Get columns
        const { data: columns, error: columnsError } = await supabase
          .from('information_schema.columns')
          .select('*')
          .eq('table_schema', 'public')
          .eq('table_name', table.table_name)
          .order('ordinal_position');
        
        if (columnsError) {
          console.error(`Error fetching columns for ${table.table_name}:`, columnsError);
          continue;
        }
        
        // Build CREATE TABLE statement
        schemaSQL += `-- Table: ${table.table_name}\n`;
        schemaSQL += `CREATE TABLE IF NOT EXISTS public.${table.table_name} (\n`;
        
        const columnDefs = columns.map((col, index) => {
          let def = `    ${col.column_name} ${col.data_type}`;
          
          // Add length/precision
          if (col.character_maximum_length) {
            def += `(${col.character_maximum_length})`;
          } else if (col.numeric_precision && col.numeric_scale !== null) {
            def += `(${col.numeric_precision},${col.numeric_scale})`;
          }
          
          // Add NOT NULL
          if (col.is_nullable === 'NO') {
            def += ' NOT NULL';
          }
          
          // Add DEFAULT
          if (col.column_default) {
            def += ` DEFAULT ${col.column_default}`;
          }
          
          return def + (index < columns.length - 1 ? ',' : '');
        });
        
        schemaSQL += columnDefs.join('\n') + '\n);\n\n';
      }
    }
    
    // Save to file
    const outputPath = path.join(process.cwd(), 'database', 'initial-schema-basic.sql');
    await fs.mkdir(path.dirname(outputPath), { recursive: true });
    await fs.writeFile(outputPath, schemaSQL);
    
    console.log(`\nSchema extracted successfully to: ${outputPath}`);
    console.log(`Total size: ${(schemaSQL.length / 1024).toFixed(2)} KB`);
    
  } catch (error) {
    console.error('Error extracting schema:', error);
    process.exit(1);
  }
}

// Run the extraction
extractSchema().catch(console.error);