#!/usr/bin/env node

/**
 * Verification Script: Admin Menu Fix for Learning Path Detail Page
 * 
 * This script verifies that the my-paths/[id].tsx component now properly
 * passes admin status to the MainLayout, which should fix the missing
 * admin menu items in the sidebar.
 */

const fs = require('fs');
const path = require('path');

const LEARNING_PATH_FILE = path.join(__dirname, '../pages/my-paths/[id].tsx');

console.log('🔍 Verifying Admin Menu Fix for Learning Path Detail Page\n');

// Read the file content
const fileContent = fs.readFileSync(LEARNING_PATH_FILE, 'utf8');

console.log('✅ Verification Results:');

// Check 1: Component accepts isAdmin and user props
const propsInterfaceMatch = fileContent.match(/interface PathDetailsPageProps \{[\s\S]*?isAdmin: boolean;[\s\S]*?\}/);
console.log(`${propsInterfaceMatch ? '✅' : '❌'} 1. Component interface includes isAdmin and user props`);

// Check 2: Component destructures the props
const componentDestructureMatch = fileContent.match(/export default function PathDetailsPage\(\{\s*profileData,\s*user,\s*isAdmin\s*\}:/);
console.log(`${componentDestructureMatch ? '✅' : '❌'} 2. Component destructures isAdmin and user props`);

// Check 3: getServerSideProps queries user roles
const roleQueryMatch = fileContent.match(/from\('user_roles'\)[\s\S]*?role_type[\s\S]*?eq\('is_active', true\)/);
console.log(`${roleQueryMatch ? '✅' : '❌'} 3. getServerSideProps queries user roles for admin check`);

// Check 4: Admin roles are checked correctly
const adminRoleCheck = fileContent.match(/\['admin', 'equipo_directivo', 'consultor'\]\.includes\(role\.role_type\)/);
console.log(`${adminRoleCheck ? '✅' : '❌'} 4. Correct admin roles checked (admin, equipo_directivo, consultor)`);

// Check 5: Props are returned from getServerSideProps
const propsReturnMatch = fileContent.match(/return \{[\s\S]*?props: \{[\s\S]*?profileData,[\s\S]*?user:[\s\S]*?isAdmin,/);
console.log(`${propsReturnMatch ? '✅' : '❌'} 5. getServerSideProps returns user and isAdmin props`);

// Check 6: MainLayout receives all required props (check all 3 instances)
const mainLayoutMatches = fileContent.match(/<MainLayout[\s\S]*?user=\{user\}[\s\S]*?currentPage="my-paths"[\s\S]*?profileData=\{profileData\}[\s\S]*?isAdmin=\{isAdmin\}/g);
console.log(`${mainLayoutMatches && mainLayoutMatches.length >= 3 ? '✅' : '❌'} 6. All MainLayout instances receive required props (${mainLayoutMatches?.length || 0}/3)`);

const allChecksPass = propsInterfaceMatch && componentDestructureMatch && roleQueryMatch && 
                     adminRoleCheck && propsReturnMatch && mainLayoutMatches && mainLayoutMatches.length >= 3;

console.log(`\n${allChecksPass ? '🎉' : '❌'} Overall Status: ${allChecksPass ? 'ALL CHECKS PASSED' : 'SOME CHECKS FAILED'}\n`);

if (allChecksPass) {
  console.log('🚀 Expected Behavior:');
  console.log('   • Admin users will now see full admin menu in learning path pages');
  console.log('   • Sidebar will show admin navigation items instead of basic user items');
  console.log('   • Navigation should be consistent with other admin pages\n');
  
  console.log('🧪 Manual Testing:');
  console.log('   1. Login as admin user (admin, equipo_directivo, or consultor role)');
  console.log('   2. Navigate to any learning path detail page (/my-paths/[id])');
  console.log('   3. Verify sidebar shows admin menu items, not just:');
  console.log('      - Mi Panel, Mi Perfil, Mis Rutas, Espacio Colaborativo');
  console.log('   4. Should show full admin navigation menu');
} else {
  console.log('❌ Fix incomplete. Please review the failed checks above.');
}

console.log('\n📋 Files Modified:');
console.log('   • /pages/my-paths/[id].tsx - Added admin prop passing to MainLayout');