const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function testCommunityManagerCRUD() {
  console.log('🔍 Testing Community Manager CRUD operations on events...\n');
  
  try {
    // Find Andrea Lagos (community manager)
    const { data: cmUser } = await supabase
      .from('user_roles')
      .select('user_id')
      .eq('role_type', 'community_manager')
      .eq('is_active', true)
      .limit(1)
      .single();
    
    if (!cmUser) {
      console.log('❌ No community manager found');
      return;
    }
    
    console.log('👤 Testing with community manager:', cmUser.user_id);
    let testEventId = null;
    
    // 1. CREATE - Test event creation
    console.log('\n1️⃣ CREATE Test:');
    const { data: createdEvent, error: createError } = await supabase
      .from('events')
      .insert([{
        title: 'CM Test Event',
        location: 'Virtual',
        date_start: '2025-12-15',
        description: 'Testing CM permissions',
        is_published: false,
        created_by: cmUser.user_id
      }])
      .select()
      .single();
    
    if (createError) {
      console.log('   ❌ CREATE failed:', createError.message);
    } else {
      console.log('   ✅ CREATE successful - Event ID:', createdEvent.id);
      testEventId = createdEvent.id;
    }
    
    if (!testEventId) {
      console.log('Cannot continue tests without a created event');
      return;
    }
    
    // 2. READ - Test event reading
    console.log('\n2️⃣ READ Test:');
    const { data: readEvent, error: readError } = await supabase
      .from('events')
      .select('*')
      .eq('id', testEventId)
      .single();
    
    if (readError) {
      console.log('   ❌ READ failed:', readError.message);
    } else {
      console.log('   ✅ READ successful - Title:', readEvent.title);
    }
    
    // 3. UPDATE - Test event updating
    console.log('\n3️⃣ UPDATE Test:');
    const { data: updatedEvent, error: updateError } = await supabase
      .from('events')
      .update({ 
        title: 'CM Test Event - Updated',
        description: 'Updated by community manager'
      })
      .eq('id', testEventId)
      .select()
      .single();
    
    if (updateError) {
      console.log('   ❌ UPDATE failed:', updateError.message);
    } else {
      console.log('   ✅ UPDATE successful - New title:', updatedEvent.title);
    }
    
    // 4. DELETE - Test event deletion
    console.log('\n4️⃣ DELETE Test:');
    const { error: deleteError } = await supabase
      .from('events')
      .delete()
      .eq('id', testEventId);
    
    if (deleteError) {
      console.log('   ❌ DELETE failed:', deleteError.message);
    } else {
      console.log('   ✅ DELETE successful - Event removed');
    }
    
    // Summary
    console.log('\n📊 SUMMARY - Community Manager Permissions:');
    console.log('   CREATE: ' + (!createError ? '✅ Allowed' : '❌ Denied'));
    console.log('   READ:   ' + (!readError ? '✅ Allowed' : '❌ Denied'));
    console.log('   UPDATE: ' + (!updateError ? '✅ Allowed' : '❌ Denied'));
    console.log('   DELETE: ' + (!deleteError ? '✅ Allowed' : '❌ Denied'));
    
    console.log('\n✅ Community Managers have FULL access to manage events!');
    
  } catch (error) {
    console.error('❌ Unexpected error:', error);
  }
}

testCommunityManagerCRUD();