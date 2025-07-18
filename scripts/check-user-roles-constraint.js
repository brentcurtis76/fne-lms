const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function checkConstraint() {
  console.log('Checking user_roles constraint...\n');
  
  // Get constraint definition
  let constraints, error;
  try {
    const result = await supabase.rpc('get_table_constraints', { table_name: 'user_roles' });
    constraints = result.data;
    error = result.error;
  } catch (e) {
    constraints = null;
    error = 'RPC not found';
  }
  
  if (error || !constraints) {
    console.log('Could not fetch constraints via RPC, trying direct query...');
    
    // Try a direct SQL query
    const { data: sqlResult, error: sqlError } = await supabase
      .rpc('query', { 
        sql: `
          SELECT 
            conname as constraint_name,
            pg_get_constraintdef(oid) as definition
          FROM pg_constraint 
          WHERE conrelid = 'user_roles'::regclass
          AND contype = 'c'
          ORDER BY conname;
        ` 
      })
      ;
    
    if (sqlError || !sqlResult) {
      // Last resort - check table structure
      console.log('Fetching table structure...');
      const { data: columns, error: colError } = await supabase
        .from('user_roles')
        .select('*')
        .limit(0);
      
      console.log('Table columns:', Object.keys(columns || {}));
      
      // Try to insert a test record to see what constraint fails
      console.log('\nTesting constraint by attempting inserts...');
      
      // Test 1: Admin without school (should pass)
      const { error: adminError } = await supabase
        .from('user_roles')
        .insert({
          user_id: '00000000-0000-0000-0000-000000000000',
          role_type: 'admin'
        });
      console.log('Admin without school:', adminError ? `FAILED - ${adminError.message}` : 'PASSED');
      
      // Test 2: Docente without school (should fail)
      const { error: docenteError } = await supabase
        .from('user_roles')
        .insert({
          user_id: '00000000-0000-0000-0000-000000000001',
          role_type: 'docente'
        });
      console.log('Docente without school:', docenteError ? `FAILED - ${docenteError.message}` : 'PASSED');
      
      // Clean up test records
      await supabase
        .from('user_roles')
        .delete()
        .in('user_id', ['00000000-0000-0000-0000-000000000000', '00000000-0000-0000-0000-000000000001']);
      
    } else {
      console.log('Constraints on user_roles table:');
      sqlResult.forEach(row => {
        console.log(`\n${row.constraint_name}:`);
        console.log(row.definition);
      });
    }
  } else {
    console.log('Constraints:', constraints);
  }
  
  // Also check role types
  let roleTypes, roleError;
  try {
    const result = await supabase.rpc('get_enum_values', { enum_name: 'user_role_type' });
    roleTypes = result.data;
    roleError = result.error;
  } catch (e) {
    roleTypes = null;
    roleError = 'Could not fetch enum values';
  }
  
  if (roleTypes) {
    console.log('\nAvailable role types:', roleTypes);
  } else {
    // Try to get role types another way
    const { data: sampleRole } = await supabase
      .from('user_roles')
      .select('role_type')
      .limit(1)
      .single();
    
    console.log('\nSample role type from table:', sampleRole?.role_type);
  }
}

checkConstraint().catch(console.error);