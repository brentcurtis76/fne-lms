/**
 * Investigation Script: NULL has_generations Field Bug
 * 
 * This script demonstrates how NULL values in the has_generations field
 * cause the check_community_organization() trigger to fail.
 */

const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = 'https://sxlogxqzmarhqsblxmtj.supabase.co';
const supabaseServiceKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InN4bG9neHF6bWFyaHFzYmx4bXRqIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc0NzMyMjIyMSwiZXhwIjoyMDYyODk4MjIxfQ.OiyMUeIoCc_mH7G5xZms1AhDyYM3jXqqIjccSL0JmWI';

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function investigateNullValues() {
  console.log('🔍 INVESTIGATING NULL has_generations VALUES\n');

  try {
    // 1. Check current state of schools with NULL has_generations
    console.log('1. Checking for schools with NULL has_generations values:');
    const { data: nullSchools, error: nullError } = await supabase
      .from('schools')
      .select('id, name, has_generations')
      .is('has_generations', null);

    if (nullError) {
      console.error('❌ Error checking NULL schools:', nullError);
      return;
    }

    console.log(`Found ${nullSchools.length} schools with NULL has_generations:`);
    nullSchools.forEach(school => {
      console.log(`  - ID ${school.id}: ${school.name} (has_generations: ${school.has_generations})`);
    });

    if (nullSchools.length === 0) {
      console.log('✅ No schools with NULL has_generations found. Creating test case...\n');
      
      // Create a test school with NULL has_generations to demonstrate the bug
      const { data: testSchool, error: createError } = await supabase
        .from('schools')
        .insert({
          name: 'Test School for NULL Investigation',
          has_generations: null
        })
        .select()
        .single();

      if (createError) {
        console.error('❌ Error creating test school:', createError);
        return;
      }

      console.log(`✅ Created test school: ID ${testSchool.id}`);
      nullSchools.push(testSchool);
    }

    // 2. Test community creation with NULL has_generations
    for (const school of nullSchools.slice(0, 1)) { // Test with first school only
      console.log(`\n2. Testing community creation for school "${school.name}" (ID: ${school.id}) with NULL has_generations:`);

      // Get a valid user for created_by
      const { data: users, error: userError } = await supabase
        .from('profiles')
        .select('id')
        .limit(1);

      if (userError || !users.length) {
        console.error('❌ Error getting user for test:', userError);
        continue;
      }

      const userId = users[0].id;

      // Try to create a community (this should fail with NULL has_generations)
      const { data: community, error: communityError } = await supabase
        .from('growth_communities')
        .insert({
          name: `Test Community for ${school.name}`,
          school_id: school.id,
          generation_id: null,
          created_by: userId
        })
        .select()
        .single();

      if (communityError) {
        console.log('❌ EXPECTED FAILURE - Community creation failed:', communityError.message);
        console.log('   This demonstrates the bug caused by NULL has_generations\n');
      } else {
        console.log('⚠️  UNEXPECTED SUCCESS - Community created despite NULL has_generations:', community);
      }

      // 3. Fix the NULL value and test again
      console.log(`3. Fixing NULL has_generations for school "${school.name}"`);
      
      const { error: updateError } = await supabase
        .from('schools')
        .update({ has_generations: false })
        .eq('id', school.id);

      if (updateError) {
        console.error('❌ Error updating school:', updateError);
        continue;
      }

      console.log('✅ Updated has_generations to false');

      // Try creating community again (this should succeed)
      const { data: fixedCommunity, error: fixedError } = await supabase
        .from('growth_communities')
        .insert({
          name: `Fixed Test Community for ${school.name}`,
          school_id: school.id,
          generation_id: null,
          created_by: userId
        })
        .select()
        .single();

      if (fixedError) {
        console.log('❌ UNEXPECTED FAILURE - Community creation still failed:', fixedError.message);
      } else {
        console.log('✅ SUCCESS - Community created after fixing has_generations:', fixedCommunity.name);
        
        // Clean up the test community
        await supabase
          .from('growth_communities')
          .delete()
          .eq('id', fixedCommunity.id);
        console.log('🧹 Cleaned up test community');
      }

      // Clean up test school if it was created by us
      if (school.name === 'Test School for NULL Investigation') {
        await supabase
          .from('schools')
          .delete()
          .eq('id', school.id);
        console.log('🧹 Cleaned up test school');
      }
    }

    // 4. Show the trigger function logic
    console.log('\n4. TRIGGER FUNCTION ANALYSIS:');
    console.log('The check_community_organization() trigger fails because:');
    console.log('- When has_generations IS NULL, the condition "school_rec.has_generations = true" evaluates to NULL');
    console.log('- In PostgreSQL, NULL = true returns NULL (not false)');
    console.log('- The trigger logic doesn\'t handle the NULL case properly');
    console.log('- This causes constraint violations when trying to create communities');

    // 5. Check how many schools might be affected
    console.log('\n5. PRODUCTION IMPACT ANALYSIS:');
    const { data: allSchools, error: allError } = await supabase
      .from('schools')
      .select('id, name, has_generations');

    if (allError) {
      console.error('❌ Error getting all schools:', allError);
      return;
    }

    const nullCount = allSchools.filter(s => s.has_generations === null).length;
    const trueCount = allSchools.filter(s => s.has_generations === true).length;
    const falseCount = allSchools.filter(s => s.has_generations === false).length;

    console.log(`Total schools: ${allSchools.length}`);
    console.log(`- has_generations = NULL: ${nullCount}`);
    console.log(`- has_generations = true: ${trueCount}`);
    console.log(`- has_generations = false: ${falseCount}`);

    if (nullCount > 0) {
      console.log('\n⚠️  SCHOOLS WITH NULL has_generations (potential bug sources):');
      allSchools
        .filter(s => s.has_generations === null)
        .forEach(school => {
          console.log(`   - ID ${school.id}: ${school.name}`);
        });
    }

  } catch (error) {
    console.error('❌ Investigation failed:', error);
  }
}

// Run the investigation
investigateNullValues()
  .then(() => {
    console.log('\n✅ Investigation complete');
    process.exit(0);
  })
  .catch(error => {
    console.error('💥 Investigation crashed:', error);
    process.exit(1);
  });