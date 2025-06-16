#!/usr/bin/env node

// Script to check actual data types in the database
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function checkTableTypes() {
  console.log('🔍 Checking Table Data Types...\n');

  try {
    // Check schools table
    const { data: schools, error: schoolError } = await supabase
      .from('schools')
      .select('id, name')
      .limit(3);

    if (schoolError) {
      console.error('Error fetching schools:', schoolError);
    } else {
      console.log('📚 Schools Table Sample:');
      schools.forEach(s => {
        console.log(`  ID: ${s.id} (Type: ${typeof s.id}), Name: ${s.name}`);
      });
    }

    // Check growth_communities table
    const { data: communities, error: commError } = await supabase
      .from('growth_communities')
      .select('id, name, school_id, generation_id')
      .limit(3);

    if (commError) {
      console.error('Error fetching communities:', commError);
    } else {
      console.log('\n🏘️ Growth Communities Table Sample:');
      communities.forEach(c => {
        console.log(`  ID: ${c.id} (Type: ${typeof c.id})`);
        console.log(`    School ID: ${c.school_id} (Type: ${typeof c.school_id})`);
        console.log(`    Generation ID: ${c.generation_id} (Type: ${typeof c.generation_id})`);
      });
    }

    // Check profiles table
    const { data: profiles, error: profileError } = await supabase
      .from('profiles')
      .select('id, school_id, generation_id, community_id')
      .not('school_id', 'is', null)
      .limit(3);

    if (profileError) {
      console.error('Error fetching profiles:', profileError);
    } else {
      console.log('\n👤 Profiles Table Sample:');
      profiles.forEach(p => {
        console.log(`  ID: ${p.id}`);
        console.log(`    School ID: ${p.school_id} (Type: ${typeof p.school_id})`);
        console.log(`    Generation ID: ${p.generation_id} (Type: ${typeof p.generation_id})`);
        console.log(`    Community ID: ${p.community_id} (Type: ${typeof p.community_id})`);
      });
    }

    // Check consultant_assignments table structure
    const { data: assignments, error: assignError } = await supabase
      .from('consultant_assignments')
      .select('id, school_id, generation_id, community_id')
      .limit(3);

    if (assignError) {
      console.error('Error fetching assignments:', assignError);
    } else {
      console.log('\n📋 Consultant Assignments Table Sample:');
      if (assignments.length === 0) {
        console.log('  (No assignments found)');
      } else {
        assignments.forEach(a => {
          console.log(`  ID: ${a.id}`);
          console.log(`    School ID: ${a.school_id} (Type: ${typeof a.school_id})`);
          console.log(`    Generation ID: ${a.generation_id} (Type: ${typeof a.generation_id})`);
          console.log(`    Community ID: ${a.community_id} (Type: ${typeof a.community_id})`);
        });
      }
    }

  } catch (error) {
    console.error('❌ Unexpected error:', error);
  }
}

// Run the check
checkTableTypes();