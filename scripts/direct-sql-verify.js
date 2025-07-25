const { Client } = require('pg');
require('dotenv').config({ path: '.env.local' });

const connectionString = process.env.DATABASE_CONNECTION_URI;

if (!connectionString) {
  console.error('Missing DATABASE_CONNECTION_URI in environment variables');
  process.exit(1);
}

async function verifyForeignKeys() {
  const client = new Client({
    connectionString: connectionString,
    ssl: {
      rejectUnauthorized: false
    }
  });

  try {
    await client.connect();
    console.log('✅ Connected to production database\n');

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

    console.log('=== RAW QUERY OUTPUT ===\n');
    const result = await client.query(query);
    
    // Print raw output
    console.log(JSON.stringify(result.rows, null, 2));
    
    console.log('\n=== FORMATTED RESULTS ===\n');
    result.rows.forEach(row => {
      console.log(`Table: ${row.table_name}`);
      console.log(`  Constraint: ${row.constraint_name}`);
      console.log(`  Column: ${row.column_name}`);
      console.log(`  References: ${row.foreign_table_name}.${row.foreign_column_name}`);
      console.log(`  Definition: ${row.constraint_definition}`);
      console.log('---');
    });

    // Also check column data types
    console.log('\n=== COLUMN DATA TYPES ===\n');
    const typeQuery = `
      SELECT 
        table_name,
        column_name,
        data_type,
        udt_name
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name IN ('schools', 'generations', 'communities', 'profiles')
        AND column_name IN ('id', 'school_id', 'generation_id', 'community_id')
      ORDER BY table_name, column_name;
    `;
    
    const typeResult = await client.query(typeQuery);
    console.log('Table.Column → Data Type');
    console.log('========================');
    typeResult.rows.forEach(row => {
      console.log(`${row.table_name}.${row.column_name} → ${row.data_type} (${row.udt_name})`);
    });

  } catch (error) {
    console.error('Error:', error.message);
  } finally {
    await client.end();
    console.log('\n✅ Connection closed');
  }
}

verifyForeignKeys();