const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

const supabaseUrl = 'https://sxlogxqzmarhqsblxmtj.supabase.co';
const supabaseServiceRoleKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InN4bG9neHF6bWFyaHFzYmx4bXRqIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc0NzMyMjIyMSwiZXhwIjoyMDYyODk4MjIxfQ.OiyMUeIoCc_mH7G5xZms1AhDyYM3jXqqIjccSL0JmWI';

const supabase = createClient(supabaseUrl, supabaseServiceRoleKey);

async function applyFeedbackPolicies() {
  try {
    console.log('🚀 Starting feedback screenshots storage policies creation...');
    
    // Define the policies directly
    const policies = [
      {
        name: "Users can upload feedback screenshots",
        sql: `CREATE POLICY "Users can upload feedback screenshots" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'feedback-screenshots' AND (storage.foldername(name))[1] = 'feedback' AND (storage.foldername(name))[2] = auth.uid()::text)`
      },
      {
        name: "Anyone can view feedback screenshots", 
        sql: `CREATE POLICY "Anyone can view feedback screenshots" ON storage.objects FOR SELECT TO public USING (bucket_id = 'feedback-screenshots')`
      },
      {
        name: "Users can update own feedback screenshots",
        sql: `CREATE POLICY "Users can update own feedback screenshots" ON storage.objects FOR UPDATE TO authenticated USING (bucket_id = 'feedback-screenshots' AND (storage.foldername(name))[2] = auth.uid()::text)`
      },
      {
        name: "Users can delete own feedback screenshots",
        sql: `CREATE POLICY "Users can delete own feedback screenshots" ON storage.objects FOR DELETE TO authenticated USING (bucket_id = 'feedback-screenshots' AND (storage.foldername(name))[2] = auth.uid()::text)`
      }
    ];
    
    console.log(`📄 Creating ${policies.length} storage policies...`);
    
    // Execute each policy
    for (let i = 0; i < policies.length; i++) {
      const policy = policies[i];
      console.log(`\n🔄 Creating policy: ${policy.name}...`);
      
      const { data, error } = await supabase.rpc('exec_sql', {
        sql: policy.sql
      });
      
      if (error) {
        console.error(`❌ Error creating policy "${policy.name}":`, error);
        if (error.message.includes('already exists')) {
          console.log('⚠️  Policy already exists, continuing...');
          continue;
        }
        throw error;
      }
      
      console.log(`✅ Policy "${policy.name}" created successfully`);
    }
    
    console.log('\n🎉 All feedback screenshots storage policies created successfully!');
    
    // Verify policies were created
    console.log('\n🔍 Verifying policies...');
    const { data: verifyData, error: verifyError } = await supabase.rpc('exec_sql', {
      sql: `SELECT policyname as name, cmd as operation, roles FROM pg_policies WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname ILIKE '%feedback%' ORDER BY policyname`
    });
    
    if (verifyError) {
      console.error('❌ Error verifying policies:', verifyError);
    } else {
      console.log(`✅ Verification complete. Found policies:`);
      if (verifyData && verifyData.length > 0) {
        verifyData.forEach(policy => {
          console.log(`  - ${policy.name} (${policy.operation}) for ${policy.roles}`);
        });
      } else {
        console.log('  - No policies found in verification query');
      }
    }
    
  } catch (error) {
    console.error('💥 Error applying feedback policies:', error);
    process.exit(1);
  }
}

applyFeedbackPolicies();