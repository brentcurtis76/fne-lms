const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function testAndreaCommunity() {
  console.log('🔍 Testing community creation for Andrea Met. Santiago...\n');

  const targetUserId = 'ca7289f7-08f5-4095-85d5-584530eca213'; // Andrea's actual ID
  const schoolId = 10; // Colegio Metodista de Santiago
  
  // Get Andrea's profile
  const { data: userData, error: userError } = await supabase
    .from('profiles')
    .select('first_name, last_name')
    .eq('id', targetUserId)
    .single();

  if (userError) {
    console.error('Error getting user:', userError);
    return;
  }

  console.log('User found:', userData);
  
  const communityName = `Comunidad ${userData.first_name} ${userData.last_name}`;
  console.log('Community name will be:', communityName);

  // Check if this community already exists
  console.log('\n🔍 Checking if community already exists...');
  const { data: existing, error: checkError } = await supabase
    .from('growth_communities')
    .select('*')
    .eq('name', communityName)
    .eq('school_id', schoolId);

  if (checkError) {
    console.error('Error checking existing:', checkError);
  } else {
    console.log('Existing communities with this name:', existing?.length || 0);
    if (existing && existing.length > 0) {
      console.table(existing);
    }
  }

  // Try to create the community
  console.log('\n🧪 Attempting to create community...');
  const { data: newCommunity, error: communityError } = await supabase
    .from('growth_communities')
    .insert({
      name: communityName,
      school_id: schoolId,
      generation_id: null
    })
    .select()
    .single();

  if (communityError) {
    console.error('\n❌ Error creating community:');
    console.log('Code:', communityError.code);
    console.log('Message:', communityError.message);
    console.log('Details:', communityError.details);
    console.log('Hint:', communityError.hint);
    
    // Check if it's a unique constraint violation
    if (communityError.code === '23505') {
      console.log('\n⚠️  This is a UNIQUE CONSTRAINT violation - community already exists!');
      
      // Let's check the unique constraints on the table
      console.log('\n🔍 Checking unique constraints...');
      const { data: constraints, error: constraintError } = await supabase.rpc('exec_sql', {
        sql: `
          SELECT 
            conname as constraint_name,
            pg_get_constraintdef(oid) as constraint_definition
          FROM pg_constraint
          WHERE conrelid = 'growth_communities'::regclass
          AND contype = 'u';
        `
      });
      
      if (!constraintError && constraints) {
        console.log('Unique constraints on growth_communities:');
        console.table(constraints);
      }
    }
  } else {
    console.log('\n✅ Community created successfully:', newCommunity);
    
    // Clean up
    if (newCommunity) {
      await supabase
        .from('growth_communities')
        .delete()
        .eq('id', newCommunity.id);
      console.log('🧹 Test data cleaned up');
    }
  }
}

testAndreaCommunity();