const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function checkRoleTypes() {
  console.log('🔍 Checking available role types in database...\n');
  
  try {
    // Get all distinct role types from user_roles table
    const { data: roles, error } = await supabase
      .from('user_roles')
      .select('role_type')
      .order('role_type');
    
    if (error) {
      console.error('❌ Error fetching roles:', error);
      return;
    }
    
    // Get unique role types
    const uniqueRoles = [...new Set(roles.map(r => r.role_type))];
    
    console.log('📋 Available role types in user_roles table:');
    console.log('=' .repeat(50));
    uniqueRoles.forEach(role => {
      console.log(`  ✓ ${role}`);
    });
    console.log('=' .repeat(50));
    console.log(`\nTotal unique role types: ${uniqueRoles.length}`);
    
    // Check if superadmin exists
    if (uniqueRoles.includes('superadmin')) {
      console.log('\n✅ SUPERADMIN role type EXISTS in the database');
    } else {
      console.log('\n⚠️  SUPERADMIN role type does NOT exist in the database');
    }
    
    // Check specific users to see what roles they have
    console.log('\n📊 Sample of actual role assignments:');
    const { data: sampleRoles, error: sampleError } = await supabase
      .from('user_roles')
      .select('role_type, user_id, is_active')
      .eq('is_active', true)
      .limit(10);
    
    if (!sampleError && sampleRoles) {
      console.log('First 10 active role assignments:');
      sampleRoles.forEach(r => {
        console.log(`  User ${r.user_id.substring(0, 8)}... has role: ${r.role_type}`);
      });
    }
    
  } catch (error) {
    console.error('❌ Unexpected error:', error);
  }
}

checkRoleTypes();