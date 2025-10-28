import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { randomUUID } from 'node:crypto';

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceKey) {
    console.error('Faltan NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY');
    process.exit(1);
  }

  const client = createClient(url, serviceKey);

  const { data: rubric, error: rubricError } = await client
    .from('transformation_rubric')
    .select('id')
    .eq('area', 'personalizacion')
    .limit(1)
    .single();

  if (rubricError || !rubric) {
    console.error('No se encontró ninguna rúbrica de personalización:', rubricError);
    process.exit(1);
  }

  const communityId = 'eeac5776-98f3-4169-8ba6-3bdec1d84e03';
  const userId = process.env.TEST_ADMIN_USER_ID ?? '4ae17b21-8977-425c-b05a-ca7cdb8b9df5';
  const assessmentId = randomUUID();
  const now = new Date().toISOString();

  const { error: insertAssessmentError } = await client.from('transformation_assessments').insert({
    id: assessmentId,
    growth_community_id: communityId,
    area: 'personalizacion',
    status: 'in_progress',
    created_by: userId,
    started_at: now,
    updated_at: now,
  });

  if (insertAssessmentError) {
    console.error('Error al crear assessment:', insertAssessmentError);
    process.exit(1);
  }

  const { error: messageError } = await client.from('transformation_conversation_messages').insert([
    {
      assessment_id: assessmentId,
      rubric_item_id: rubric.id,
      role: 'user',
      content:
        'Somos el equipo de prueba y queremos validar que las métricas registran las interacciones.'
    },
    {
      assessment_id: assessmentId,
      rubric_item_id: rubric.id,
      role: 'assistant',
      content:
        'Perfecto, esta respuesta simula lo que entregaría el asistente conversacional para la interfaz de métricas.'
    }
  ]);

  if (messageError) {
    console.error('Error al insertar mensajes:', messageError);
    process.exit(1);
  }

  const { error: usageError } = await client.from('transformation_llm_usage').insert({
    user_id: userId,
    assessment_id: assessmentId,
    model: 'claude-3-5-sonnet-20241022',
    input_tokens: 456,
    output_tokens: 187,
    latency_ms: 1320,
    created_at: now,
  });

  if (usageError) {
    console.error('Error al registrar uso del LLM:', usageError);
    process.exit(1);
  }

  console.log('Datos de métricas creados con éxito:', assessmentId);
}

main().catch((error) => {
  console.error('Fallo inesperado sembrando métricas:', error);
  process.exit(1);
});
