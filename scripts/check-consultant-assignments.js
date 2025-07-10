const { createClient } = require('@supabase/supabase-js');

// Supabase configuration
const supabaseUrl = 'https://sxlogxqzmarhqsblxmtj.supabase.co';
const supabaseServiceKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InN4bG9neHF6bWFyaHFzYmx4bXRqIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc0NzMyMjIyMSwiZXhwIjoyMDYyODk4MjIxfQ.OiyMUeIoCc_mH7G5xZms1AhDyYM3jXqqIjccSL0JmWI';

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function checkConsultantAssignments() {
  try {
    console.log('Checking consultant_assignments table...\n');
    
    // Get all records from consultant_assignments
    const { data: assignments, error } = await supabase
      .from('consultant_assignments')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching consultant assignments:', error);
      return;
    }

    console.log(`Found ${assignments.length} records in consultant_assignments table\n`);
    
    if (assignments.length === 0) {
      console.log('No consultant assignments found.');
      return;
    }

    // Display each record
    assignments.forEach((assignment, index) => {
      console.log(`\nRecord ${index + 1}:`);
      console.log('  ID:', assignment.id);
      console.log('  Consultant ID:', assignment.consultant_id);
      console.log('  Student ID:', assignment.student_id);
      console.log('  Assigned At:', assignment.assigned_at);
      console.log('  Assigned By:', assignment.assigned_by);
      console.log('  Is Active:', assignment.is_active);
      console.log('  Created At:', assignment.created_at);
      console.log('  Updated At:', assignment.updated_at);
    });

    // Get count of active assignments
    const activeCount = assignments.filter(a => a.is_active).length;
    console.log(`\n\nSummary:`);
    console.log(`  Total assignments: ${assignments.length}`);
    console.log(`  Active assignments: ${activeCount}`);
    console.log(`  Inactive assignments: ${assignments.length - activeCount}`);

  } catch (error) {
    console.error('Unexpected error:', error);
  }
}

checkConsultantAssignments();