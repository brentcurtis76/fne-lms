#!/usr/bin/env node

/**
 * Create learning_path_assignments table using direct database connection
 */

const { Client } = require('pg');
require('dotenv').config({ path: '.env.local' });

// Extract database connection details from Supabase URL
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('Missing Supabase environment variables');
  process.exit(1);
}

// Parse the Supabase URL to get database connection details
const url = new URL(supabaseUrl);
const projectRef = url.hostname.split('.')[0];

// Construct PostgreSQL connection string
const connectionString = `postgresql://postgres:[password]@db.${projectRef}.supabase.co:5432/postgres`;

console.log('🔍 Attempting direct database connection...');
console.log('Project reference:', projectRef);

async function createTableDirect() {
  const client = new Client({
    connectionString: process.env.DATABASE_URL || connectionString,
    ssl: { rejectUnauthorized: false }
  });

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
    console.log('🔌 Connecting to database...');
    await client.connect();
    console.log('✅ Connected to database');

    console.log('🏗️ Creating table...');
    await client.query(createTableSQL);
    console.log('✅ Table created successfully');

    // Verify table creation
    console.log('🔍 Verifying table...');
    const result = await client.query("SELECT tablename FROM pg_tables WHERE tablename = 'learning_path_assignments'");
    
    if (result.rows.length > 0) {
      console.log('✅ learning_path_assignments table verified');
      
      // Check table structure
      const columns = await client.query(`
        SELECT column_name, data_type, is_nullable, column_default
        FROM information_schema.columns 
        WHERE table_name = 'learning_path_assignments'
        ORDER BY ordinal_position
      `);
      
      console.log('\n📋 Table structure:');
      columns.rows.forEach(col => {
        console.log(`  ${col.column_name}: ${col.data_type} ${col.is_nullable === 'NO' ? 'NOT NULL' : 'NULL'}`);
      });
      
    } else {
      console.log('❌ Table verification failed');
    }

  } catch (error) {
    console.error('❌ Error:', error.message);
    
    if (error.message.includes('password authentication failed') || error.message.includes('connection')) {
      console.log('\n📋 Manual steps required:');
      console.log('1. Go to Supabase Dashboard > SQL Editor');
      console.log('2. Run the following SQL:');
      console.log('='.repeat(60));
      console.log(createTableSQL);
      console.log('='.repeat(60));
    }
  } finally {
    await client.end();
  }
}

// Check if pg module is available
try {
  require.resolve('pg');
  createTableDirect();
} catch (e) {
  console.log('📦 Installing pg module...');
  const { execSync } = require('child_process');
  
  try {
    execSync('npm install pg', { stdio: 'inherit' });
    console.log('✅ pg module installed');
    
    // Re-require and run
    delete require.cache[require.resolve('pg')];
    createTableDirect();
  } catch (installError) {
    console.error('❌ Failed to install pg module:', installError.message);
    console.log('Please run: npm install pg');
  }
}