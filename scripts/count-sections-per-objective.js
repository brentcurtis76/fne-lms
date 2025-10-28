const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = 'https://sxlogxqzmarhqsblxmtj.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InN4bG9neHF6bWFyaHFzYmx4bXRqIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc0NzMyMjIyMSwiZXhwIjoyMDYyODk4MjIxfQ.OiyMUeIoCc_mH7G5xZms1AhDyYM3jXqqIjccSL0JmWI';

const supabase = createClient(supabaseUrl, supabaseKey);

(async () => {
  const { data, error } = await supabase
    .from('transformation_rubric')
    .select('objective_number, action_number')
    .eq('area', 'personalizacion')
    .order('objective_number')
    .order('action_number');

  if (error) {
    console.error('Error:', error);
    process.exit(1);
  }

  // Group by objective
  const byObjective = {};
  data.forEach(item => {
    if (!byObjective[item.objective_number]) {
      byObjective[item.objective_number] = { actions: new Set(), dimensions: 0 };
    }
    byObjective[item.objective_number].actions.add(item.action_number);
    byObjective[item.objective_number].dimensions++;
  });

  console.log('Sections per Objetivo:');
  console.log('(Each action has 1 accion section + 3 dimension sections)');
  console.log('');

  let cumulativeSections = 0;
  Object.keys(byObjective).sort().forEach(obj => {
    const actions = byObjective[obj].actions.size;
    const dimensions = byObjective[obj].dimensions;
    const sections = actions + dimensions; // accion sections + dimension sections
    const lastSectionIndex = cumulativeSections + sections - 1;

    console.log(`Objetivo ${obj}:`);
    console.log(`  ${actions} action(s) × 4 sections = ${sections} total sections`);
    console.log(`  Section range: ${cumulativeSections} to ${lastSectionIndex}`);
    console.log(`  Last section index: ${lastSectionIndex}`);
    console.log('');

    cumulativeSections += sections;
  });

  console.log(`Total sections: ${cumulativeSections}`);
})();
