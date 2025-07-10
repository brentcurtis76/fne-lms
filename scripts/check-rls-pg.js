import pg from 'pg';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const { Client } = pg;

// Parse the Supabase URL to get connection details
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const projectRef = supabaseUrl.match(/https:\/\/(\w+)\.supabase\.co/)[1];

// Construct the direct database URL
const databaseUrl = `postgresql://postgres.${projectRef}:${process.env.SUPABASE_SERVICE_ROLE_KEY}@aws-0-us-west-1.pooler.supabase.com:6543/postgres`;

const client = new Client({
  connectionString: databaseUrl,
  ssl: { rejectUnauthorized: false }
});

async function checkRLSPolicies() {
  try {
    await client.connect();
    console.log('Connected to database successfully\n');

    // Query 1: Tables with RLS enabled
    console.log('=== Tables with Row Level Security enabled ===\n');
    const rlsResult = await client.query(`
      SELECT schemaname, tablename, rowsecurity 
      FROM pg_tables 
      WHERE schemaname = 'public' 
      AND rowsecurity = true
      ORDER BY tablename
    `);
    
    console.log(`Found ${rlsResult.rows.length} tables with RLS enabled:`);
    rlsResult.rows.forEach(row => {
      console.log(`  - ${row.tablename}`);
    });

    // Query 2: Policies with legacy references
    console.log('\n\n=== Policies with legacy profiles.role references ===\n');
    const policiesResult = await client.query(`
      SELECT 
          tablename, 
          policyname,
          cmd,
          roles,
          qual,
          with_check
      FROM pg_policies 
      WHERE schemaname = 'public'
      AND (qual LIKE '%profiles.role%' OR with_check LIKE '%profiles.role%')
      ORDER BY tablename, policyname
    `);

    if (policiesResult.rows.length === 0) {
      console.log('✅ No policies found with legacy profiles.role references!');
    } else {
      console.log(`⚠️  Found ${policiesResult.rows.length} policies with legacy references:\n`);
      
      policiesResult.rows.forEach(policy => {
        console.log(`Table: ${policy.tablename}`);
        console.log(`Policy: ${policy.policyname}`);
        console.log(`Command: ${policy.cmd}`);
        console.log(`Roles: ${policy.roles}`);
        
        if (policy.qual && policy.qual.includes('profiles.role')) {
          console.log(`QUAL contains legacy reference:`);
          console.log(`  ${policy.qual}`);
        }
        
        if (policy.with_check && policy.with_check.includes('profiles.role')) {
          console.log(`WITH CHECK contains legacy reference:`);
          console.log(`  ${policy.with_check}`);
        }
        
        console.log('---\n');
      });
    }

    // Query 3: Functions with legacy references
    console.log('\n=== Functions with legacy profiles.role references ===\n');
    const functionsResult = await client.query(`
      SELECT 
          p.proname as function_name,
          pg_get_functiondef(p.oid) as function_definition
      FROM pg_proc p
      JOIN pg_namespace n ON p.pronamespace = n.oid
      WHERE n.nspname = 'public'
      AND pg_get_functiondef(p.oid) LIKE '%profiles.role%'
      ORDER BY p.proname
    `);

    if (functionsResult.rows.length === 0) {
      console.log('✅ No functions found with legacy profiles.role references!');
    } else {
      console.log(`⚠️  Found ${functionsResult.rows.length} functions with legacy references:`);
      functionsResult.rows.forEach(func => {
        console.log(`  - ${func.function_name}`);
      });
    }

    // Summary
    console.log('\n\n=== Summary ===');
    console.log(`Total policies with legacy references: ${policiesResult.rows.length}`);
    console.log(`Total functions with legacy references: ${functionsResult.rows.length}`);

  } catch (error) {
    console.error('Error:', error);
  } finally {
    await client.end();
    console.log('\n✓ Check complete');
  }
}

checkRLSPolicies();