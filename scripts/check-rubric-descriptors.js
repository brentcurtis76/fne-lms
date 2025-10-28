// Check rubric descriptors for Objetivo 1, Accion 1
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = 'https://sxlogxqzmarhqsblxmtj.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InN4bG9neHF6bWFyaHFzYmx4bXRqIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc0NzMyMjIyMSwiZXhwIjoyMDYyODk4MjIxfQ.OiyMUeIoCc_mH7G5xZms1AhDyYM3jXqqIjccSL0JmWI';

const supabase = createClient(supabaseUrl, supabaseKey);

async function checkRubricDescriptors() {
  console.log('🔍 Querying rubric descriptors for Objetivo 1, Acción 1...\n');

  const { data, error } = await supabase
    .from('transformation_rubric')
    .select('objective_text, action_text, dimension, level_1_descriptor, level_2_descriptor, level_3_descriptor, level_4_descriptor')
    .eq('objective_number', 1)
    .eq('action_number', 1)
    .order('dimension', { ascending: true });

  if (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }

  if (!data || data.length === 0) {
    console.log('⚠️ No rubric items found for Objetivo 1, Acción 1');
    process.exit(1);
  }

  console.log(`✅ Found ${data.length} dimensions\n`);
  console.log('═'.repeat(80));

  data.forEach((item, index) => {
    console.log(`\n📊 Dimension ${index + 1}: ${item.dimension.toUpperCase()}`);
    console.log('─'.repeat(80));
    console.log(`Objetivo: ${item.objective_text}`);
    console.log(`Acción: ${item.action_text}`);
    console.log('');
    console.log('🔹 Nivel 1 - Incipiente:');
    console.log(`   ${item.level_1_descriptor}`);
    console.log('');
    console.log('🔹 Nivel 2 - Emergente:');
    console.log(`   ${item.level_2_descriptor}`);
    console.log('');
    console.log('🔹 Nivel 3 - Avanzado:');
    console.log(`   ${item.level_3_descriptor}`);
    console.log('');
    console.log('🔹 Nivel 4 - Consolidado:');
    console.log(`   ${item.level_4_descriptor}`);
    console.log('');
    console.log('═'.repeat(80));
  });

  console.log('\n✅ Query complete');
}

checkRubricDescriptors();
