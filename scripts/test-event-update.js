#!/usr/bin/env node

const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function testEventUpdate() {
  console.log('🔍 Testing event update functionality...\n');

  try {
    // 1. Fetch first event to test
    const { data: events, error: fetchError } = await supabase
      .from('events')
      .select('*')
      .limit(1)
      .order('created_at', { ascending: false });

    if (fetchError) {
      console.error('❌ Error fetching events:', fetchError);
      return;
    }

    if (!events || events.length === 0) {
      console.log('⚠️ No events found to test. Creating a test event...');
      
      // Create a test event
      const { data: newEvent, error: createError } = await supabase
        .from('events')
        .insert([{
          title: 'Test Event for Update',
          location: 'Test Location',
          date_start: new Date().toISOString(),
          is_published: true
        }])
        .select()
        .single();

      if (createError) {
        console.error('❌ Error creating test event:', createError);
        return;
      }

      console.log('✅ Test event created:', newEvent.id);
      events[0] = newEvent;
    }

    const testEvent = events[0];
    console.log('📝 Testing with event:', {
      id: testEvent.id,
      title: testEvent.title
    });

    // 2. Prepare update data
    const updateData = {
      title: testEvent.title + ' - UPDATED ' + new Date().getTime(),
      location: testEvent.location + ' - UPDATED',
      description: 'Updated at ' + new Date().toISOString()
    };

    console.log('\n📤 Attempting update with data:', updateData);

    // 3. Perform update
    const { data: updateResult, error: updateError } = await supabase
      .from('events')
      .update(updateData)
      .eq('id', testEvent.id)
      .select();

    if (updateError) {
      console.error('❌ Update error:', updateError);
      return;
    }

    console.log('✅ Update response:', updateResult);

    // 4. Verify the update by fetching again
    const { data: verifyData, error: verifyError } = await supabase
      .from('events')
      .select('*')
      .eq('id', testEvent.id)
      .single();

    if (verifyError) {
      console.error('❌ Verification error:', verifyError);
      return;
    }

    // 5. Compare values
    console.log('\n🔍 Verification:');
    console.log('Expected title:', updateData.title);
    console.log('Actual title:', verifyData.title);
    console.log('Match:', verifyData.title === updateData.title ? '✅' : '❌');
    
    console.log('\nExpected location:', updateData.location);
    console.log('Actual location:', verifyData.location);
    console.log('Match:', verifyData.location === updateData.location ? '✅' : '❌');

    if (verifyData.title === updateData.title && verifyData.location === updateData.location) {
      console.log('\n✅ Database update is working correctly!');
    } else {
      console.log('\n❌ Database update did not persist the changes!');
    }

    // 6. Check for RLS policies
    console.log('\n🔒 Checking RLS policies...');
    const { data: policies, error: policyError } = await supabase
      .rpc('get_policies_for_table', { table_name: 'events' })
      .catch(() => null);

    if (policies) {
      console.log('RLS Policies found:', policies);
    }

  } catch (error) {
    console.error('❌ Unexpected error:', error);
  }
}

testEventUpdate();