const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY  // Use anon key to test public access
);

async function testEventsAPI() {
  console.log('🔍 Testing Events API...\n');
  
  try {
    // Test 1: Fetch all published events (public access)
    console.log('📋 Test 1: Fetching published events (public access)');
    const { data: publishedEvents, error: pubError } = await supabase
      .from('events')
      .select('*')
      .eq('is_published', true)
      .order('date_start', { ascending: true });
    
    if (pubError) {
      console.error('❌ Error fetching published events:', pubError);
    } else {
      console.log(`✅ Found ${publishedEvents.length} published events`);
      
      // Separate into past and future
      const now = new Date();
      const pastEvents = [];
      const futureEvents = [];
      
      publishedEvents.forEach(event => {
        const eventEndDate = event.date_end ? new Date(event.date_end) : new Date(event.date_start);
        if (eventEndDate < now) {
          pastEvents.push(event);
        } else {
          futureEvents.push(event);
        }
      });
      
      console.log(`  - Past events: ${pastEvents.length}`);
      console.log(`  - Future events: ${futureEvents.length}`);
      
      console.log('\n📅 Past Events:');
      pastEvents.forEach(event => {
        console.log(`  • ${event.title} (${event.date_start}) - ${event.location}`);
      });
      
      console.log('\n🔮 Future Events:');
      futureEvents.forEach(event => {
        console.log(`  • ${event.title} (${event.date_start}) - ${event.location}`);
      });
    }
    
    // Test 2: Try the public API endpoint
    console.log('\n📋 Test 2: Testing /api/public/events endpoint');
    const response = await fetch('http://localhost:3000/api/public/events');
    
    if (response.ok) {
      const data = await response.json();
      console.log('✅ API endpoint working!');
      console.log(`  - Past events from API: ${data.pastEvents?.length || 0}`);
      console.log(`  - Future events from API: ${data.futureEvents?.length || 0}`);
    } else {
      console.log('❌ API endpoint returned error:', response.status);
    }
    
  } catch (error) {
    console.error('❌ Unexpected error:', error);
  }
}

testEventsAPI();