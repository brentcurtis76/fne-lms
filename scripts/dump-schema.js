const pg = require('pg');
const fs = require('fs').promises;
const path = require('path');

// Database connection
const connectionString = `postgresql://postgres.sxlogxqzmarhqsblxmtj:${process.env.SUPABASE_DB_PASSWORD || 'your-password-here'}@aws-0-us-east-2.pooler.supabase.com:6543/postgres`;

async function dumpSchema() {
  const client = new pg.Client({
    connectionString,
    ssl: { rejectUnauthorized: false }
  });

  try {
    await client.connect();
    console.log('Connected to database...\n');

    let schemaSQL = '-- FNE LMS Database Schema\n';
    schemaSQL += '-- Generated on: ' + new Date().toISOString() + '\n\n';

    // 1. Get all tables
    const tablesQuery = `
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      AND table_type = 'BASE TABLE'
      ORDER BY table_name;
    `;
    
    const { rows: tables } = await client.query(tablesQuery);
    console.log(`Found ${tables.length} tables\n`);

    // 2. For each table, get complete DDL
    for (const table of tables) {
      console.log(`Processing table: ${table.table_name}`);
      
      // Get columns
      const columnsQuery = `
        SELECT 
          column_name,
          data_type,
          character_maximum_length,
          numeric_precision,
          numeric_scale,
          is_nullable,
          column_default,
          is_identity,
          identity_generation
        FROM information_schema.columns
        WHERE table_schema = 'public' 
        AND table_name = $1
        ORDER BY ordinal_position;
      `;
      
      const { rows: columns } = await client.query(columnsQuery, [table.table_name]);
      
      // Get constraints
      const constraintsQuery = `
        SELECT 
          tc.constraint_name,
          tc.constraint_type,
          kcu.column_name,
          ccu.table_name AS foreign_table_name,
          ccu.column_name AS foreign_column_name
        FROM information_schema.table_constraints tc
        JOIN information_schema.key_column_usage kcu
          ON tc.constraint_name = kcu.constraint_name
          AND tc.table_schema = kcu.table_schema
        LEFT JOIN information_schema.constraint_column_usage ccu
          ON ccu.constraint_name = tc.constraint_name
          AND ccu.table_schema = tc.table_schema
        WHERE tc.table_schema = 'public'
        AND tc.table_name = $1;
      `;
      
      const { rows: constraints } = await client.query(constraintsQuery, [table.table_name]);
      
      // Build CREATE TABLE statement
      schemaSQL += `-- Table: ${table.table_name}\n`;
      schemaSQL += `CREATE TABLE IF NOT EXISTS public.${table.table_name} (\n`;
      
      // Add columns
      const columnDefs = columns.map((col, index) => {
        let def = `    ${col.column_name} `;
        
        // Handle data type
        if (col.data_type === 'character varying') {
          def += `varchar${col.character_maximum_length ? `(${col.character_maximum_length})` : ''}`;
        } else if (col.data_type === 'numeric' && col.numeric_precision) {
          def += `numeric(${col.numeric_precision},${col.numeric_scale || 0})`;
        } else if (col.data_type === 'USER-DEFINED') {
          // Handle custom types like enums
          def += 'text'; // Fallback for now
        } else {
          def += col.data_type;
        }
        
        // Add constraints
        if (col.is_nullable === 'NO') {
          def += ' NOT NULL';
        }
        
        if (col.column_default) {
          def += ` DEFAULT ${col.column_default}`;
        }
        
        if (col.is_identity === 'YES') {
          def += ` GENERATED ${col.identity_generation} AS IDENTITY`;
        }
        
        return def;
      });
      
      schemaSQL += columnDefs.join(',\n');
      
      // Add primary key and unique constraints
      const pkConstraints = constraints.filter(c => c.constraint_type === 'PRIMARY KEY');
      const uniqueConstraints = constraints.filter(c => c.constraint_type === 'UNIQUE');
      
      if (pkConstraints.length > 0) {
        const pkColumns = pkConstraints.map(c => c.column_name).join(', ');
        schemaSQL += `,\n    CONSTRAINT ${pkConstraints[0].constraint_name} PRIMARY KEY (${pkColumns})`;
      }
      
      uniqueConstraints.forEach(uc => {
        schemaSQL += `,\n    CONSTRAINT ${uc.constraint_name} UNIQUE (${uc.column_name})`;
      });
      
      schemaSQL += '\n);\n\n';
      
      // Add foreign key constraints
      const fkConstraints = constraints.filter(c => c.constraint_type === 'FOREIGN KEY');
      fkConstraints.forEach(fk => {
        schemaSQL += `ALTER TABLE public.${table.table_name} ADD CONSTRAINT ${fk.constraint_name} `;
        schemaSQL += `FOREIGN KEY (${fk.column_name}) REFERENCES public.${fk.foreign_table_name}(${fk.foreign_column_name});\n`;
      });
      
      if (fkConstraints.length > 0) {
        schemaSQL += '\n';
      }
    }
    
    // 3. Get indexes
    console.log('\nFetching indexes...');
    const indexesQuery = `
      SELECT 
        schemaname,
        tablename,
        indexname,
        indexdef
      FROM pg_indexes
      WHERE schemaname = 'public'
      AND indexname NOT LIKE '%_pkey'
      ORDER BY tablename, indexname;
    `;
    
    const { rows: indexes } = await client.query(indexesQuery);
    
    if (indexes.length > 0) {
      schemaSQL += '-- Indexes\n';
      indexes.forEach(idx => {
        schemaSQL += `${idx.indexdef};\n`;
      });
      schemaSQL += '\n';
    }
    
    // 4. Get functions
    console.log('Fetching functions...');
    const functionsQuery = `
      SELECT 
        proname AS function_name,
        pg_get_functiondef(oid) AS function_def
      FROM pg_proc
      WHERE pronamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public')
      ORDER BY proname;
    `;
    
    const { rows: functions } = await client.query(functionsQuery);
    
    if (functions.length > 0) {
      schemaSQL += '-- Functions\n';
      functions.forEach(func => {
        schemaSQL += `${func.function_def};\n\n`;
      });
    }
    
    // 5. Get RLS policies
    console.log('Fetching RLS policies...');
    const policiesQuery = `
      SELECT 
        schemaname,
        tablename,
        policyname,
        permissive,
        roles,
        cmd,
        qual,
        with_check
      FROM pg_policies
      WHERE schemaname = 'public'
      ORDER BY tablename, policyname;
    `;
    
    const { rows: policies } = await client.query(policiesQuery);
    
    if (policies.length > 0) {
      schemaSQL += '-- Row Level Security Policies\n';
      let currentTable = '';
      
      policies.forEach(policy => {
        if (currentTable !== policy.tablename) {
          currentTable = policy.tablename;
          schemaSQL += `\n-- Enable RLS on ${policy.tablename}\n`;
          schemaSQL += `ALTER TABLE public.${policy.tablename} ENABLE ROW LEVEL SECURITY;\n\n`;
        }
        
        schemaSQL += `CREATE POLICY "${policy.policyname}" ON public.${policy.tablename}\n`;
        schemaSQL += `    AS ${policy.permissive ? 'PERMISSIVE' : 'RESTRICTIVE'}\n`;
        schemaSQL += `    FOR ${policy.cmd}\n`;
        schemaSQL += `    TO ${policy.roles.join(', ')}\n`;
        if (policy.qual) {
          schemaSQL += `    USING (${policy.qual})\n`;
        }
        if (policy.with_check) {
          schemaSQL += `    WITH CHECK (${policy.with_check})\n`;
        }
        schemaSQL += ';\n\n';
      });
    }
    
    // Save to file
    const outputPath = path.join(process.cwd(), 'database', 'complete-schema.sql');
    await fs.mkdir(path.dirname(outputPath), { recursive: true });
    await fs.writeFile(outputPath, schemaSQL);
    
    console.log(`\nSchema dumped successfully to: ${outputPath}`);
    console.log(`Total size: ${(schemaSQL.length / 1024).toFixed(2)} KB`);
    
  } catch (error) {
    console.error('Error dumping schema:', error);
    process.exit(1);
  } finally {
    await client.end();
  }
}

// Check if password is provided
if (!process.env.SUPABASE_DB_PASSWORD) {
  console.error('Please set SUPABASE_DB_PASSWORD environment variable');
  console.error('You can find it at: https://supabase.com/dashboard/project/sxlogxqzmarhqsblxmtj/settings/database');
  process.exit(1);
}

// Run the dump
dumpSchema().catch(console.error);