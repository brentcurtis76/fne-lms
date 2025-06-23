const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = 'https://sxlogxqzmarhqsblxmtj.supabase.co';
const supabaseServiceRoleKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InN4bG9neHF6bWFyaHFzYmx4bXRqIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc0NzMyMjIyMSwiZXhwIjoyMDYyODk4MjIxfQ.OiyMUeIoCc_mH7G5xZms1AhDyYM3jXqqIjccSL0JmWI';

const supabase = createClient(supabaseUrl, supabaseServiceRoleKey);

async function createFeedbackPolicies() {
  console.log('=== CREATING FEEDBACK STORAGE POLICIES ===\n');
  
  const policies = [
    {
      name: 'Users can upload feedback screenshots',
      sql: `CREATE POLICY "Users can upload feedback screenshots"
            ON storage.objects FOR INSERT
            WITH CHECK (
              bucket_id = 'feedback-screenshots' AND
              auth.uid() IS NOT NULL AND
              (storage.foldername(name))[1] = 'feedback' AND
              (storage.foldername(name))[2] = auth.uid()::text
            )`
    },
    {
      name: 'Anyone can view feedback screenshots',
      sql: `CREATE POLICY "Anyone can view feedback screenshots"
            ON storage.objects FOR SELECT
            USING (bucket_id = 'feedback-screenshots')`
    },
    {
      name: 'Users can update own feedback screenshots',
      sql: `CREATE POLICY "Users can update own feedback screenshots"
            ON storage.objects FOR UPDATE
            USING (
              bucket_id = 'feedback-screenshots' AND
              auth.uid()::text = (storage.foldername(name))[2]
            )`
    },
    {
      name: 'Users can delete own feedback screenshots',
      sql: `CREATE POLICY "Users can delete own feedback screenshots"
            ON storage.objects FOR DELETE
            USING (
              bucket_id = 'feedback-screenshots' AND
              auth.uid()::text = (storage.foldername(name))[2]
            )`
    }
  ];
  
  // First, try to drop existing policies
  console.log('1. Dropping existing policies (if any)...');
  for (const policy of policies) {
    const dropSql = `DROP POLICY IF EXISTS "${policy.name}" ON storage.objects`;
    try {
      const { error } = await supabase.rpc('exec_sql', { sql: dropSql });
      if (error) {
        console.log(`  Note: Could not drop policy "${policy.name}": ${error.message}`);
      } else {
        console.log(`  ✓ Dropped policy: ${policy.name}`);
      }
    } catch (err) {
      console.log(`  Note: Exception dropping policy "${policy.name}": ${err.message}`);
    }
  }
  
  // Create new policies
  console.log('\n2. Creating new policies...');
  for (const policy of policies) {
    try {
      const { error } = await supabase.rpc('exec_sql', { sql: policy.sql });
      if (error) {
        console.error(`  ✗ Error creating policy "${policy.name}":`, error);
      } else {
        console.log(`  ✓ Created policy: ${policy.name}`);
      }
    } catch (err) {
      console.error(`  ✗ Exception creating policy "${policy.name}":`, err);
    }
  }
  
  // Grant permissions
  console.log('\n3. Granting permissions...');
  const permissions = [
    'GRANT ALL ON storage.objects TO authenticated',
    'GRANT SELECT ON storage.objects TO anon'
  ];
  
  for (const permission of permissions) {
    try {
      const { error } = await supabase.rpc('exec_sql', { sql: permission });
      if (error) {
        console.error(`  ✗ Error granting permission: ${error.message}`);
      } else {
        console.log(`  ✓ Granted: ${permission}`);
      }
    } catch (err) {
      console.error(`  ✗ Exception granting permission:`, err.message);
    }
  }
  
  console.log('\n=== FEEDBACK POLICIES SETUP COMPLETE ===');
}

createFeedbackPolicies();