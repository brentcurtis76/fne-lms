// Apply rubric descriptor updates via Supabase
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = 'https://sxlogxqzmarhqsblxmtj.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InN4bG9neHF6bWFyaHFzYmx4bXRqIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc0NzMyMjIyMSwiZXhwIjoyMDYyODk4MjIxfQ.OiyMUeIoCc_mH7G5xZms1AhDyYM3jXqqIjccSL0JmWI';

const supabase = createClient(supabaseUrl, supabaseKey);

async function applyRubricUpdates() {
  console.log('🔧 Applying rubric descriptor updates...\n');

  try {
    // ========================================
    // 1. Update COBERTURA descriptors
    // ========================================
    console.log('📊 Updating COBERTURA descriptors...');
    const { error: coberturaError } = await supabase
      .from('transformation_rubric')
      .update({
        level_1_descriptor: 'Implementación piloto con menos de 50 estudiantes o 1-2 cursos aislados',
        level_2_descriptor: 'Implementación con 50-200 estudiantes o en 2-4 cursos (generación tractor: 1-2 niveles educativos completos)',
        level_3_descriptor: 'Implementación con más de 200 estudiantes o en la mayoría de niveles educativos, aunque con diferencias entre docentes',
        level_4_descriptor: 'Implementación institucional con toda la matrícula de manera articulada y sistemática'
      })
      .eq('dimension', 'cobertura');

    if (coberturaError) throw coberturaError;
    console.log('✅ COBERTURA descriptors updated\n');

    // ========================================
    // 2. Update FRECUENCIA descriptors
    // ========================================
    console.log('📊 Updating FRECUENCIA descriptors...');
    const { error: frecuenciaError } = await supabase
      .from('transformation_rubric')
      .update({
        level_1_descriptor: 'Actividad realizada una vez al año o de manera esporádica (inicio de año escolar)',
        level_2_descriptor: 'Actividad realizada 2 veces al año (semestral: inicio y cierre de semestre)',
        level_3_descriptor: 'Actividad realizada de manera regular (trimestral, bimestral o mensual)',
        level_4_descriptor: 'Actividad integrada sistemáticamente en la vida escolar (semanal o continua)'
      })
      .eq('dimension', 'frecuencia');

    if (frecuenciaError) throw frecuenciaError;
    console.log('✅ FRECUENCIA descriptors updated\n');

    // ========================================
    // 3. Update PROFUNDIDAD descriptors (Objectives 1-3)
    // ========================================
    console.log('📊 Updating PROFUNDIDAD descriptors for Objectives 1-3...');
    const { error: profundidad13Error } = await supabase
      .from('transformation_rubric')
      .update({
        level_1_descriptor: 'Registro superficial con información básica o metas genéricas sin seguimiento',
        level_2_descriptor: 'Incluye algunas reflexiones del estudiante y evidencias específicas de aprendizaje',
        level_3_descriptor: 'Fomenta autonomía estudiantil, autorregulación y procesos metacognitivos documentados',
        level_4_descriptor: 'Conecta con el proyecto vital del estudiante, involucra activamente a familia y comunidad'
      })
      .eq('dimension', 'profundidad')
      .in('objective_number', [1, 2, 3]);

    if (profundidad13Error) throw profundidad13Error;
    console.log('✅ PROFUNDIDAD descriptors updated for Objectives 1-3\n');

    // ========================================
    // 4. Update PROFUNDIDAD descriptors (Objectives 4-7)
    // ========================================
    console.log('📊 Updating PROFUNDIDAD descriptors for Objectives 4-7...');
    const { error: profundidad47Error } = await supabase
      .from('transformation_rubric')
      .update({
        level_1_descriptor: 'Prácticas iniciales sin sistematización, aplicadas ocasionalmente por algunos docentes',
        level_2_descriptor: 'Prácticas documentadas con resultados iniciales visibles, requiere acompañamiento constante',
        level_3_descriptor: 'Prácticas consolidadas con impacto medible en el aprendizaje, replicadas por la mayoría',
        level_4_descriptor: 'Prácticas institucionalizadas con innovación continua, modelo de referencia para otros'
      })
      .eq('dimension', 'profundidad')
      .gte('objective_number', 4)
      .lte('objective_number', 7);

    if (profundidad47Error) throw profundidad47Error;
    console.log('✅ PROFUNDIDAD descriptors updated for Objectives 4-7\n');

    // ========================================
    // 5. Update PROFUNDIDAD descriptors (Objectives 8-11)
    // ========================================
    console.log('📊 Updating PROFUNDIDAD descriptors for Objectives 8-11...');
    const { error: profundidad811Error } = await supabase
      .from('transformation_rubric')
      .update({
        level_1_descriptor: 'Infraestructura o sistema básico sin integración, uso limitado o esporádico',
        level_2_descriptor: 'Sistema funcional con algunas integraciones, uso regular por parte de algunos actores',
        level_3_descriptor: 'Sistema robusto e integrado, uso generalizado con impacto medible en la gestión',
        level_4_descriptor: 'Sistema avanzado totalmente integrado, optimizado continuamente, referente institucional'
      })
      .eq('dimension', 'profundidad')
      .gte('objective_number', 8)
      .lte('objective_number', 11);

    if (profundidad811Error) throw profundidad811Error;
    console.log('✅ PROFUNDIDAD descriptors updated for Objectives 8-11\n');

    // ========================================
    // 6. Verify updates
    // ========================================
    console.log('🔍 Verifying updates for Objetivo 1, Acción 1...');
    const { data: verifyData, error: verifyError } = await supabase
      .from('transformation_rubric')
      .select('dimension, level_1_descriptor, level_2_descriptor, level_3_descriptor, level_4_descriptor')
      .eq('objective_number', 1)
      .eq('action_number', 1)
      .order('dimension');

    if (verifyError) throw verifyError;

    console.log('\n✅ Verification Results:\n');
    verifyData.forEach(item => {
      console.log(`📊 ${item.dimension.toUpperCase()}:`);
      console.log(`   Nivel 1: ${item.level_1_descriptor}`);
      console.log(`   Nivel 2: ${item.level_2_descriptor}`);
      console.log(`   Nivel 3: ${item.level_3_descriptor}`);
      console.log(`   Nivel 4: ${item.level_4_descriptor}`);
      console.log('');
    });

    console.log('🎉 All rubric descriptor updates completed successfully!');

  } catch (error) {
    console.error('❌ Error applying updates:', error);
    process.exit(1);
  }
}

applyRubricUpdates();
