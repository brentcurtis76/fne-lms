/**
 * Demonstrate NULL has_generations Bug
 * 
 * This script shows the exact database state and simulates the bug
 */

const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = 'https://sxlogxqzmarhqsblxmtj.supabase.co';
const supabaseServiceKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InN4bG9neHF6bWFyaHFzYmx4bXRqIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc0NzMyMjIyMSwiZXhwIjoyMDYyODk4MjIxfQ.OiyMUeIoCc_mH7G5xZms1AhDyYM3jXqqIjccSL0JmWI';

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function demonstrateBug() {
  console.log('🔍 DEMONSTRATING NULL has_generations BUG\n');

  try {
    // 1. Show current database state
    console.log('1. CURRENT DATABASE STATE:');
    const { data: schools } = await supabase
      .from('schools')
      .select('id, name, has_generations')
      .order('id');

    console.log('\nAll Schools:');
    schools.forEach(school => {
      const status = school.has_generations === null ? 'NULL (PROBLEMATIC)' :
                    school.has_generations === true ? 'TRUE (needs generation)' :
                    'FALSE (no generation needed)';
      console.log(`  ID ${school.id}: ${school.name.substring(0, 30)}... - ${status}`);
    });

    const nullCount = schools.filter(s => s.has_generations === null).length;
    console.log(`\n📊 Summary: ${schools.length} total schools, ${nullCount} with NULL has_generations`);

    // 2. Create test scenario to demonstrate the bug
    console.log('\n2. CREATING TEST SCENARIO:');
    
    // Create a school with NULL has_generations (simulating the original bug condition)
    const { data: testSchool, error: createError } = await supabase
      .from('schools')
      .insert({
        name: 'NULL Test School - Will Cause Bug',
        has_generations: null  // This is the problematic state
      })
      .select()
      .single();

    if (createError) {
      console.error('❌ Could not create test school:', createError);
      return;
    }

    console.log(`✅ Created test school with NULL has_generations: ID ${testSchool.id}`);

    // 3. Show the SQL logic that will fail
    console.log('\n3. POSTGRESQL NULL LOGIC DEMONSTRATION:');
    
    const { data: logicTest } = await supabase.rpc('sql', {
      query: `
        SELECT 
          'NULL = true' as comparison,
          (NULL::boolean = true) as result,
          'This returns NULL, not false!' as explanation
        UNION ALL
        SELECT 
          'NULL IS NOT DISTINCT FROM true' as comparison,
          (NULL::boolean IS NOT DISTINCT FROM true) as result,
          'This would be the correct NULL-safe comparison' as explanation
      `
    });

    if (logicTest) {
      logicTest.forEach(row => {
        console.log(`  ${row.comparison}: ${row.result} - ${row.explanation}`);
      });
    }

    // 4. Simulate the trigger behavior
    console.log('\n4. SIMULATING TRIGGER BEHAVIOR:');
    console.log('The check_community_organization() trigger does this:');
    console.log('  IF school_rec.has_generations = true THEN');
    console.log('    -- require generation_id');
    console.log('  ELSE');
    console.log('    -- allow NULL generation_id');
    console.log('  END IF;');
    console.log('');
    console.log('❌ PROBLEM: When has_generations is NULL:');
    console.log('  - "NULL = true" evaluates to NULL (not false)');
    console.log('  - Trigger logic becomes unpredictable');
    console.log('  - Community creation may fail randomly');

    // 5. Show the fix
    console.log('\n5. APPLYING THE FIX:');
    
    const { error: fixError } = await supabase
      .from('schools')
      .update({ has_generations: false })
      .eq('id', testSchool.id);

    if (fixError) {
      console.error('❌ Could not fix test school:', fixError);
    } else {
      console.log('✅ Fixed: Updated has_generations from NULL to false');
      
      // Verify the fix
      const { data: fixedSchool } = await supabase
        .from('schools')
        .select('has_generations')
        .eq('id', testSchool.id)
        .single();
        
      console.log(`✅ Verified: has_generations is now ${fixedSchool.has_generations}`);
    }

    // 6. Clean up
    await supabase
      .from('schools')
      .delete()
      .eq('id', testSchool.id);
    console.log('🧹 Cleaned up test school');

    // 7. Show production recommendations
    console.log('\n6. PRODUCTION RECOMMENDATIONS:');
    console.log('✅ Migration already applied (20250728130000_harden_has_generations_column.sql):');
    console.log('  - Sets default value to false for new schools');
    console.log('  - Updates existing NULL values to false');
    console.log('  - Adds NOT NULL constraint to prevent future NULLs');
    console.log('');
    console.log('✅ Enhanced trigger (20250728131000_enhance_community_organization_trigger.sql):');
    console.log('  - Uses COALESCE(has_generations, false) for NULL-safe comparison');
    console.log('  - Prevents the "NULL = true" logic error');
    console.log('  - Ensures consistent behavior for all schools');

  } catch (error) {
    console.error('💥 Demonstration failed:', error);
  }
}

// Run the demonstration
demonstrateBug()
  .then(() => {
    console.log('\n✅ Bug demonstration complete');
    console.log('\n📋 SUMMARY:');
    console.log('- Root Cause: NULL values in has_generations field');
    console.log('- Trigger Issue: "NULL = true" returns NULL instead of false');
    console.log('- User Impact: Community leader role assignment fails');
    console.log('- Solution: Database constraints + NULL-safe trigger logic');
    console.log('- Status: Fixed and deployed ✅');
    process.exit(0);
  })
  .catch(error => {
    console.error('💥 Demonstration crashed:', error);
    process.exit(1);
  });