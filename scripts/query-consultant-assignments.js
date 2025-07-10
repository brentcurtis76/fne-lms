const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('Missing Supabase credentials');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function queryConsultantAssignments() {
  try {
    // Get all consultant assignments
    const { data, error } = await supabase
      .from('consultant_assignments')
      .select('assignment_type');

    if (error) {
      throw error;
    }

    // Count assignment types
    const typeCounts = {};
    data.forEach(row => {
      const type = row.assignment_type || 'NULL';
      typeCounts[type] = (typeCounts[type] || 0) + 1;
    });

    // Sort by count descending
    const sortedTypes = Object.entries(typeCounts)
      .sort(([, a], [, b]) => b - a);

    // Display results
    console.log('\nAssignment Type Distribution in consultant_assignments table:');
    console.log('=' .repeat(60));
    console.log(`${'Assignment Type'.padEnd(40)} ${'Count'.padStart(10)}`);
    console.log('-'.repeat(60));

    let total = 0;
    sortedTypes.forEach(([type, count]) => {
      console.log(`${type.padEnd(40)} ${count.toString().padStart(10)}`);
      total += count;
    });

    console.log('-'.repeat(60));
    console.log(`${'TOTAL'.padEnd(40)} ${total.toString().padStart(10)}`);
    console.log('=' .repeat(60));

  } catch (error) {
    console.error('Error querying consultant_assignments:', error);
  }
}

queryConsultantAssignments();