const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const ASSESSMENT_ID = '2230958d-1fd4-4bfb-ad77-83bfa043c366';

const MOCK_EVALUATION = {
  overall_stage: 3,
  overall_stage_label: 'Avanzado',
  summary: 'El establecimiento demuestra un desarrollo avanzado en la implementación de prácticas de personalización del aprendizaje. Se observa una estructura sistemática con planes personales implementados en varios niveles, sistema de tutoría activo, y evidencias de diferenciación curricular. Las principales fortalezas se encuentran en cobertura y frecuencia, mientras que la profundidad presenta oportunidades de mejora.',
  strengths: [
    'Implementación sistemática de planes personales desde Pre-Kinder hasta 2º básico con seguimiento estructurado',
    'Sistema de tutoría establecido con entrevistas regulares mensuales',
    'Uso efectivo de plataforma LMS para seguimiento personalizado',
    'Trabajo diferenciado en asignaturas clave (matemáticas, lenguaje, ciencias)',
    'Participación activa de familias en el proceso'
  ],
  growth_areas: [
    'Ampliar profundidad de personalización más allá de metas académicas',
    'Incrementar frecuencia de tutorías en niveles superiores',
    'Expandir cobertura a cursos 4º-6º básico',
    'Sistematizar evaluación de impacto'
  ],
  recommendations: [
    'Expandir piloto de 3º básico a niveles 4º y 5º',
    'Implementar portafolio digital estudiantil',
    'Crear espacios de intercambio entre docentes',
    'Establecer indicadores claros de seguimiento'
  ],
  dimension_evaluations: [
    { rubricItemId: 'a6bed0f2-cf31-4bfd-b1a3-299965de7359', dimension: 'Cobertura', level: 4, objective_number: 1 },
    { rubricItemId: 'cce58bee-8bfd-44a7-9391-db1e4d9f043b', dimension: 'Frecuencia', level: 4, objective_number: 1 },
    { rubricItemId: '3955f4b2-a68b-488e-ae39-9736c04ef9b5', dimension: 'Profundidad', level: 3, objective_number: 1 },
    { rubricItemId: '21ef11b1-323a-4317-8cfb-0cbfeeb7abca', dimension: 'Cobertura', level: 3, objective_number: 2 },
    { rubricItemId: 'cd5348fe-1c5a-4e58-8b08-e96e94fdeab9', dimension: 'Frecuencia', level: 3, objective_number: 2 },
    { rubricItemId: 'bec1b949-4bba-4767-9571-e4b2785d3ee9', dimension: 'Profundidad', level: 2, objective_number: 2 },
    { rubricItemId: '2633b0d9-60c5-4460-ba4a-b1c57fc624d5', dimension: 'Cobertura', level: 3, objective_number: 3 },
    { rubricItemId: 'af53f098-cac3-46c4-90b6-9fffe0887f43', dimension: 'Frecuencia', level: 3, objective_number: 3 },
    { rubricItemId: 'f2392490-f18b-4277-a706-56527070bb67', dimension: 'Profundidad', level: 2, objective_number: 3 },
    { rubricItemId: 'aaf72e8e-00ef-45ca-b783-1da0ff754d52', dimension: 'Cobertura', level: 4, objective_number: 4 },
    { rubricItemId: '8b81bc79-e561-4fb1-93b4-ed60cd5ba9a2', dimension: 'Frecuencia', level: 3, objective_number: 4 },
    { rubricItemId: '4ed8e9c2-86d6-424a-9e2f-304483f451ae', dimension: 'Profundidad', level: 3, objective_number: 4 },
    { rubricItemId: '56ccb7e0-dfcc-4685-a771-3188de505619', dimension: 'Cobertura', level: 2, objective_number: 4 },
    { rubricItemId: '8a07ba7e-6e64-4d08-9e7f-5f33bf96d905', dimension: 'Frecuencia', level: 3, objective_number: 4 },
    { rubricItemId: '8ad3eec1-221d-48d7-9b50-7719143034c3', dimension: 'Profundidad', level: 2, objective_number: 4 },
    { rubricItemId: '889b122a-53ca-4852-afd5-6eb6a358a290', dimension: 'Cobertura', level: 1, objective_number: 4 },
    { rubricItemId: '7d641da9-38aa-4c31-94e1-9d32d20ddfea', dimension: 'Frecuencia', level: 1, objective_number: 4 },
    { rubricItemId: 'ed9d38c4-92d9-49dc-b611-946071a37869', dimension: 'Profundidad', level: 1, objective_number: 4 },
  ]
};

async function main() {
  console.log('🔍 Checking assessment...\n');

  const { data: assessment, error: fetchError } = await supabase
    .from('transformation_assessments')
    .select('*')
    .eq('id', ASSESSMENT_ID)
    .maybeSingle();

  if (fetchError) {
    console.error('❌ Error:', fetchError);
    return;
  }

  if (!assessment) {
    console.error('❌ Assessment not found');
    return;
  }

  console.log('✅ Assessment found');
  console.log('📊 Seeding mock evaluation data...\n');

  const updatedMetadata = {
    ...assessment.context_metadata,
    evaluation: MOCK_EVALUATION,
    objective_evaluations: {
      '1': { objective_number: 1, average_level: 3.67, dimension_count: 3 },
      '2': { objective_number: 2, average_level: 2.67, dimension_count: 3 },
      '3': { objective_number: 3, average_level: 2.67, dimension_count: 3 },
      '4': { objective_number: 4, average_level: 2.33, dimension_count: 9 },
    }
  };

  const { error: updateError } = await supabase
    .from('transformation_assessments')
    .update({
      context_metadata: updatedMetadata,
      status: 'completed',
      completed_at: new Date().toISOString(),
    })
    .eq('id', ASSESSMENT_ID);

  if (updateError) {
    console.error('❌ Update error:', updateError);
    return;
  }

  console.log('✅ Mock evaluation data seeded successfully!\n');
  console.log('🎯 Now navigate to:');
  console.log('   http://localhost:3000/community/transformation/report?communityId=2230958d-1fd4-4bfb-ad77-83bfa043c366');
  console.log('\nYou should see professional visualizations with FNE colors!');
}

main().catch(console.error);
