#!/usr/bin/env node

const { createClient } = require('@supabase/supabase-js');

// Initialize Supabase client
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://sxlogxqzmarhqsblxmtj.supabase.co';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseKey) {
  console.error('SUPABASE_SERVICE_ROLE_KEY environment variable is required');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function fixSchoolIds() {
  console.log('Fixing school IDs for users with school names but no school_id...\n');

  try {
    // First, get all schools
    const { data: schools, error: schoolsError } = await supabase
      .from('schools')
      .select('id, name');

    if (schoolsError) {
      console.error('Error fetching schools:', schoolsError);
      return;
    }

    console.log(`Found ${schools.length} schools in the database\n`);

    // Get all users with school names but no school_id
    const { data: users, error: usersError } = await supabase
      .from('profiles')
      .select('id, email, school, school_id')
      .not('school', 'is', null)
      .is('school_id', null);

    if (usersError) {
      console.error('Error fetching users:', usersError);
      return;
    }

    console.log(`Found ${users.length} users with school names but no school_id\n`);

    // Create a map of school names to IDs for easy lookup
    const schoolMap = {};
    schools.forEach(school => {
      schoolMap[school.name.toLowerCase().trim()] = school.id;
    });

    // Update each user
    let updated = 0;
    let notFound = 0;

    for (const user of users) {
      const schoolName = user.school.toLowerCase().trim();
      const schoolId = schoolMap[schoolName];

      if (schoolId) {
        console.log(`Updating user ${user.email}: "${user.school}" -> school_id: ${schoolId}`);
        
        const { error: updateError } = await supabase
          .from('profiles')
          .update({ school_id: schoolId })
          .eq('id', user.id);

        if (updateError) {
          console.error(`  ❌ Error updating user ${user.email}:`, updateError);
        } else {
          console.log(`  ✅ Updated successfully`);
          updated++;
        }
      } else {
        console.log(`⚠️  No matching school found for user ${user.email} with school name "${user.school}"`);
        notFound++;
      }
    }

    console.log(`\n\nSummary:`);
    console.log(`- Updated: ${updated} users`);
    console.log(`- Not found: ${notFound} users (school name doesn't match any school in database)`);

    // Show which school names don't have matches
    if (notFound > 0) {
      console.log('\nUnmatched school names:');
      const unmatchedSchools = new Set();
      users.forEach(user => {
        const schoolName = user.school.toLowerCase().trim();
        if (!schoolMap[schoolName]) {
          unmatchedSchools.add(user.school);
        }
      });
      unmatchedSchools.forEach(school => console.log(`  - "${school}"`));
    }

  } catch (error) {
    console.error('Error in fixSchoolIds:', error);
  }
}

// Run the fix
fixSchoolIds();