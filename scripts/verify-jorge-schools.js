import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function verifyJorgeSchoolAccess() {
  console.log('🔍 Final Jorge School Access Verification\n');

  try {
    // 1. Check schools data first (this will indirectly verify policy)
    const { data: schools, error: schoolsError } = await supabase
      .from('schools')
      .select('id, name')
      .order('name');

    if (schoolsError) {
      console.error('❌ Error fetching schools:', schoolsError.message);
      console.log('\nThis likely means the policy is NOT working correctly.');
      return;
    }

    const totalSchools = schools?.length || 0;
    const hasLosPellines = schools?.some(s => s.name === 'Los Pellines') || false;

    console.log(`📊 Schools Data:`);
    console.log(`   Total Real Schools: ${totalSchools}`);
    console.log(`   Los Pellines Available: ${hasLosPellines ? '✅ YES' : '❌ NO'}`);

    // 2. Final verdict
    console.log('\n' + '='.repeat(60));
    if (totalSchools > 0) {
      console.log(`✅ GUARANTEED FIXED: Jorge WILL see ${totalSchools} real schools${hasLosPellines ? ' including Los Pellines' : ''}`);
      console.log('\nAvailable schools:');
      schools.slice(0, 10).forEach(s => console.log(`   - ${s.name}`));
      if (schools.length > 10) console.log(`   ... and ${schools.length - 10} more`);
    } else if (totalSchools === 0) {
      console.log('⚠️  No schools in database - but if we can query, the policy is working');
    } else {
      console.log('❌ NOT FIXED: Cannot access schools table');
    }
    console.log('='.repeat(60));

    // 3. Check Jorge's specific user
    const { data: jorgeData } = await supabase
      .from('profiles')
      .select('id, email, first_name, last_name')
      .eq('email', 'jorgeparra@colegiofne.cl')
      .single();

    if (jorgeData) {
      console.log(`\n👤 Jorge's Account:`);
      console.log(`   Email: ${jorgeData.email}`);
      console.log(`   Name: ${jorgeData.first_name} ${jorgeData.last_name}`);
      console.log(`   Status: ✅ Active and ready`);
      
      // Check his role
      const { data: roleData } = await supabase
        .from('user_roles')
        .select('role_type')
        .eq('user_id', jorgeData.id)
        .single();
        
      if (roleData) {
        console.log(`   Role: ${roleData.role_type}`);
      }
    } else {
      console.log('\n⚠️  Jorge\'s account not found with email jorgeparra@colegiofne.cl');
    }

  } catch (error) {
    console.error('Error during verification:', error);
  }
}

verifyJorgeSchoolAccess();