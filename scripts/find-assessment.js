const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function findAssessment() {
  const { data, error } = await supabase
    .from('transformation_assessments')
    .select('id, community_id, status, context_metadata')
    .eq('area', 'personalizacion')
    .order('created_at', { ascending: false })
    .limit(10);

  if (error) {
    console.error('Error:', error);
    return;
  }

  if (!data || data.length === 0) {
    console.log('❌ No assessments found');
    return;
  }

  console.log(`Found ${data.length} assessments:\n`);
  data.forEach((a, i) => {
    const hasEval = !!a.context_metadata?.evaluation;
    const hasResponses = !!a.context_metadata?.responses;
    console.log(`${i+1}. ID: ${a.id}`);
    console.log(`   Community: ${a.community_id}`);
    console.log(`   Status: ${a.status}`);
    console.log(`   Has evaluation: ${hasEval ? '✅' : '❌'}`);
    console.log(`   Has responses: ${hasResponses ? '✅' : '❌'}`);
    console.log('');
  });

  // Find one with evaluation
  const withEval = data.find(a => a.context_metadata?.evaluation);
  if (withEval) {
    console.log(`\n✅ FOUND assessment with evaluation data!`);
    console.log(`   ID: ${withEval.id}`);
    console.log(`   Community: ${withEval.community_id}`);
    console.log(`\n🎯 Navigate to:`);
    console.log(`   http://localhost:3000/community/transformation/report?communityId=${withEval.community_id}`);
  } else {
    console.log(`\n⚠️  No assessment with evaluation found.`);
    console.log(`Will seed the first one with mock data...`);

    const target = data[0];
    console.log(`\nSeeding: ${target.id}`);

    // Seed it
    const MOCK_EVAL = {
      overall_stage: 3,
      overall_stage_label: 'Avanzado',
      summary: 'El establecimiento demuestra desarrollo avanzado en personalización del aprendizaje con estructura sistemática, planes personales implementados, y evidencias de diferenciación curricular.',
      strengths: [
        'Implementación sistemática de planes personales con seguimiento estructurado',
        'Sistema de tutoría con entrevistas regulares mensuales',
        'Uso efectivo de plataforma LMS para seguimiento',
        'Trabajo diferenciado en asignaturas clave',
      ],
      growth_areas: [
        'Ampliar profundidad más allá de metas académicas',
        'Incrementar frecuencia de tutorías en niveles superiores',
        'Expandir cobertura a más niveles',
      ],
      recommendations: [
        'Expandir mejores prácticas a todos los niveles',
        'Implementar portafolio digital estudiantil',
        'Establecer indicadores de seguimiento',
      ],
      dimension_evaluations: [
        { rubricItemId: 'mock-1', dimension: 'Cobertura', level: 4, objective_number: 1 },
        { rubricItemId: 'mock-2', dimension: 'Frecuencia', level: 4, objective_number: 1 },
        { rubricItemId: 'mock-3', dimension: 'Profundidad', level: 3, objective_number: 1 },
        { rubricItemId: 'mock-4', dimension: 'Cobertura', level: 3, objective_number: 2 },
        { rubricItemId: 'mock-5', dimension: 'Frecuencia', level: 3, objective_number: 2 },
        { rubricItemId: 'mock-6', dimension: 'Profundidad', level: 2, objective_number: 2 },
        { rubricItemId: 'mock-7', dimension: 'Cobertura', level: 3, objective_number: 3 },
        { rubricItemId: 'mock-8', dimension: 'Frecuencia', level: 3, objective_number: 3 },
        { rubricItemId: 'mock-9', dimension: 'Profundidad', level: 2, objective_number: 3 },
        { rubricItemId: 'mock-10', dimension: 'Cobertura', level: 4, objective_number: 4 },
        { rubricItemId: 'mock-11', dimension: 'Frecuencia', level: 3, objective_number: 4 },
        { rubricItemId: 'mock-12', dimension: 'Profundidad', level: 3, objective_number: 4 },
      ]
    };

    const updatedMetadata = {
      ...target.context_metadata,
      evaluation: MOCK_EVAL,
    };

    const { error: updateError } = await supabase
      .from('transformation_assessments')
      .update({
        context_metadata: updatedMetadata,
        status: 'completed',
        completed_at: new Date().toISOString(),
      })
      .eq('id', target.id);

    if (updateError) {
      console.error('❌ Seed error:', updateError);
      return;
    }

    console.log(`✅ Seeded successfully!`);
    console.log(`\n🎯 Navigate to:`);
    console.log(`   http://localhost:3000/community/transformation/report?communityId=${target.community_id}`);
  }
}

findAssessment().catch(console.error);
