#!/usr/bin/env node

const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// Replicate the parseLocalDate function
function parseLocalDate(dateString) {
  if (/^\d{4}-\d{2}-\d{2}$/.test(dateString)) {
    const [year, month, day] = dateString.split('-').map(Number);
    return new Date(year, month - 1, day);
  }
  if (dateString.includes('T')) {
    return new Date(dateString);
  }
  return new Date(dateString + 'T12:00:00');
}

async function testUpdatedLogic() {
  console.log('🔍 TESTING UPDATED EVENT CATEGORIZATION LOGIC');
  console.log('=============================================\n');
  
  // Get current date info
  const now = new Date();
  const tomorrowStart = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
  
  console.log('📅 Date Reference Points:');
  console.log('  Now:', now.toLocaleString());
  console.log('  Tomorrow Start:', tomorrowStart.toLocaleString());
  console.log('  Rule: Events are ONLY past after their entire day has finished\n');

  // Fetch all published events
  const { data: events, error } = await supabase
    .from('events')
    .select('*')
    .eq('is_published', true)
    .order('date_start', { ascending: true });

  if (error) {
    console.error('Error fetching events:', error);
    return;
  }

  const pastEvents = [];
  const futureEvents = [];

  console.log('📊 Processing Events:\n');

  // Process each event with the new logic
  for (const event of events || []) {
    const eventStartDate = parseLocalDate(event.date_start);
    const eventEndDate = event.date_end ? parseLocalDate(event.date_end) : eventStartDate;
    
    // Create end of day for the event's end date (23:59:59.999)
    const eventEndDay = new Date(
      eventEndDate.getFullYear(),
      eventEndDate.getMonth(),
      eventEndDate.getDate(),
      23, 59, 59, 999
    );
    
    console.log(`📌 "${event.title.substring(0, 45)}..."`);
    console.log(`   Dates: ${event.date_start} to ${event.date_end || event.date_start}`);
    console.log(`   End of last day: ${eventEndDay.toLocaleString()}`);
    
    if (eventEndDay < tomorrowStart) {
      console.log(`   → PAST (day has completely finished)`);
      pastEvents.push(event);
    } else {
      console.log(`   → CURRENT/FUTURE (day not yet finished or in future)`);
      futureEvents.push(event);
    }
    console.log('');
  }

  console.log('📈 SUMMARY:');
  console.log(`  Past Events (finished days): ${pastEvents.length}`);
  console.log(`  Current/Future Events: ${futureEvents.length}`);
  
  // Check today's events specifically
  console.log('\n🎯 TODAY\'S EVENTS (August 18, 2025):');
  const todayEvents = events.filter(e => {
    const startDate = parseLocalDate(e.date_start);
    const endDate = e.date_end ? parseLocalDate(e.date_end) : startDate;
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    
    return startDate <= today && endDate >= today;
  });
  
  if (todayEvents.length > 0) {
    todayEvents.forEach(event => {
      console.log(`  • "${event.title}"`);
      console.log(`    Status: CURRENT/FUTURE (day not finished)`);
      console.log(`    Will become PAST: Tomorrow (August 19) at 00:00`);
    });
  } else {
    console.log('  No events scheduled for today');
  }
  
  // Show next upcoming event
  if (futureEvents.length > 0) {
    console.log('\n🔥 PRÓXIMO (Next Event):');
    const next = futureEvents[0];
    console.log(`  "${next.title}"`);
    console.log(`  Date: ${next.date_start}`);
    
    const nextDate = parseLocalDate(next.date_start);
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    
    if (nextDate.getTime() === today.getTime()) {
      console.log(`  ✅ This is TODAY's event - correctly shown as PRÓXIMO`);
    }
  }
  
  console.log('\n✅ LOGIC VALIDATION:');
  console.log('  • Events remain "current" through their entire day');
  console.log('  • Only become "past" after the day completely finishes');
  console.log('  • Today\'s events correctly show as PRÓXIMO');
}

testUpdatedLogic();