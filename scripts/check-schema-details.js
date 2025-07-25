const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function checkSchemaDetails() {
  console.log('🔍 Checking schema details...');
  
  try {
    // Check available role types
    console.log('\n1. Available role types in user_roles:');
    const { data: roleTypes, error: roleError } = await supabase
      .from('user_roles')
      .select('role_type')
      .limit(20);
    
    if (roleError) {
      console.error('❌ Role types error:', roleError);
    } else {
      const uniqueRoles = [...new Set(roleTypes?.map(r => r.role_type))];
      console.log('✅ Available role types:', uniqueRoles);
    }

    // Check course_enrollments column names
    console.log('\n2. Course enrollments table structure:');
    const { data: enrollments, error: enrollError } = await supabase
      .from('course_enrollments')
      .select('*')
      .limit(1);
    
    if (enrollError) {
      console.error('❌ Course enrollments error:', enrollError);
    } else {
      console.log('✅ Course enrollments columns:', enrollments?.[0] ? Object.keys(enrollments[0]) : 'No data');
    }

    // Check if there are any users with actual student/teacher roles
    console.log('\n3. All user roles in database:');
    const { data: allRoles } = await supabase
      .from('user_roles')
      .select('role_type, user_id')
      .eq('is_active', true)
      .limit(10);
    
    console.log('All active roles:', allRoles);

  } catch (error) {
    console.error('❌ Schema check error:', error);
  }
}

checkSchemaDetails();