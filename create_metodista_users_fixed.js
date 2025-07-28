const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function createTestUsers() {
  try {
    console.log('Creating test users for Colegio Metodista de Santiago...');
    
    // Create first test user
    const testUser1 = {
      first_name: 'Ana',
      last_name: 'Martinez',
      name: 'Ana Martinez', // Full name field
      email: `ana.martinez.metodista.${Date.now()}@example.com`,
      school_id: 10,
      school: 'Colegio Metodista de Santiago', // School name field
      approval_status: 'approved'
    };
    
    const { data: newUser1, error: userError1 } = await supabase
      .from('profiles')
      .insert([testUser1])
      .select()
      .single();
      
    if (userError1) {
      console.error('Error creating first user:', userError1);
    } else {
      console.log('✅ First test user created successfully!');
      console.log(`User ID: ${newUser1.id}`);
      console.log(`Name: ${newUser1.first_name} ${newUser1.last_name}`);
      console.log(`Email: ${newUser1.email}`);
      console.log(`School ID: ${newUser1.school_id}`);
    }
    
    // Create second test user
    const testUser2 = {
      first_name: 'Carlos',
      last_name: 'Gonzalez',
      name: 'Carlos Gonzalez',
      email: `carlos.gonzalez.metodista.${Date.now()}@example.com`,
      school_id: 10,
      school: 'Colegio Metodista de Santiago',
      approval_status: 'approved'
    };
    
    const { data: newUser2, error: userError2 } = await supabase
      .from('profiles')
      .insert([testUser2])
      .select()
      .single();
      
    if (userError2) {
      console.error('Error creating second user:', userError2);
    } else {
      console.log('\n✅ Second test user created successfully!');
      console.log(`User ID: ${newUser2.id}`);
      console.log(`Name: ${newUser2.first_name} ${newUser2.last_name}`);
      console.log(`Email: ${newUser2.email}`);
      console.log(`School ID: ${newUser2.school_id}`);
    }
    
    // Now let's verify they were created and list all Metodista users
    console.log('\n--- Verifying Metodista users ---');
    const { data: metodistaUsers, error: listError } = await supabase
      .from('profiles')
      .select('id, first_name, last_name, email, school_id')
      .eq('school_id', 10);
      
    if (!listError && metodistaUsers) {
      console.log(`Found ${metodistaUsers.length} users from Colegio Metodista de Santiago:`);
      metodistaUsers.forEach(user => {
        console.log(`- ${user.first_name} ${user.last_name} (${user.email}) - ID: ${user.id}`);
      });
    }
    
  } catch (err) {
    console.error('Unexpected error:', err);
  }
}

createTestUsers();