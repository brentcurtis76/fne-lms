/**
 * Find all database dependencies on schools table
 */

const { createClient } = require('@supabase/supabase-js');
const path = require('path');

// Load environment variables
require('dotenv').config({ path: path.join(process.cwd(), '.env.local') });

async function findDependencies() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  
  if (!supabaseUrl || !serviceKey) {
    throw new Error('Missing required environment variables');
  }
  
  const supabase = createClient(supabaseUrl, serviceKey);
  
  console.log('🔍 Finding all dependencies on schools table...\n');
  
  // Find all views that reference schools
  const { data: views, error: viewError } = await supabase.rpc('get_view_dependencies', {
    search_pattern: '%schools%'
  }).catch(() => ({ data: null, error: 'RPC not available' }));
  
  // Alternative: Direct SQL query
  const viewQuery = `
    SELECT 
      schemaname,
      viewname,
      definition
    FROM pg_views 
    WHERE schemaname = 'public'
    AND (definition LIKE '%schools%' OR definition LIKE '%school_id%')
    ORDER BY viewname;
  `;
  
  const { data: viewData, error: viewQueryError } = await supabase
    .from('pg_views')
    .select('*')
    .eq('schemaname', 'public')
    .or('definition.like.%schools%,definition.like.%school_id%')
    .catch(async () => {
      // Fallback to raw SQL
      const result = await fetch(`${supabaseUrl}/rest/v1/rpc`, {
        method: 'POST',
        headers: {
          'apikey': serviceKey,
          'Authorization': `Bearer ${serviceKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          query: viewQuery
        })
      }).then(r => r.json()).catch(() => null);
      
      return { data: result, error: null };
    });
  
  // List views found
  if (viewData || views) {
    const allViews = viewData || views || [];
    console.log(`📋 Found ${allViews.length} views that reference schools:\n`);
    allViews.forEach(v => {
      console.log(`  - ${v.viewname || v.table_name}`);
    });
  }
  
  // Find all foreign key constraints
  const fkQuery = `
    SELECT 
      tc.table_name,
      kcu.column_name,
      tc.constraint_name
    FROM information_schema.table_constraints AS tc 
    JOIN information_schema.key_column_usage AS kcu
      ON tc.constraint_name = kcu.constraint_name
      AND tc.table_schema = kcu.table_schema
    JOIN information_schema.constraint_column_usage AS ccu
      ON ccu.constraint_name = tc.constraint_name
      AND ccu.table_schema = tc.table_schema
    WHERE tc.constraint_type = 'FOREIGN KEY' 
      AND ccu.table_name = 'schools'
      AND ccu.column_name = 'id'
      AND tc.table_schema = 'public'
    ORDER BY tc.table_name;
  `;
  
  // Get tables info
  const { data: tables, error: tableError } = await supabase
    .from('information_schema.tables')
    .select('table_name')
    .eq('table_schema', 'public')
    .eq('table_type', 'BASE TABLE')
    .order('table_name');
  
  if (tables) {
    console.log(`\n📊 Found ${tables.length} tables in the schema`);
    
    // Check each table for school_id column
    const tablesWithSchoolId = [];
    for (const table of tables) {
      const { data: columns } = await supabase
        .from('information_schema.columns')
        .select('column_name, data_type')
        .eq('table_schema', 'public')
        .eq('table_name', table.table_name)
        .eq('column_name', 'school_id');
      
      if (columns && columns.length > 0) {
        tablesWithSchoolId.push({
          table: table.table_name,
          column_type: columns[0].data_type
        });
      }
    }
    
    console.log(`\n🔗 Tables with school_id column (${tablesWithSchoolId.length}):\n`);
    tablesWithSchoolId.forEach(t => {
      console.log(`  - ${t.table} (${t.column_type})`);
    });
  }
  
  // Generate the SQL to drop all views
  console.log('\n📝 SQL to drop all dependent views:');
  console.log('-- Drop views that depend on schools');
  if (viewData || views) {
    const allViews = viewData || views || [];
    allViews.forEach(v => {
      console.log(`DROP VIEW IF EXISTS public.${v.viewname || v.table_name} CASCADE;`);
    });
  }
}

// Run the dependency finder
findDependencies().catch(console.error);