#!/usr/bin/env node

// Test script to simulate consultant assignment creation with community
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function testCommunityAssignment() {
  console.log('🧪 Testing Consultant Assignment with Community...\n');

  try {
    // 1. Get a test consultant
    const { data: consultants, error: consultError } = await supabase
      .from('profiles')
      .select('id, first_name, last_name, email')
      .in('role', ['consultor', 'admin'])
      .limit(1);

    if (consultError || !consultants?.length) {
      console.error('❌ No consultants found:', consultError);
      return;
    }

    const consultant = consultants[0];
    console.log(`👤 Test Consultant: ${consultant.first_name} ${consultant.last_name} (${consultant.id})`);

    // 2. Get a test community
    const { data: communities, error: commError } = await supabase
      .from('growth_communities')
      .select('id, name, school_id, generation_id')
      .limit(1);

    if (commError || !communities?.length) {
      console.error('❌ No communities found:', commError);
      return;
    }

    const community = communities[0];
    console.log(`🏘️ Test Community: ${community.name} (${community.id})`);
    console.log(`   School ID: ${community.school_id}`);
    console.log(`   Generation ID: ${community.generation_id || 'NULL'}`);

    // 3. Prepare test assignment data
    const testAssignment = {
      consultant_id: consultant.id,
      student_id: null, // Group assignment
      assignment_type: 'comprehensive',
      can_view_progress: true,
      can_assign_courses: false,
      can_message_student: true,
      starts_at: new Date().toISOString(),
      ends_at: null,
      is_active: true,
      assigned_by: consultant.id, // Using consultant as assigner for test
      school_id: community.school_id,
      generation_id: community.generation_id,
      community_id: community.id,
      assignment_data: {
        assignment_scope: 'community'
      }
    };

    console.log('\n📝 Assignment Data to Insert:');
    console.log(JSON.stringify(testAssignment, null, 2));

    // 4. Try to insert the assignment
    console.log('\n🚀 Attempting to create assignment...');
    const { data: newAssignment, error: insertError } = await supabase
      .from('consultant_assignments')
      .insert(testAssignment)
      .select()
      .single();

    if (insertError) {
      console.error('\n❌ Failed to create assignment:');
      console.error('Error message:', insertError.message);
      console.error('Error details:', insertError.details);
      console.error('Error hint:', insertError.hint);
      console.error('Error code:', insertError.code);
      
      // Additional debugging
      if (insertError.message.includes('foreign key')) {
        console.log('\n🔍 Foreign Key Error Detected!');
        console.log('Possible causes:');
        console.log('  1. community_id does not exist in growth_communities table');
        console.log('  2. school_id does not exist in schools table');
        console.log('  3. generation_id does not exist in generations table');
        console.log('  4. consultant_id does not exist in profiles table');
        
        // Verify each foreign key
        console.log('\n🔍 Verifying foreign keys...');
        
        // Check community
        const { data: checkComm } = await supabase
          .from('growth_communities')
          .select('id')
          .eq('id', community.id)
          .single();
        console.log(`  Community ${community.id}: ${checkComm ? '✅ EXISTS' : '❌ NOT FOUND'}`);
        
        // Check school
        const { data: checkSchool } = await supabase
          .from('schools')
          .select('id')
          .eq('id', community.school_id)
          .single();
        console.log(`  School ${community.school_id}: ${checkSchool ? '✅ EXISTS' : '❌ NOT FOUND'}`);
        
        // Check generation if not null
        if (community.generation_id) {
          const { data: checkGen } = await supabase
            .from('generations')
            .select('id')
            .eq('id', community.generation_id)
            .single();
          console.log(`  Generation ${community.generation_id}: ${checkGen ? '✅ EXISTS' : '❌ NOT FOUND'}`);
        }
      }
    } else {
      console.log('\n✅ Assignment created successfully!');
      console.log('Assignment ID:', newAssignment.id);
      
      // Clean up test data
      console.log('\n🧹 Cleaning up test assignment...');
      const { error: deleteError } = await supabase
        .from('consultant_assignments')
        .delete()
        .eq('id', newAssignment.id);
      
      if (deleteError) {
        console.error('Failed to clean up:', deleteError);
      } else {
        console.log('✅ Test assignment deleted');
      }
    }

  } catch (error) {
    console.error('❌ Unexpected error:', error);
  }
}

// Run the test
testCommunityAssignment();