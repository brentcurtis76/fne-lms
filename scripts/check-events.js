const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function checkEvents() {
  try {
    console.log('Checking events in database...\n');
    
    // Check all events
    const { data: allEvents, error: allError } = await supabase
      .from('events')
      .select('*')
      .order('date_start', { ascending: false });
      
    if (allError) {
      console.error('Error fetching all events:', allError);
      return;
    }
    
    console.log(`Total events in database: ${allEvents?.length || 0}`);
    
    // Check published events
    const { data: publishedEvents, error: pubError } = await supabase
      .from('events')
      .select('*')
      .eq('is_published', true)
      .order('date_start', { ascending: false });
      
    if (pubError) {
      console.error('Error fetching published events:', pubError);
      return;
    }
    
    console.log(`Published events: ${publishedEvents?.length || 0}`);
    
    // Show details of events
    if (allEvents && allEvents.length > 0) {
      console.log('\nEvent details:');
      allEvents.forEach(event => {
        console.log(`\n- ${event.title}`);
        console.log(`  ID: ${event.id}`);
        console.log(`  Published: ${event.is_published}`);
        console.log(`  Date Start: ${event.date_start}`);
        console.log(`  Date End: ${event.date_end || 'N/A'}`);
        console.log(`  Location: ${event.location}`);
        console.log(`  Created: ${event.created_at}`);
      });
    } else {
      console.log('\nNo events found in database.');
    }
    
  } catch (error) {
    console.error('Unexpected error:', error);
  }
}

checkEvents();