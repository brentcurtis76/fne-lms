#!/usr/bin/env node

// Script to demonstrate the fix for community dropdown filtering issue
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function demonstrateFix() {
  console.log('🔧 Community Dropdown Filtering Fix\n');

  try {
    // 1. Show the issue
    console.log('1️⃣ The Issue:\n');
    console.log('In RoleAssignmentModal.tsx, the community filtering logic (lines 649-666) has a problem:');
    console.log('- It\'s comparing comm.school_id (which might be an integer) with selectedSchool (which is a string)');
    console.log('- The comparison comm.school_id?.toString() === selectedSchool might fail if school_id is already a string\n');

    // 2. Test different scenarios
    console.log('2️⃣ Testing Different Scenarios:\n');
    
    // Get a sample community
    const { data: sampleComm } = await supabase
      .from('growth_communities')
      .select('*')
      .limit(1)
      .single();
    
    if (sampleComm) {
      console.log(`Sample community: ${sampleComm.name}`);
      console.log(`  school_id value: ${sampleComm.school_id}`);
      console.log(`  school_id type: ${typeof sampleComm.school_id}`);
      
      // Test different comparison methods
      const testSchoolId = String(sampleComm.school_id);
      console.log(`\nTesting comparisons with selectedSchool = "${testSchoolId}":`);
      console.log(`  Direct comparison: ${sampleComm.school_id === testSchoolId}`);
      console.log(`  ToString comparison: ${sampleComm.school_id?.toString() === testSchoolId}`);
      console.log(`  Both as strings: ${String(sampleComm.school_id) === String(testSchoolId)}`);
    }

    // 3. Show the fix
    console.log('\n\n3️⃣ The Fix:\n');
    console.log('Replace the filtering logic in RoleAssignmentModal.tsx (around line 653):');
    console.log('\nCURRENT CODE:');
    console.log(`const schoolMatch = comm.school_id?.toString() === selectedSchool;`);
    
    console.log('\nFIXED CODE:');
    console.log(`// Ensure both values are strings for comparison`);
    console.log(`const schoolMatch = String(comm.school_id) === String(selectedSchool);`);
    
    console.log('\nOR ALTERNATIVE FIX:');
    console.log(`// Compare as numbers if school_id is numeric`);
    console.log(`const schoolMatch = Number(comm.school_id) === Number(selectedSchool);`);

    // 4. Additional debugging
    console.log('\n\n4️⃣ Additional Debugging Suggestions:\n');
    console.log('Add console.log statements in the filter function to debug:');
    console.log(`
.filter(comm => {
  // Debug logging
  console.log('Filtering community:', comm.name);
  console.log('  comm.school_id:', comm.school_id, 'type:', typeof comm.school_id);
  console.log('  selectedSchool:', selectedSchool, 'type:', typeof selectedSchool);
  
  if (selectedSchool) {
    const schoolMatch = String(comm.school_id) === String(selectedSchool);
    console.log('  School match result:', schoolMatch);
    if (!schoolMatch) return false;
  }
  
  // ... rest of filtering logic
})`);

    // 5. Test the fix with actual data
    console.log('\n\n5️⃣ Testing Fix with Actual Data:\n');
    
    const { data: schools } = await supabase
      .from('schools')
      .select('id, name')
      .limit(3);
    
    for (const school of schools || []) {
      console.log(`\nSchool: ${school.name}`);
      
      // Test filtering with string comparison
      const { data: communities } = await supabase
        .from('growth_communities')
        .select('*');
      
      const filtered = communities?.filter(comm => 
        String(comm.school_id) === String(school.id)
      );
      
      console.log(`  Communities found: ${filtered?.length || 0}`);
      filtered?.forEach(c => console.log(`    - ${c.name}`));
    }

  } catch (error) {
    console.error('❌ Error:', error);
  }
}

// Run the demonstration
demonstrateFix();