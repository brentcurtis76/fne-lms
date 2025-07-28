/**
 * Direct test of the mention API endpoint to see debug logs
 */

require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function testMentionAPI() {
  console.log('🧪 Testing mention API directly...');
  
  try {
    // First, log in as a test user
    console.log('\n1. Logging in as test user...');
    const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
      email: 'brent@perrotuertocm.cl',
      password: 'NuevaEdu2025!'
    });
    
    if (authError) {
      console.error('❌ Auth error:', authError);
      return;
    }
    
    console.log('✅ Logged in as:', authData.user.email);
    
    // Get the session
    const { data: session } = await supabase.auth.getSession();
    console.log('✅ Session token:', session?.session?.access_token?.substring(0, 20) + '...');
    
    // Call the mention API
    console.log('\n2. Calling mention API...');
    const response = await fetch('http://127.0.0.1:3001/api/messaging/mention', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${session.session.access_token}`
      },
      body: JSON.stringify({
        mentioned_user_id: 'ca5efb9a-fac7-4741-b9b9-699694308ae8', // Tom Petty user ID
        context: 'community_post',
        discussion_id: null, // Use null instead of invalid UUID
        content: 'Hey @TestStudent, this is a test mention!'
      })
    });
    
    console.log('API Response status:', response.status);
    const responseData = await response.json();
    console.log('API Response data:', responseData);
    
    // Wait a moment for notification processing
    console.log('\n3. Waiting for notification processing...');
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    // Check if notification was created
    console.log('\n4. Checking for created notifications...');
    const { data: notifications, error: notError } = await supabase
      .from('user_notifications')
      .select('*')
      .eq('user_id', 'ca5efb9a-fac7-4741-b9b9-699694308ae8')
      .order('created_at', { ascending: false })
      .limit(5);
      
    if (notError) {
      console.error('❌ Error fetching notifications:', notError);
    } else {
      console.log(`✅ Found ${notifications?.length || 0} notifications for mentioned user:`, notifications);
    }
    
  } catch (error) {
    console.error('❌ Error in test:', error);
  }
}

// Run the test
testMentionAPI();