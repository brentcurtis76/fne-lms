#!/usr/bin/env node

/**
 * Create learning_path_assignments table using Supabase REST API
 */

require('dotenv').config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('Missing Supabase environment variables');
  process.exit(1);
}

async function createTableViaAPI() {
  const createTableSQL = `
CREATE TABLE IF NOT EXISTS learning_path_assignments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    path_id UUID NOT NULL,
    user_id UUID NULL,
    group_id UUID NULL,
    assigned_by UUID NOT NULL,
    assigned_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    
    CONSTRAINT fk_learning_path_assignments_path_id 
        FOREIGN KEY (path_id) REFERENCES learning_paths(id) ON DELETE CASCADE,
    CONSTRAINT fk_learning_path_assignments_user_id 
        FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE,
    CONSTRAINT fk_learning_path_assignments_group_id 
        FOREIGN KEY (group_id) REFERENCES community_workspaces(id) ON DELETE CASCADE,
    CONSTRAINT fk_learning_path_assignments_assigned_by 
        FOREIGN KEY (assigned_by) REFERENCES profiles(id) ON DELETE SET NULL,
    
    CONSTRAINT learning_path_assignments_user_or_group_exclusive 
        CHECK ((user_id IS NOT NULL AND group_id IS NULL) OR (user_id IS NULL AND group_id IS NOT NULL)),
    CONSTRAINT learning_path_assignments_unique_user_path 
        UNIQUE (user_id, path_id),
    CONSTRAINT learning_path_assignments_unique_group_path 
        UNIQUE (group_id, path_id)
);

CREATE INDEX IF NOT EXISTS idx_learning_path_assignments_path_id ON learning_path_assignments(path_id);
CREATE INDEX IF NOT EXISTS idx_learning_path_assignments_user_id ON learning_path_assignments(user_id);
CREATE INDEX IF NOT EXISTS idx_learning_path_assignments_group_id ON learning_path_assignments(group_id);
CREATE INDEX IF NOT EXISTS idx_learning_path_assignments_assigned_by ON learning_path_assignments(assigned_by);
CREATE INDEX IF NOT EXISTS idx_learning_path_assignments_assigned_at ON learning_path_assignments(assigned_at);
  `.trim();

  console.log('🚀 Creating table via REST API...');

  try {
    // Try using edge functions or stored procedures
    const response = await fetch(`${supabaseUrl}/rest/v1/rpc/query`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': supabaseServiceKey,
        'Authorization': `Bearer ${supabaseServiceKey}`,
        'Prefer': 'return=minimal'
      },
      body: JSON.stringify({ 
        query: createTableSQL 
      })
    });

    if (response.ok) {
      console.log('✅ Table creation request sent successfully');
    } else {
      const errorText = await response.text();
      console.log('❌ REST API approach failed:', response.status, errorText);
    }

  } catch (error) {
    console.error('❌ REST API error:', error.message);
  }

  // Alternative: Try using built-in SQL execution
  try {
    console.log('\n🔄 Trying alternative SQL execution...');
    
    const { createClient } = require('@supabase/supabase-js');
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Try using a custom RPC if available
    const { error } = await supabase.rpc('execute_sql', { 
      sql_query: createTableSQL 
    });

    if (error) {
      console.log('❌ RPC approach failed:', error.message);
    } else {
      console.log('✅ RPC execution successful');
    }

  } catch (rpcError) {
    console.log('❌ RPC not available:', rpcError.message);
  }

  // Verify if table exists
  console.log('\n🔍 Checking if table was created...');
  
  try {
    const { createClient } = require('@supabase/supabase-js');
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { data, error } = await supabase
      .from('learning_path_assignments')
      .select('*')
      .limit(1);

    if (error) {
      if (error.message.includes('does not exist')) {
        console.log('❌ Table still does not exist');
        console.log('\n📋 MANUAL ACTION REQUIRED:');
        console.log('Please copy and run this SQL in the Supabase Dashboard > SQL Editor:');
        console.log('='.repeat(80));
        console.log(createTableSQL);
        console.log('='.repeat(80));
        console.log('\nThen rerun the E2E test script to verify the fix.');
      } else {
        console.log('❌ Verification error:', error.message);
      }
    } else {
      console.log('✅ Table exists and is accessible!');
      return true;
    }
  } catch (verifyError) {
    console.log('❌ Verification failed:', verifyError.message);
  }

  return false;
}

createTableViaAPI();