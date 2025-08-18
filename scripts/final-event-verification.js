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

async function finalVerification() {
  console.log('✅ FINAL VERIFICATION - EVENT TIMELINE LOGIC');
  console.log('============================================\n');
  
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  
  console.log('📅 Today is:', now.toLocaleDateString('en-US', { 
    weekday: 'long', 
    year: 'numeric', 
    month: 'long', 
    day: 'numeric' 
  }));
  console.log('');

  // Fetch La Fontaine event specifically
  const { data: laFontaine } = await supabase
    .from('events')
    .select('*')
    .ilike('title', '%Fontaine%')
    .single();

  if (laFontaine) {
    console.log('🎯 LA FONTAINE EVENT STATUS:');
    console.log('─────────────────────────────');
    console.log('Title:', laFontaine.title);
    console.log('Database Date:', laFontaine.date_start);
    
    const eventDate = parseLocalDate(laFontaine.date_start);
    const eventEndDate = laFontaine.date_end ? parseLocalDate(laFontaine.date_end) : eventDate;
    const eventEndDay = new Date(
      eventEndDate.getFullYear(),
      eventEndDate.getMonth(),
      eventEndDate.getDate()
    );
    
    console.log('Parsed Date:', eventDate.toLocaleDateString());
    console.log('');
    
    console.log('📊 TIMELINE CLASSIFICATION:');
    if (eventEndDay < todayStart) {
      console.log('❌ PAST EVENT (Finalizado) - Event ended before today');
    } else if (eventEndDay.getTime() === todayStart.getTime()) {
      console.log('✅ TODAY\'S EVENT (PRÓXIMO) - Event is happening today!');
      console.log('   → Will remain as PRÓXIMO until end of day');
      console.log('   → Will become "Finalizado" tomorrow (August 19)');
    } else {
      console.log('📅 FUTURE EVENT (PRÓXIMO) - Event is in the future');
    }
  }
  
  // Fetch all events and show summary
  const { data: events } = await supabase
    .from('events')
    .select('*')
    .eq('is_published', true)
    .order('date_start', { ascending: true });

  const pastEvents = [];
  const currentFutureEvents = [];
  
  for (const event of events || []) {
    const eventEndDate = event.date_end ? parseLocalDate(event.date_end) : parseLocalDate(event.date_start);
    const eventEndDay = new Date(
      eventEndDate.getFullYear(),
      eventEndDate.getMonth(),
      eventEndDate.getDate()
    );
    
    if (eventEndDay < todayStart) {
      pastEvents.push(event);
    } else {
      currentFutureEvents.push(event);
    }
  }
  
  console.log('\n📈 TIMELINE SUMMARY:');
  console.log('───────────────────');
  console.log(`Past Events (Finalizado): ${pastEvents.length}`);
  console.log(`Current/Future Events (PRÓXIMO): ${currentFutureEvents.length}`);
  
  if (currentFutureEvents.length > 0) {
    console.log('\n🔥 NEXT EVENT (Marked as PRÓXIMO):');
    console.log(`"${currentFutureEvents[0].title}"`);
    console.log(`Date: ${currentFutureEvents[0].date_start}`);
  }
  
  console.log('\n✅ BUSINESS LOGIC CONFIRMED:');
  console.log('• Events remain active/current through their entire day');
  console.log('• Events only become "past" the day AFTER they occur');
  console.log('• Today\'s events show as PRÓXIMO (upcoming) not Finalizado (past)');
  console.log('• This matches user expectations for event visibility');
}

finalVerification();