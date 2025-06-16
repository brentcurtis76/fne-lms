const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('Missing required environment variables');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function checkIntegration() {
  console.log('Checking Schools-Clients Integration...\n');

  try {
    // Check if schools table has cliente_id column
    const { data: schoolsColumns, error: schoolsError } = await supabase
      .rpc('get_table_columns', { table_name: 'schools' });

    if (schoolsError) {
      console.error('Error checking schools columns:', schoolsError);
    } else {
      const hasClienteId = schoolsColumns?.some(col => col.column_name === 'cliente_id');
      console.log(`✓ Schools table has cliente_id column: ${hasClienteId ? 'YES' : 'NO'}`);
    }

    // Check if clientes table has school_id column
    const { data: clientesColumns, error: clientesError } = await supabase
      .rpc('get_table_columns', { table_name: 'clientes' });

    if (clientesError) {
      console.error('Error checking clientes columns:', clientesError);
    } else {
      const hasSchoolId = clientesColumns?.some(col => col.column_name === 'school_id');
      console.log(`✓ Clientes table has school_id column: ${hasSchoolId ? 'YES' : 'NO'}`);
    }

    // Check for any existing links
    const { data: schoolsWithClients, error: linkError } = await supabase
      .from('schools')
      .select('id, name, cliente_id')
      .not('cliente_id', 'is', null);

    if (!linkError) {
      console.log(`\n✓ Schools linked to clients: ${schoolsWithClients?.length || 0}`);
      if (schoolsWithClients && schoolsWithClients.length > 0) {
        console.log('\nLinked schools:');
        schoolsWithClients.forEach(school => {
          console.log(`  - ${school.name} (cliente_id: ${school.cliente_id})`);
        });
      }
    }

    // Check for any clients linked to schools
    const { data: clientsWithSchools, error: clientLinkError } = await supabase
      .from('clientes')
      .select('id, nombre_fantasia, school_id')
      .not('school_id', 'is', null);

    if (!clientLinkError) {
      console.log(`\n✓ Clients linked to schools: ${clientsWithSchools?.length || 0}`);
      if (clientsWithSchools && clientsWithSchools.length > 0) {
        console.log('\nLinked clients:');
        clientsWithSchools.forEach(client => {
          console.log(`  - ${client.nombre_fantasia} (school_id: ${client.school_id})`);
        });
      }
    }

  } catch (error) {
    console.error('Error checking integration:', error);
  }
}

// Add RPC function to get table columns
async function createHelperFunction() {
  const sql = `
    CREATE OR REPLACE FUNCTION get_table_columns(table_name text)
    RETURNS TABLE (
      column_name text,
      data_type text,
      is_nullable text
    ) AS $$
    BEGIN
      RETURN QUERY
      SELECT 
        c.column_name::text,
        c.data_type::text,
        c.is_nullable::text
      FROM information_schema.columns c
      WHERE c.table_schema = 'public' 
      AND c.table_name = get_table_columns.table_name;
    END;
    $$ LANGUAGE plpgsql SECURITY DEFINER;
  `;

  const { error } = await supabase.rpc('exec_sql', { sql });
  if (error && !error.message.includes('already exists')) {
    console.log('Note: Could not create helper function. Checking columns manually...');
  }
}

// Try a simpler approach if RPC doesn't work
async function checkIntegrationSimple() {
  console.log('\nChecking integration using simple queries...\n');

  try {
    // Try to select cliente_id from schools
    const { data: schoolTest, error: schoolError } = await supabase
      .from('schools')
      .select('id, cliente_id')
      .limit(1);

    if (schoolError && schoolError.message.includes('column')) {
      console.log('❌ Schools table does NOT have cliente_id column');
      console.log('   Run: node scripts/apply-schools-clients-integration.js');
    } else {
      console.log('✓ Schools table has cliente_id column');
    }

    // Try to select school_id from clientes
    const { data: clientTest, error: clientError } = await supabase
      .from('clientes')
      .select('id, school_id')
      .limit(1);

    if (clientError && clientError.message.includes('column')) {
      console.log('❌ Clientes table does NOT have school_id column');
      console.log('   Run: node scripts/apply-schools-clients-integration.js');
    } else {
      console.log('✓ Clientes table has school_id column');
    }

  } catch (error) {
    console.error('Error in simple check:', error);
  }
}

async function main() {
  await createHelperFunction();
  await checkIntegration();
  await checkIntegrationSimple();
}

main().catch(console.error);