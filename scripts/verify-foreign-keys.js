const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceRoleKey) {
  console.error('Missing Supabase environment variables');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceRoleKey);

async function verifyForeignKeys() {
  console.log('🔍 Verifying Foreign Key Relationships in Production Database\n');
  
  const query = `
    SELECT
        tc.constraint_name,
        tc.table_name,
        kcu.column_name,
        ccu.table_name AS foreign_table_name,
        ccu.column_name AS foreign_column_name,
        pg_catalog.pg_get_constraintdef(pgc.oid, true) as constraint_definition
    FROM
        information_schema.table_constraints AS tc
    JOIN information_schema.key_column_usage AS kcu
      ON tc.constraint_name = kcu.constraint_name
      AND tc.table_schema = kcu.table_schema
    JOIN information_schema.constraint_column_usage AS ccu
      ON ccu.constraint_name = tc.constraint_name
      AND ccu.table_schema = tc.table_schema
    JOIN pg_catalog.pg_constraint pgc
      ON pgc.conname = tc.constraint_name
      AND pgc.connamespace = (SELECT oid FROM pg_namespace WHERE nspname = tc.table_schema)
    WHERE tc.constraint_type = 'FOREIGN KEY'
      AND tc.table_name IN ('generations', 'communities', 'profiles')
      AND tc.table_schema = 'public'
    ORDER BY tc.table_name, tc.constraint_name;
  `;
  
  try {
    const { data, error } = await supabase.rpc('execute_sql', { query_text: query });
    
    if (error) {
      // If RPC doesn't exist, try direct query
      console.log('Direct RPC not available, using alternative method...\n');
      
      // Alternative: Query the database using Supabase client
      const { data: genFKs, error: genError } = await supabase
        .from('generations')
        .select('*')
        .limit(0); // Just to check the schema
        
      if (genError) {
        console.error('Error accessing generations table:', genError);
      }
      
      // Let's create a simpler query to check column types
      const checkQuery = `
        SELECT 
          c.table_name,
          c.column_name,
          c.data_type,
          c.udt_name,
          CASE 
            WHEN tc.constraint_type = 'FOREIGN KEY' THEN ccu.table_name || '.' || ccu.column_name
            ELSE NULL
          END as references_to
        FROM information_schema.columns c
        LEFT JOIN information_schema.key_column_usage kcu
          ON c.table_name = kcu.table_name 
          AND c.column_name = kcu.column_name
          AND c.table_schema = kcu.table_schema
        LEFT JOIN information_schema.table_constraints tc
          ON kcu.constraint_name = tc.constraint_name
          AND kcu.table_schema = tc.table_schema
          AND tc.constraint_type = 'FOREIGN KEY'
        LEFT JOIN information_schema.constraint_column_usage ccu
          ON ccu.constraint_name = tc.constraint_name
          AND ccu.table_schema = tc.table_schema
        WHERE c.table_schema = 'public'
          AND c.table_name IN ('schools', 'generations', 'communities', 'profiles')
          AND (c.column_name IN ('id', 'school_id', 'generation_id', 'community_id')
               OR tc.constraint_type = 'FOREIGN KEY')
        ORDER BY c.table_name, c.ordinal_position;
      `;
      
      // Try using a stored procedure approach
      console.log('Attempting to gather schema information through alternative methods...\n');
      
      // Check schools table
      console.log('=== SCHOOLS TABLE ===');
      const { data: schoolsData } = await supabase.from('schools').select('id').limit(1);
      console.log('Sample ID:', schoolsData?.[0]?.id, '(Type:', typeof schoolsData?.[0]?.id, ')');
      
      // Check generations table
      console.log('\n=== GENERATIONS TABLE ===');
      const { data: genData } = await supabase.from('generations').select('id, school_id').limit(1);
      console.log('Sample ID:', genData?.[0]?.id, '(Type:', typeof genData?.[0]?.id, ')');
      console.log('Sample school_id:', genData?.[0]?.school_id, '(Type:', typeof genData?.[0]?.school_id, ')');
      
      // Check communities table
      console.log('\n=== COMMUNITIES TABLE ===');
      const { data: commData } = await supabase.from('communities').select('id, school_id, generation_id').limit(1);
      console.log('Sample ID:', commData?.[0]?.id, '(Type:', typeof commData?.[0]?.id, ')');
      console.log('Sample school_id:', commData?.[0]?.school_id, '(Type:', typeof commData?.[0]?.school_id, ')');
      console.log('Sample generation_id:', commData?.[0]?.generation_id, '(Type:', typeof commData?.[0]?.generation_id, ')');
      
      // Check profiles table
      console.log('\n=== PROFILES TABLE ===');
      const { data: profData } = await supabase.from('profiles').select('id, school_id, generation_id, community_id').limit(1);
      console.log('Sample ID:', profData?.[0]?.id, '(Type:', typeof profData?.[0]?.id, ')');
      console.log('Sample school_id:', profData?.[0]?.school_id, '(Type:', typeof profData?.[0]?.school_id, ')');
      console.log('Sample generation_id:', profData?.[0]?.generation_id, '(Type:', typeof profData?.[0]?.generation_id, ')');
      console.log('Sample community_id:', profData?.[0]?.community_id, '(Type:', typeof profData?.[0]?.community_id, ')');
      
      return;
    }
    
    console.log('=== RAW QUERY OUTPUT ===\n');
    console.log(JSON.stringify(data, null, 2));
    
    console.log('\n=== FORMATTED RESULTS ===\n');
    if (data && data.length > 0) {
      data.forEach(row => {
        console.log(`Table: ${row.table_name}`);
        console.log(`  Constraint: ${row.constraint_name}`);
        console.log(`  Column: ${row.column_name}`);
        console.log(`  References: ${row.foreign_table_name}.${row.foreign_column_name}`);
        console.log(`  Definition: ${row.constraint_definition}`);
        console.log('---');
      });
    } else {
      console.log('No foreign key constraints found for the specified tables.');
    }
    
  } catch (err) {
    console.error('Error executing query:', err);
  }
}

verifyForeignKeys();