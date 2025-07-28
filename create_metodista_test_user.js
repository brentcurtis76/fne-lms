const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function createTestUser() {
  try {
    console.log('Creating test user for Colegio Metodista de Santiago...');
    
    // First, let's check if school ID 10 has generations
    const { data: school, error: schoolError } = await supabase
      .from('schools')
      .select('id, name, has_generations')
      .eq('id', 10)
      .single();
      
    if (schoolError) {
      console.error('Error fetching school:', schoolError);
      return;
    }
    
    console.log(`School: ${school.name} (ID: ${school.id})`);
    console.log(`Has generations: ${school.has_generations}`);
    
    // If the school has generations, let's see what generations are available
    if (school.has_generations) {
      const { data: generations, error: genError } = await supabase
        .from('generations')
        .select('id, name, year')
        .eq('school_id', 10);
        
      if (!genError && generations) {
        console.log('Available generations:');
        generations.forEach(gen => {
          console.log(`- ${gen.name} (${gen.year}) - ID: ${gen.id}`);
        });
      }
    }
    
    // Create a test user
    const testUser = {
      first_name: 'Test',
      last_name: 'Metodista',
      email: `test.metodista.${Date.now()}@example.com`,
      school_id: 10,
      rut: `12345678-${Math.floor(Math.random() * 10)}`,
      address: 'Test Address',
      phone: '+56912345678'
    };
    
    const { data: newUser, error: userError } = await supabase
      .from('profiles')
      .insert([testUser])
      .select()
      .single();
      
    if (userError) {
      console.error('Error creating user:', userError);
      return;
    }
    
    console.log('\n✅ Test user created successfully!');
    console.log(`User ID: ${newUser.id}`);
    console.log(`Name: ${newUser.first_name} ${newUser.last_name}`);
    console.log(`Email: ${newUser.email}`);
    console.log(`School ID: ${newUser.school_id}`);
    
    // Also create a sample user without the timestamp for easier testing
    const regularTestUser = {
      first_name: 'Maria',
      last_name: 'Rodriguez',
      email: 'maria.rodriguez.metodista@example.com',
      school_id: 10,
      rut: '98765432-1',
      address: 'Calle Test 123',
      phone: '+56987654321'
    };
    
    const { data: regularUser, error: regularError } = await supabase
      .from('profiles')
      .insert([regularTestUser])
      .select()
      .single();
      
    if (!regularError) {
      console.log('\n✅ Regular test user also created!');
      console.log(`User ID: ${regularUser.id}`);
      console.log(`Name: ${regularUser.first_name} ${regularUser.last_name}`);
      console.log(`Email: ${regularUser.email}`);
    }
    
  } catch (err) {
    console.error('Unexpected error:', err);
  }
}

createTestUser();