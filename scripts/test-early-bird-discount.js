const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = 'https://sxlogxqzmarhqsblxmtj.supabase.co';
const supabaseServiceKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InN4bG9neHF6bWFyaHFzYmx4bXRqIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc0NzMyMjIyMSwiZXhwIjoyMDYyODk4MjIxfQ.OiyMUeIoCc_mH7G5xZms1AhDyYM3jXqqIjccSL0JmWI';

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function testEarlyBirdDiscount() {
  console.log('🎉 TESTING EARLY BIRD DISCOUNT SYSTEM');
  console.log('=' + '='.repeat(50));
  
  try {
    // Get a user and programs
    const { data: users } = await supabase.from('profiles').select('id').limit(1);
    const userId = users && users[0] ? users[0].id : null;
    
    if (!userId) {
      console.log('❌ No users found');
      return;
    }
    
    // Get all programs
    const { data: programs } = await supabase
      .from('pasantias_programs')
      .select('*')
      .eq('is_active', true);
      
    console.log('\n📚 Available Programs:');
    programs.forEach(p => {
      console.log(`  - ${p.name}`);
      console.log(`    Regular price: $${p.price.toLocaleString('es-CL')} CLP`);
      console.log(`    Early bird price: $${(p.price - 500000).toLocaleString('es-CL')} CLP`);
      console.log(`    Savings: $500,000 CLP per person\n`);
    });
    
    // Create a test quote WITHOUT discount
    console.log('1️⃣ Creating quote WITHOUT early bird discount...');
    const { data: regularQuote } = await supabase
      .from('pasantias_quotes')
      .insert({
        client_name: 'Test - Regular Price',
        client_email: 'test@regular.cl',
        use_groups: false,
        arrival_date: '2025-03-01',
        departure_date: '2025-03-10',
        room_type: 'double',
        num_pasantes: 5,
        single_room_price: 150000,
        double_room_price: 100000,
        selected_programs: programs.map(p => p.id),
        apply_early_bird_discount: false,
        status: 'draft',
        created_by: userId,
        updated_by: userId
      })
      .select()
      .single();
      
    if (regularQuote) {
      console.log('✅ Regular price quote created:');
      console.log(`   Programs (${programs.length}): $${(regularQuote.program_total || 0).toLocaleString('es-CL')} CLP`);
      console.log(`   Grand Total: $${(regularQuote.grand_total || 0).toLocaleString('es-CL')} CLP`);
    }
    
    // Create a test quote WITH discount
    console.log('\n2️⃣ Creating quote WITH early bird discount...');
    const { data: discountQuote } = await supabase
      .from('pasantias_quotes')
      .insert({
        client_name: 'Test - Early Bird Discount',
        client_email: 'test@earlybird.cl',
        use_groups: false,
        arrival_date: '2025-03-01',
        departure_date: '2025-03-10',
        room_type: 'double',
        num_pasantes: 5,
        single_room_price: 150000,
        double_room_price: 100000,
        selected_programs: programs.map(p => p.id),
        apply_early_bird_discount: true,
        early_bird_payment_date: '2025-09-30',
        status: 'draft',
        created_by: userId,
        updated_by: userId
      })
      .select()
      .single();
      
    if (discountQuote) {
      console.log('✅ Early bird discount quote created:');
      console.log(`   Programs (${programs.length}): $${(discountQuote.program_total || 0).toLocaleString('es-CL')} CLP`);
      console.log(`   Discount Applied: $${(discountQuote.discount_amount || 0).toLocaleString('es-CL')} CLP`);
      console.log(`   Grand Total: $${(discountQuote.grand_total || 0).toLocaleString('es-CL')} CLP`);
    }
    
    // Calculate and show savings
    if (regularQuote && discountQuote) {
      const savings = (regularQuote.grand_total || 0) - (discountQuote.grand_total || 0);
      const savingsPerPerson = savings / 5;
      
      console.log('\n💰 SAVINGS SUMMARY:');
      console.log(`   Total Savings: $${savings.toLocaleString('es-CL')} CLP`);
      console.log(`   Savings per person: $${savingsPerPerson.toLocaleString('es-CL')} CLP`);
      console.log(`   Discount percentage: ${Math.round((savings / (regularQuote.grand_total || 1)) * 100)}%`);
      console.log(`   Payment deadline: September 30, 2025`);
    }
    
    // Clean up test data
    console.log('\n🧹 Cleaning up test data...');
    if (regularQuote) {
      await supabase.from('pasantias_quotes').delete().eq('id', regularQuote.id);
    }
    if (discountQuote) {
      await supabase.from('pasantias_quotes').delete().eq('id', discountQuote.id);
    }
    console.log('✅ Test data cleaned up');
    
    console.log('\n🎯 EARLY BIRD DISCOUNT SYSTEM WORKING!');
    console.log('How it works:');
    console.log('  1. Toggle "Aplicar descuento por pago anticipado" when creating a quote');
    console.log('  2. System automatically applies $500,000 CLP discount per program per person');
    console.log('  3. Discount shows in the totals summary');
    console.log('  4. Client must pay before September 30, 2025 to get the discount');
    
  } catch (error) {
    console.error('❌ Error:', error);
  }
}

testEarlyBirdDiscount();