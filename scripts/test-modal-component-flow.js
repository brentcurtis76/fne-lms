#!/usr/bin/env node

/**
 * Test Modal Component Flow
 * Simulates the exact flow that happens in AssignTeachersModal
 */

const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('❌ Missing environment variables');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

// Simulate the component's state
let teachers = [];
let loading = true;

// Simulate the fetchTeachers function from the component
async function fetchTeachers() {
  console.log('🔄 Simulating fetchTeachers() from AssignTeachersModal...\n');
  
  try {
    // First get profiles
    console.log('  1️⃣ Fetching profiles...');
    const { data: profilesData, error: profilesError } = await supabase
      .from('profiles')
      .select('id, email, first_name, last_name, school, approval_status')
      .eq('approval_status', 'approved')
      .order('first_name');

    if (profilesError) {
      throw profilesError;
    }
    console.log(`     ✅ Found ${profilesData?.length || 0} approved profiles`);

    // Then get roles for these users
    console.log('\n  2️⃣ Fetching user roles...');
    const userIds = profilesData?.map(p => p.id) || [];
    const { data: rolesData, error: rolesError } = await supabase
      .from('user_roles')
      .select('user_id, role_type')
      .in('user_id', userIds);

    if (rolesError) {
      console.error('     ⚠️  Error fetching roles:', rolesError.message);
      console.log('     ℹ️  Continuing without roles (will default to docente)');
    } else {
      console.log(`     ✅ Found ${rolesData?.length || 0} role assignments`);
    }

    // Merge role data into profiles
    console.log('\n  3️⃣ Merging data...');
    const rolesMap = new Map(rolesData?.map(r => [r.user_id, r.role_type]) || []);
    const teachersWithRoles = profilesData?.map(profile => ({
      ...profile,
      role: rolesMap.get(profile.id) || 'docente'
    })) || [];

    teachers = teachersWithRoles;
    console.log(`     ✅ Merged data for ${teachers.length} users`);
    
  } catch (error) {
    console.error('\n  ❌ Error in fetchTeachers:', error.message);
    teachers = [];
  } finally {
    loading = false;
  }
}

// Simulate search/filter functionality
function filterTeachers(searchTerm) {
  const searchText = searchTerm.toLowerCase();
  return teachers.filter(teacher => {
    return (
      teacher.first_name?.toLowerCase().includes(searchText) ||
      teacher.last_name?.toLowerCase().includes(searchText) ||
      teacher.email.toLowerCase().includes(searchText) ||
      teacher.school?.toLowerCase().includes(searchText)
    );
  });
}

// Main test
async function runComponentFlowTest() {
  console.log('🧪 Testing Complete AssignTeachersModal Flow\n');
  
  // Simulate component mount
  console.log('📱 Component mounted (isOpen = true)');
  await fetchTeachers();
  
  // Check initial state
  console.log('\n📊 Component State After Load:');
  console.log(`   loading: ${loading}`);
  console.log(`   teachers.length: ${teachers.length}`);
  
  if (teachers.length === 0) {
    console.log('\n❌ PROBLEM: No teachers loaded!');
    console.log('   This would show "No se encontraron usuarios" in the UI');
    return;
  }
  
  // Test search functionality
  console.log('\n🔍 Testing Search Functionality:');
  
  const testSearches = ['', 'admin', 'docente', '@', 'pellines'];
  
  testSearches.forEach(searchTerm => {
    const filtered = filterTeachers(searchTerm);
    console.log(`   Search "${searchTerm}": ${filtered.length} results`);
  });
  
  // Simulate what the UI would show
  console.log('\n🖼️  UI State:');
  
  if (loading) {
    console.log('   Would show: "Cargando usuarios..."');
  } else if (teachers.length === 0) {
    console.log('   Would show: "No se encontraron usuarios" ❌');
  } else {
    console.log('   Would show: List of users ✅');
    console.log(`   Total users available: ${teachers.length}`);
    
    // Show role distribution
    const roleCount = {};
    teachers.forEach(t => {
      roleCount[t.role] = (roleCount[t.role] || 0) + 1;
    });
    
    console.log('\n   Role Distribution:');
    Object.entries(roleCount).forEach(([role, count]) => {
      console.log(`     - ${role}: ${count} users`);
    });
  }
  
  console.log('\n✅ Modal should display users correctly!');
}

// Run test
runComponentFlowTest();