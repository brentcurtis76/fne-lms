const fetch = require('node-fetch');

// Supabase configuration
const projectRef = 'sxlogxqzmarhqsblxmtj';
const serviceRoleKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InN4bG9neHF6bWFyaHFzYmx4bXRqIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc0NzMyMjIyMSwiZXhwIjoyMDYyODk4MjIxfQ.OiyMUeIoCc_mH7G5xZms1AhDyYM3jXqqIjccSL0JmWI';

async function createFeedbackPolicies() {
  console.log('🚀 Creating feedback storage policies via Supabase API...');
  
  const policies = [
    {
      name: 'Users can upload feedback screenshots',
      operation: 'INSERT',
      definition: `bucket_id = 'feedback-screenshots' AND (storage.foldername(name))[1] = 'feedback' AND (storage.foldername(name))[2] = auth.uid()::text`,
      check: `bucket_id = 'feedback-screenshots' AND (storage.foldername(name))[1] = 'feedback' AND (storage.foldername(name))[2] = auth.uid()::text`,
      roles: ['authenticated']
    },
    {
      name: 'Anyone can view feedback screenshots',
      operation: 'SELECT', 
      definition: `bucket_id = 'feedback-screenshots'`,
      check: null,
      roles: ['public']
    },
    {
      name: 'Users can update own feedback screenshots',
      operation: 'UPDATE',
      definition: `bucket_id = 'feedback-screenshots' AND (storage.foldername(name))[2] = auth.uid()::text`,
      check: null,
      roles: ['authenticated']
    },
    {
      name: 'Users can delete own feedback screenshots',
      operation: 'DELETE',
      definition: `bucket_id = 'feedback-screenshots' AND (storage.foldername(name))[2] = auth.uid()::text`,
      check: null,
      roles: ['authenticated']
    }
  ];
  
  try {
    for (const policy of policies) {
      console.log(`\n🔄 Creating policy: ${policy.name}...`);
      
      const response = await fetch(`https://api.supabase.com/v1/projects/${projectRef}/database/policies`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${serviceRoleKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          schema: 'storage',
          table: 'objects',
          name: policy.name,
          action: policy.operation.toLowerCase(),
          roles: policy.roles,
          definition: policy.definition,
          check: policy.check
        })
      });
      
      const result = await response.text();
      
      if (response.ok) {
        console.log(`✅ Policy "${policy.name}" created successfully`);
      } else {
        console.error(`❌ Error creating policy "${policy.name}":`, response.status, result);
      }
    }
    
    console.log('\n🎉 Feedback storage policies creation complete!');
    
  } catch (error) {
    console.error('💥 Error creating policies:', error);
  }
}

// Run the function
createFeedbackPolicies();