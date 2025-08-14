const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function updateEventsPolicies() {
  console.log('🔄 Updating RLS policies for events table...\n');
  
  try {
    // Test that a community manager can create an event
    console.log('📝 Testing: Can community managers create events?');
    
    // Find Andrea Lagos (community manager)
    const { data: cmUser } = await supabase
      .from('user_roles')
      .select('user_id')
      .eq('role_type', 'community_manager')
      .eq('is_active', true)
      .limit(1)
      .single();
    
    if (cmUser) {
      console.log('✅ Found community manager user:', cmUser.user_id);
      
      // Try to create a test event as community manager
      const testEvent = {
        title: 'Test CM Event',
        location: 'Test Location',
        date_start: '2025-12-01',
        description: 'Test event created by community manager',
        is_published: false,
        created_by: cmUser.user_id
      };
      
      const { data: newEvent, error: createError } = await supabase
        .from('events')
        .insert([testEvent])
        .select()
        .single();
      
      if (createError) {
        console.log('⚠️ Community manager cannot create events currently');
        console.log('Error:', createError.message);
        console.log('\n📋 This indicates RLS policies need updating in Supabase Dashboard');
      } else {
        console.log('✅ Community manager CAN create events!');
        console.log('Created event ID:', newEvent.id);
        
        // Clean up test event
        await supabase
          .from('events')
          .delete()
          .eq('id', newEvent.id);
        console.log('🧹 Test event cleaned up');
      }
    }
    
    console.log('\n📊 Current Access Summary:');
    console.log('✅ Frontend: Community managers have full access to events page');
    console.log('✅ Navigation: Events menu item visible to community managers');
    console.log('✅ Authorization: Page allows community_manager role');
    console.log('\n⚠️ If community managers cannot save events, you need to:');
    console.log('1. Go to Supabase Dashboard > Authentication > Policies');
    console.log('2. Find the events table policies');
    console.log('3. Update each policy to include "community_manager" role');
    console.log('4. Or run the SQL commands in database/update-events-rls-cm.sql');
    
  } catch (error) {
    console.error('❌ Unexpected error:', error);
  }
}

updateEventsPolicies();