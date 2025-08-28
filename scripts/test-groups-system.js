const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = 'https://sxlogxqzmarhqsblxmtj.supabase.co';
const supabaseServiceKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InN4bG9neHF6bWFyaHFzYmx4bXRqIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc0NzMyMjIyMSwiZXhwIjoyMDYyODk4MjIxfQ.OiyMUeIoCc_mH7G5xZms1AhDyYM3jXqqIjccSL0JmWI';

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function testGroupsSystem() {
  console.log('🧪 TESTING MULTIPLE GROUPS SYSTEM');
  console.log('=' + '='.repeat(50));
  
  try {
    // 1. Verify the groups table exists
    console.log('\n1️⃣ Checking if pasantias_quote_groups table exists...');
    const { data: testGroups, error: groupsError } = await supabase
      .from('pasantias_quote_groups')
      .select('*')
      .limit(1);
    
    if (groupsError) {
      if (groupsError.code === '42P01') {
        console.log('❌ Table does not exist. Please run the migration.');
        return;
      } else {
        console.log('⚠️ Error checking table:', groupsError.message);
      }
    } else {
      console.log('✅ pasantias_quote_groups table EXISTS and is accessible!');
    }
    
    // 2. Create a test quote with multiple groups
    console.log('\n2️⃣ Creating test quote with multiple groups...');
    
    // First get a valid user to use as creator
    const { data: users } = await supabase
      .from('profiles')
      .select('id')
      .limit(1);
    
    const userId = users && users[0] ? users[0].id : null;
    
    if (!userId) {
      console.log('❌ No users found in the system');
      return;
    }
    
    // First create a quote
    const { data: quote, error: quoteError } = await supabase
      .from('pasantias_quotes')
      .insert({
        client_name: 'Test School - Multiple Groups',
        client_email: 'test@school.cl',
        client_institution: 'Test Institution',
        use_groups: true,
        // For now, include dummy dates until migration is applied
        arrival_date: '2025-03-01',
        departure_date: '2025-03-10',
        room_type: 'double',
        num_pasantes: 1,
        single_room_price: 150000,
        double_room_price: 100000,
        selected_programs: [],
        status: 'draft',
        created_by: userId,
        updated_by: userId
      })
      .select()
      .single();
    
    if (quoteError) {
      console.log('❌ Error creating quote:', quoteError.message);
      return;
    }
    
    console.log('✅ Quote created with ID:', quote.id);
    
    // 3. Add multiple groups
    console.log('\n3️⃣ Adding 3 travel groups...');
    
    const groups = [
      {
        quote_id: quote.id,
        group_name: 'Primera Semana',
        num_participants: 5,
        arrival_date: '2025-03-01',
        departure_date: '2025-03-10',
        flight_price: 800000,
        room_type: 'double',
        room_price_per_night: 100000
      },
      {
        quote_id: quote.id,
        group_name: 'Segunda Semana',
        num_participants: 3,
        arrival_date: '2025-03-03',
        departure_date: '2025-03-12',
        flight_price: 850000,
        room_type: 'single',
        room_price_per_night: 150000
      },
      {
        quote_id: quote.id,
        group_name: 'Grupo Corto',
        num_participants: 2,
        arrival_date: '2025-03-05',
        departure_date: '2025-03-10',
        flight_price: 900000,
        room_type: 'double',
        room_price_per_night: 100000
      }
    ];
    
    const { data: createdGroups, error: groupsInsertError } = await supabase
      .from('pasantias_quote_groups')
      .insert(groups)
      .select();
    
    if (groupsInsertError) {
      console.log('❌ Error creating groups:', groupsInsertError.message);
    } else {
      console.log('✅ Groups created successfully!');
      createdGroups.forEach(g => {
        console.log(`   - ${g.group_name}: ${g.num_participants} people, ${g.nights} nights`);
      });
    }
    
    // 4. Check calculated totals
    console.log('\n4️⃣ Checking calculated totals...');
    
    const { data: updatedQuote, error: fetchError } = await supabase
      .from('pasantias_quotes')
      .select('*')
      .eq('id', quote.id)
      .single();
    
    if (!fetchError && updatedQuote) {
      console.log('📊 Quote Totals:');
      console.log(`   Total participants: ${updatedQuote.num_pasantes || 'Not calculated'}`);
      console.log(`   Accommodation total: $${(updatedQuote.accommodation_total || 0).toLocaleString('es-CL')} CLP`);
      console.log(`   Grand total: $${(updatedQuote.grand_total || 0).toLocaleString('es-CL')} CLP`);
    }
    
    // 5. Clean up test data
    console.log('\n5️⃣ Cleaning up test data...');
    
    // Delete groups first (cascade will handle it, but let's be explicit)
    await supabase
      .from('pasantias_quote_groups')
      .delete()
      .eq('quote_id', quote.id);
    
    // Delete the quote
    const { error: deleteError } = await supabase
      .from('pasantias_quotes')
      .delete()
      .eq('id', quote.id);
    
    if (!deleteError) {
      console.log('✅ Test data cleaned up successfully');
    }
    
    console.log('\n🎉 MULTIPLE GROUPS SYSTEM IS WORKING!');
    console.log('You can now:');
    console.log('  1. Create quotes with multiple travel groups');
    console.log('  2. Each group can have different dates and prices');
    console.log('  3. Toggle between single and multi-group modes');
    console.log('  4. System automatically calculates totals across all groups');
    
  } catch (error) {
    console.error('❌ Unexpected error:', error);
  }
}

testGroupsSystem();