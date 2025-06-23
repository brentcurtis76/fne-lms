const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function applyPasswordResetTracking() {
  console.log('Applying password reset tracking migration...\n');

  try {
    // Check if password_change_required column exists
    const { data: columns } = await supabase
      .rpc('get_table_columns', {
        table_name: 'profiles',
        schema_name: 'public'
      })
      .catch(() => ({ data: null }));

    const hasPasswordChangeRequired = columns?.some(col => col.column_name === 'password_change_required');

    if (hasPasswordChangeRequired) {
      console.log('✅ password_change_required column already exists');
    } else {
      console.log('❌ password_change_required column needs to be added');
      console.log('\nPlease run the following SQL in Supabase SQL Editor:');
      console.log('-------------------------------------------');
      console.log(`
-- Add password_change_required field to profiles table
ALTER TABLE profiles 
ADD COLUMN IF NOT EXISTS password_change_required BOOLEAN DEFAULT FALSE;

-- Create audit_logs table if it doesn't exist
CREATE TABLE IF NOT EXISTS audit_logs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  action VARCHAR(255) NOT NULL,
  details JSONB,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for faster queries
CREATE INDEX IF NOT EXISTS idx_audit_logs_user_id ON audit_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_action ON audit_logs(action);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON audit_logs(created_at);

-- Add RLS policies for audit_logs
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist
DROP POLICY IF EXISTS "Admins can read audit logs" ON audit_logs;
DROP POLICY IF EXISTS "System can insert audit logs" ON audit_logs;

-- Only admins can read audit logs
CREATE POLICY "Admins can read audit logs" ON audit_logs
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'admin'
    )
  );

-- System can insert audit logs
CREATE POLICY "System can insert audit logs" ON audit_logs
  FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- Add comments for documentation
COMMENT ON COLUMN profiles.password_change_required IS 'Flag to indicate if user must change password on next login';
COMMENT ON TABLE audit_logs IS 'System audit logs for tracking administrative actions';
      `);
      console.log('-------------------------------------------');
    }

    // Check if audit_logs table exists
    const { data: tables } = await supabase
      .rpc('get_tables', {
        schema_name: 'public'
      })
      .catch(() => ({ data: null }));

    const hasAuditLogs = tables?.some(table => table.table_name === 'audit_logs');

    if (hasAuditLogs) {
      console.log('✅ audit_logs table already exists');
    } else {
      console.log('❌ audit_logs table needs to be created');
    }

    console.log('\n✅ Migration check complete!');
    
  } catch (error) {
    console.error('Error checking migration status:', error);
  }
}

// Helper function to check if we can use rpc
async function checkRpcAvailable() {
  try {
    // Try a simple RPC call
    await supabase.rpc('get_tables', { schema_name: 'public' });
    return true;
  } catch (error) {
    // If RPC fails, we'll use a different approach
    return false;
  }
}

applyPasswordResetTracking();