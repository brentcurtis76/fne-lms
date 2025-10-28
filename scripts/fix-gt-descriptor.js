// Fix the incorrect Generación Tractor reference in COBERTURA descriptors
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = 'https://sxlogxqzmarhqsblxmtj.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InN4bG9neHF6bWFyaHFzYmx4bXRqIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc0NzMyMjIyMSwiZXhwIjoyMDYyODk4MjIxfQ.OiyMUeIoCc_mH7G5xZms1AhDyYM3jXqqIjccSL0JmWI';

const supabase = createClient(supabaseUrl, supabaseKey);

async function fixGTDescriptor() {
  console.log('🔧 Fixing Generación Tractor reference in COBERTURA descriptors...\n');

  try {
    // Update Nivel 2 descriptor to remove incorrect GT reference
    const { error: updateError } = await supabase
      .from('transformation_rubric')
      .update({
        level_2_descriptor: 'Implementación con 50-200 estudiantes o en varios cursos de un mismo nivel educativo (ej: todo 5º y 6º básico)'
      })
      .eq('dimension', 'cobertura');

    if (updateError) throw updateError;

    console.log('✅ COBERTURA Nivel 2 descriptor updated\n');

    // Verify the change
    console.log('🔍 Verifying update for Objetivo 1, Acción 1...');
    const { data: verifyData, error: verifyError } = await supabase
      .from('transformation_rubric')
      .select('dimension, level_2_descriptor')
      .eq('objective_number', 1)
      .eq('action_number', 1)
      .eq('dimension', 'cobertura')
      .single();

    if (verifyError) throw verifyError;

    console.log('\n✅ Verification Result:');
    console.log(`📊 COBERTURA - Nivel 2:`);
    console.log(`   ${verifyData.level_2_descriptor}\n`);

    console.log('🎉 Generación Tractor reference corrected!');

  } catch (error) {
    console.error('❌ Error fixing GT descriptor:', error);
    process.exit(1);
  }
}

fixGTDescriptor();
