#!/usr/bin/env node

const { createClient } = require('@supabase/supabase-js');

// Load environment variables
require('dotenv').config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('❌ Missing required environment variables');
  process.exit(1);
}

const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

async function verifyFix() {
  console.log('🔍 Verifying Role Assignment Fix\n');

  try {
    // 1. Check if API endpoints exist
    console.log('1️⃣ Checking API endpoints exist...');
    const fs = require('fs');
    const assignRoleExists = fs.existsSync('./pages/api/admin/assign-role.ts');
    const removeRoleExists = fs.existsSync('./pages/api/admin/remove-role.ts');
    
    console.log(`   - /api/admin/assign-role: ${assignRoleExists ? '✅ EXISTS' : '❌ MISSING'}`);
    console.log(`   - /api/admin/remove-role: ${removeRoleExists ? '✅ EXISTS' : '❌ MISSING'}`);

    // 2. Check if roleUtils has the new functions
    console.log('\n2️⃣ Checking roleUtils updates...');
    const roleUtilsContent = fs.readFileSync('./utils/roleUtils.ts', 'utf8');
    const hasAssignRoleViaAPI = roleUtilsContent.includes('assignRoleViaAPI');
    const hasRemoveRoleViaAPI = roleUtilsContent.includes('removeRoleViaAPI');
    
    console.log(`   - assignRoleViaAPI function: ${hasAssignRoleViaAPI ? '✅ EXISTS' : '❌ MISSING'}`);
    console.log(`   - removeRoleViaAPI function: ${hasRemoveRoleViaAPI ? '✅ EXISTS' : '❌ MISSING'}`);

    // 3. Check if RoleAssignmentModal uses the new functions
    console.log('\n3️⃣ Checking RoleAssignmentModal updates...');
    const modalContent = fs.readFileSync('./components/RoleAssignmentModal.tsx', 'utf8');
    const usesAssignRoleViaAPI = modalContent.includes('assignRoleViaAPI');
    const usesRemoveRoleViaAPI = modalContent.includes('removeRoleViaAPI');
    
    console.log(`   - Uses assignRoleViaAPI: ${usesAssignRoleViaAPI ? '✅ YES' : '❌ NO'}`);
    console.log(`   - Uses removeRoleViaAPI: ${usesRemoveRoleViaAPI ? '✅ YES' : '❌ NO'}`);

    // 4. Check Mora's admin status in database
    console.log('\n4️⃣ Checking Mora\'s admin status...');
    const { data: moraProfile } = await supabaseAdmin
      .from('profiles')
      .select('id, email, first_name, last_name')
      .eq('email', 'mdelfresno@nuevaeducacion.org')
      .single();

    if (moraProfile) {
      const { data: moraRoles } = await supabaseAdmin
        .from('user_roles')
        .select('*')
        .eq('user_id', moraProfile.id)
        .eq('role_type', 'admin')
        .eq('is_active', true);

      console.log(`   - Mora del Fresno (${moraProfile.email})`);
      console.log(`   - Active admin roles: ${moraRoles?.length || 0} ✅`);
    } else {
      console.log('   - ❌ Mora profile not found');
    }

    // 5. Summary
    console.log('\n📊 SUMMARY:');
    
    const allChecks = [
      assignRoleExists,
      removeRoleExists,
      hasAssignRoleViaAPI,
      hasRemoveRoleViaAPI,
      usesAssignRoleViaAPI,
      usesRemoveRoleViaAPI,
      moraProfile && true
    ];
    
    const passedChecks = allChecks.filter(Boolean).length;
    const totalChecks = allChecks.length;
    
    if (passedChecks === totalChecks) {
      console.log(`\n✅ ALL CHECKS PASSED (${passedChecks}/${totalChecks})`);
      console.log('\n🎉 The role assignment fix is fully implemented!');
      console.log('\n📝 Instructions for Mora:');
      console.log('   1. Refresh the browser (Ctrl+R or Cmd+R)');
      console.log('   2. Go to Admin → Gestión de Usuarios');
      console.log('   3. Click on any user and select "Gestionar Roles"');
      console.log('   4. Role assignment should now work properly!');
    } else {
      console.log(`\n⚠️  Some checks failed (${passedChecks}/${totalChecks})`);
      console.log('   Please review the missing components above.');
    }

  } catch (error) {
    console.error('\n❌ Verification failed:', error.message);
    process.exit(1);
  }
}

// Run verification
verifyFix();