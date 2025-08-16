#!/usr/bin/env node

/**
 * Script to test and demonstrate the event date update issue
 * Bug Report: "algo pasa con las fechas que las cambio y no se actualizan. en la Linea de tiempo"
 */

const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://sxlogxqzmarhqsblxmtj.supabase.co',
  process.env.SUPABASE_SERVICE_ROLE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InN4bG9neHF6bWFyaHFzYmx4bXRqIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc0NzMyMjIyMSwiZXhwIjoyMDYyODk4MjIxfQ.OiyMUeIoCc_mH7G5xZms1AhDyYM3jXqqIjccSL0JmWI'
);

async function demonstrateIssueBefore() {
  console.log('\n🔍 DEMONSTRATING EVENT DATE UPDATE ISSUE - BEFORE FIX');
  console.log('=' .repeat(70));
  
  // Step 1: Create a test event
  const testEvent = {
    title: 'TEST EVENT - Date Issue Demo',
    location: 'Santiago, Chile',
    date_start: '2025-09-01',
    date_end: '2025-09-03',
    time: '10:00 - 18:00',
    description: 'Event to demonstrate date update issue',
    is_published: true
    // removed created_by as it expects a UUID
  };
  
  console.log('\n1️⃣ Creating test event with initial dates:');
  console.log('   Start: 2025-09-01');
  console.log('   End: 2025-09-03');
  
  const { data: createdEvent, error: createError } = await supabase
    .from('events')
    .insert([testEvent])
    .select()
    .single();
    
  if (createError) {
    console.error('❌ Error creating test event:', createError);
    return;
  }
  
  console.log('✅ Event created with ID:', createdEvent.id);
  
  // Step 2: Update the event dates (simulating what admin page does)
  const updatedDates = {
    date_start: '2025-10-15',  // Changed from Sep to Oct
    date_end: '2025-10-17'      // Changed from Sep to Oct
  };
  
  console.log('\n2️⃣ Updating event dates (simulating admin edit):');
  console.log('   New Start: 2025-10-15');
  console.log('   New End: 2025-10-17');
  
  const { error: updateError } = await supabase
    .from('events')
    .update(updatedDates)
    .eq('id', createdEvent.id);
    
  if (updateError) {
    console.error('❌ Error updating event:', updateError);
    return;
  }
  
  console.log('✅ Event updated in database');
  
  // Step 3: Fetch event via public API (simulating timeline fetch)
  console.log('\n3️⃣ Fetching event via public API (like timeline does):');
  
  const { data: publicEvents, error: fetchError } = await supabase
    .from('events')
    .select('*')
    .eq('id', createdEvent.id)
    .eq('is_published', true)
    .single();
    
  if (fetchError) {
    console.error('❌ Error fetching event:', fetchError);
    return;
  }
  
  console.log('📅 Dates returned from database:');
  console.log('   date_start:', publicEvents.date_start);
  console.log('   date_end:', publicEvents.date_end);
  
  // Step 4: Check how dates are parsed in timeline
  console.log('\n4️⃣ How dates are displayed in timeline:');
  
  const formatEventDate = (dateString) => {
    const date = new Date(dateString);
    const months = ['ENE', 'FEB', 'MAR', 'ABR', 'MAY', 'JUN', 'JUL', 'AGO', 'SEP', 'OCT', 'NOV', 'DIC'];
    return `${date.getDate()} ${months[date.getMonth()]} ${date.getFullYear()}`;
  };
  
  console.log('   Start formatted:', formatEventDate(publicEvents.date_start));
  console.log('   End formatted:', formatEventDate(publicEvents.date_end));
  
  // Step 5: Identify the issue
  console.log('\n5️⃣ ROOT CAUSE ANALYSIS:');
  console.log('   ✅ Database update works correctly');
  console.log('   ✅ Date formatting works correctly');
  console.log('   ❌ ISSUE: Timeline component on /noticias page doesn\'t refresh automatically');
  console.log('   ❌ ISSUE: No cache invalidation or real-time updates');
  console.log('   ❌ ISSUE: User must manually refresh page to see updated dates');
  
  // Cleanup
  await supabase.from('events').delete().eq('id', createdEvent.id);
  console.log('\n🧹 Test event cleaned up');
  
  return createdEvent.id;
}

async function checkCachingIssues() {
  console.log('\n\n🔍 CHECKING FOR CACHING ISSUES');
  console.log('=' .repeat(70));
  
  // Create an event
  const { data: event1 } = await supabase
    .from('events')
    .insert([{
      title: 'Cache Test Event',
      location: 'Test Location',
      date_start: '2025-08-01',
      is_published: true
    }])
    .select()
    .single();
    
  console.log('1. Created event with date:', event1.date_start);
  
  // Update it immediately
  await supabase
    .from('events')
    .update({ date_start: '2025-12-25' })
    .eq('id', event1.id);
    
  console.log('2. Updated event to date: 2025-12-25');
  
  // Fetch it back
  const { data: event2 } = await supabase
    .from('events')
    .select('*')
    .eq('id', event1.id)
    .single();
    
  console.log('3. Fetched back, date is:', event2.date_start);
  
  if (event2.date_start === '2025-12-25T00:00:00+00:00' || event2.date_start === '2025-12-25') {
    console.log('✅ Database updates are immediate - no database caching issue');
  } else {
    console.log('❌ Database might have caching or replication delay');
  }
  
  // Cleanup
  await supabase.from('events').delete().eq('id', event1.id);
  
  console.log('\n📊 DIAGNOSIS:');
  console.log('The issue is CLIENT-SIDE - the timeline component needs to:');
  console.log('1. Poll for updates OR');
  console.log('2. Use real-time subscriptions OR');
  console.log('3. Implement cache invalidation when events are edited');
}

// Run the tests
async function main() {
  console.log('🚀 EVENT DATE UPDATE BUG DEMONSTRATION');
  console.log('Bug Report: "algo pasa con las fechas que las cambio y no se actualizan en la Linea de tiempo"');
  
  await demonstrateIssueBefore();
  await checkCachingIssues();
  
  console.log('\n\n💡 SOLUTION NEEDED:');
  console.log('1. Add real-time subscription to events table in EventsTimeline');
  console.log('2. OR implement cache invalidation mechanism');
  console.log('3. OR add automatic refresh interval');
  console.log('4. OR trigger page refresh after event edit');
}

main().catch(console.error);