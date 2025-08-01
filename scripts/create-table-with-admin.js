#!/usr/bin/env node

/**
 * Create learning_path_assignments table using admin client
 */

const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('Missing Supabase environment variables');
  process.exit(1);
}

// Create admin client
const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
});

async function createTable() {
  console.log('🚀 Creating learning_path_assignments table...');
  
  const createTableSQL = `
-- Create learning_path_assignments table
CREATE TABLE IF NOT EXISTS learning_path_assignments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    path_id UUID NOT NULL,
    user_id UUID NULL,
    group_id UUID NULL,
    assigned_by UUID NOT NULL,
    assigned_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    
    -- Foreign key constraints
    CONSTRAINT fk_learning_path_assignments_path_id 
        FOREIGN KEY (path_id) REFERENCES learning_paths(id) ON DELETE CASCADE,
    CONSTRAINT fk_learning_path_assignments_user_id 
        FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE,
    CONSTRAINT fk_learning_path_assignments_group_id 
        FOREIGN KEY (group_id) REFERENCES community_workspaces(id) ON DELETE CASCADE,
    CONSTRAINT fk_learning_path_assignments_assigned_by 
        FOREIGN KEY (assigned_by) REFERENCES profiles(id) ON DELETE SET NULL,
    
    -- Business logic constraints
    CONSTRAINT learning_path_assignments_user_or_group_exclusive 
        CHECK ((user_id IS NOT NULL AND group_id IS NULL) OR (user_id IS NULL AND group_id IS NOT NULL)),
    CONSTRAINT learning_path_assignments_unique_user_path 
        UNIQUE (user_id, path_id),
    CONSTRAINT learning_path_assignments_unique_group_path 
        UNIQUE (group_id, path_id)
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_learning_path_assignments_path_id ON learning_path_assignments(path_id);
CREATE INDEX IF NOT EXISTS idx_learning_path_assignments_user_id ON learning_path_assignments(user_id);
CREATE INDEX IF NOT EXISTS idx_learning_path_assignments_group_id ON learning_path_assignments(group_id);
CREATE INDEX IF NOT EXISTS idx_learning_path_assignments_assigned_by ON learning_path_assignments(assigned_by);
CREATE INDEX IF NOT EXISTS idx_learning_path_assignments_assigned_at ON learning_path_assignments(assigned_at);
  `;

  try {
    // Split the SQL into individual statements and execute each
    const statements = createTableSQL
      .split(';')
      .map(stmt => stmt.trim())
      .filter(stmt => stmt.length > 0 && !stmt.startsWith('--'));

    for (const statement of statements) {
      console.log(`Executing: ${statement.substring(0, 50)}...`);
      
      const { error } = await supabase.rpc('exec_sql', { 
        sql: statement + ';' 
      });
      
      if (error) {
        console.error('Error executing statement:', error);
        // Try alternative method for DDL statements
        console.log('Trying alternative approach...');
        
        // For CREATE TABLE, we'll use a different approach
        if (statement.includes('CREATE TABLE')) {
          // We'll need to use direct PostgreSQL connection or admin API
          console.log('Please run this SQL manually in Supabase dashboard:');
          console.log(statement + ';');
        }
      } else {
        console.log('✅ Statement executed successfully');
      }
    }

    // Verify table was created
    console.log('\n🔍 Verifying table creation...');
    const { data, error } = await supabase
      .from('learning_path_assignments')
      .select('*')
      .limit(1);

    if (error) {
      console.error('❌ Table verification failed:', error.message);
      
      if (error.message.includes('relation "public.learning_path_assignments" does not exist')) {
        console.log('\n📋 Manual SQL to run in Supabase SQL Editor:');
        console.log('='.repeat(60));
        console.log(createTableSQL);
        console.log('='.repeat(60));
      }
    } else {
      console.log('✅ learning_path_assignments table created successfully!');
    }

  } catch (err) {
    console.error('❌ Unexpected error:', err);
  }
}

createTable();