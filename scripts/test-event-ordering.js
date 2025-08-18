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

async function testEventOrdering() {
  console.log('🔍 TESTING EVENT ORDERING LOGIC');
  console.log('================================\n');
  
  // Get current date info
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const todayEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
  
  console.log('📅 Current Date Information:');
  console.log('  Now:', now.toLocaleString());
  console.log('  Today Start:', todayStart.toLocaleString());
  console.log('  Today End:', todayEnd.toLocaleString());
  console.log('');

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

  console.log(`📊 Total events found: ${events.length}\n`);

  const pastEvents = [];
  const futureEvents = [];
  const todayEvents = [];

  // Process each event
  for (const event of events || []) {
    const eventStartDate = parseLocalDate(event.date_start);
    const eventEndDate = event.date_end ? parseLocalDate(event.date_end) : eventStartDate;
    
    console.log(`📌 Event: "${event.title.substring(0, 50)}..."`);
    console.log(`   Date Range: ${event.date_start} to ${event.date_end || event.date_start}`);
    console.log(`   Start Date Object: ${eventStartDate.toLocaleDateString()}`);
    console.log(`   End Date Object: ${eventEndDate.toLocaleDateString()}`);
    
    if (eventEndDate < todayStart) {
      console.log(`   → PAST (ended before today)`);
      pastEvents.push(event);
    } else if (eventStartDate > todayEnd) {
      console.log(`   → FUTURE (starts after today)`);
      futureEvents.push(event);
    } else {
      console.log(`   → TODAY/CURRENT (happening now or today)`);
      todayEvents.push(event);
      futureEvents.push(event); // Also add to future for "PRÓXIMO" display
    }
    console.log('');
  }

  console.log('\n📈 SUMMARY:');
  console.log(`  Past Events: ${pastEvents.length}`);
  console.log(`  Today's Events: ${todayEvents.length}`);
  console.log(`  Future Events (including today): ${futureEvents.length}`);
  
  // Check La Fontaine event specifically
  const laFontaine = events.find(e => e.title.includes('Fontaine'));
  if (laFontaine) {
    console.log('\n🎯 La Fontaine Event Status:');
    console.log(`  Title: ${laFontaine.title}`);
    console.log(`  Date: ${laFontaine.date_start}`);
    const lfDate = parseLocalDate(laFontaine.date_start);
    console.log(`  Parsed Date: ${lfDate.toLocaleDateString()}`);
    
    if (lfDate >= todayStart && lfDate <= todayEnd) {
      console.log(`  ✅ Status: TODAY'S EVENT - Should be marked as "PRÓXIMO"`);
    } else if (lfDate < todayStart) {
      console.log(`  ❌ Status: PAST EVENT - Should be "Finalizado"`);
    } else {
      console.log(`  📅 Status: FUTURE EVENT`);
    }
  }
  
  // Show what will be marked as "PRÓXIMO"
  if (futureEvents.length > 0) {
    console.log('\n🔥 Next Event (PRÓXIMO):');
    const next = futureEvents[0];
    console.log(`  Title: ${next.title}`);
    console.log(`  Date: ${next.date_start}`);
  }
}

testEventOrdering();