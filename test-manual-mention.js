/**
 * Manual test to create a post with mentions and verify notification creation
 * This simulates what happens in the E2E test
 */

const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = 'http://127.0.0.1:54321';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InN4bG9neHF6bWFyaHFzYmx4bXRqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDczMjIyMjEsImV4cCI6MjA2Mjg5ODIyMX0.J6YJpTDvW6vz7d-N0BkGsLIZY51h_raFPNIQfU5UE5E';

const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function testMentionNotification() {
  console.log('🧪 Testing mention notification creation...');
  
  try {
    // Step 1: Create a workspace and users (simplified)
    console.log('\n1. Setting up test data...');
    
    // For now, let's try to directly call the mention API endpoint
    console.log('\n2. Testing mention API endpoint directly...');
    
    // This simulates the fetch call from feedService.ts
    const response = await fetch('http://127.0.0.1:3000/api/messaging/mention', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer test-token' // This will fail, but let's see the error
      },
      body: JSON.stringify({
        mentioned_user_id: 'test-user-id',
        context: 'community_post',
        discussion_id: 'test-post-id',
        content: 'Test mention notification'
      })
    });
    
    console.log('API Response status:', response.status);
    const responseData = await response.json();
    console.log('API Response data:', responseData);
    
  } catch (error) {
    console.error('❌ Error in test:', error);
  }
}

// Run the test
testMentionNotification();