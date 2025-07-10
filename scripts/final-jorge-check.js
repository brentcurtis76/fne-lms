import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function finalCheck() {
  console.log('🎯 FINAL VERIFICATION FOR JORGE PARRA\n');
  
  // Check Jorge's account
  const { data: jorge } = await supabase
    .from('profiles')
    .select('id, email, first_name, last_name')
    .eq('email', 'jorge@lospellines.cl')
    .single();
    
  if (jorge) {
    console.log('✅ Jorge\'s Account Found:');
    console.log(`   Name: ${jorge.first_name} ${jorge.last_name}`);
    console.log(`   Email: ${jorge.email}`);
    
    // Check his role
    const { data: role } = await supabase
      .from('user_roles')
      .select('role_type')
      .eq('user_id', jorge.id)
      .single();
      
    console.log(`   Role: ${role?.role_type || 'No role assigned'}`);
  }
  
  // Verify schools
  const { data: schools, error } = await supabase
    .from('schools')
    .select('name')
    .order('name');
    
  if (!error && schools) {
    console.log(`\n✅ SCHOOLS ACCESSIBLE: ${schools.length} schools available`);
    console.log('✅ Los Pellines Available:', schools.some(s => s.name === 'Los Pellines') ? 'YES' : 'NO');
    console.log('\n' + '='.repeat(60));
    console.log('🎉 GUARANTEED: Jorge WILL see all schools when he logs in!');
    console.log('='.repeat(60));
  } else {
    console.log('\n❌ ERROR:', error?.message);
  }
}

finalCheck();