import type { SupabaseClient } from '@supabase/supabase-js';
import type { Json } from '@/types/supabase';

type TransformationAssessmentRow = {
  id: string;
  area: string;
  status: 'in_progress' | 'completed' | 'archived';
  conversation_history: Json | null;
  context_metadata: Json | null;
  growth_community_id: string;
  started_at: string;
  completed_at: string | null;
  updated_at: string;
};

type TransformationRubricRow = {
  id: string;
  area: string;
  objective_number: number;
  objective_text: string;
  action_number: number;
  action_text: string;
  dimension: 'cobertura' | 'frecuencia' | 'profundidad';
  level_1_descriptor: string;
  level_2_descriptor: string;
  level_3_descriptor: string;
  level_4_descriptor: string;
  initial_questions: string[];
  display_order: number;
};

type StoredMessageRow = {
  role: 'user' | 'assistant' | 'system';
  content: string;
  created_at: string;
};

export type ContextChunk = {
  role: 'system' | 'user' | 'assistant';
  content: string;
};

export interface ContextBuilderInput {
  supabase: SupabaseClient;
  assessmentId: string;
  rubricItemId: string;
  userId: string;
  maxHistoryMessages?: number;
}

export interface ContextBuilderOutput {
  assessment: {
    id: string;
    area: string;
    status: 'in_progress' | 'completed' | 'archived';
    started_at: string;
    updated_at: string;
    context_metadata: Record<string, unknown>;
  };
  rubric: {
    id: string;
    objective_number: number;
    action_number: number;
    dimension: 'cobertura' | 'frecuencia' | 'profundidad';
    objective_text: string;
    action_text: string;
    level_descriptors: Record<'1' | '2' | '3' | '4', string>;
    initial_questions: string[];
  };
  conversationHistory: ContextChunk[];
  prompt: ContextChunk[];
}

const GLOBAL_SYSTEM_PROMPT = [
  'Eres un facilitador experto en Vías de Transformación de Fundación Nueva Educación.',
  'Tu rol es ayudar a los equipos escolares a evaluar objetivamente su nivel de desarrollo mediante conversación reflexiva.',
  '',
  'CONTEXTO EDUCATIVO CHILENO:',
  '- Preescolar: Pre-Kínder, Kínder',
  '- Educación Básica: 1° a 8° básico (8 niveles)',
  '- Educación Media: 1° a 4° medio (4 niveles)',
  '- Las escuelas pueden tener diferentes combinaciones de estos niveles',
  '- Algunas escuelas solo tienen preescolar, otras solo básica, otras básica y media, etc.',
  '',
  'ENFOQUE DE EVALUACIÓN - COBERTURA:',
  '- Cuando el equipo mencione niveles escolares específicos (ej: "7° a 4° medio", "1° a 6° básico"), SIEMPRE pregunta: "¿Qué niveles escolares tiene tu escuela en total?"',
  '- La cobertura se calcula como porcentaje de los niveles que la escuela TIENE (no de un estándar hipotético)',
  '- Ejemplo: Si la escuela tiene 7° básico a 4° medio (6 niveles) y la práctica se implementa en todos, la cobertura es 100%',
  '- Ejemplo: Si la escuela tiene 1° básico a 4° medio (12 niveles) y la práctica se implementa en 7° a 4° medio (6 niveles), la cobertura es 50%',
  '',
  'PROCESO DE VALIDACIÓN:',
  '1. Recoge la evidencia inicial del equipo',
  '2. Si la información es ambigua, haz preguntas de validación específicas',
  '3. Una vez que tengas datos claros, sugiere un nivel con justificación',
  '4. El equipo puede confirmar o corregir si malinterpretaste algo',
  '',
  'ESTRUCTURA DE TU JUSTIFICACIÓN (rationale):',
  '- Cita específicamente lo que el equipo mencionó',
  '- Explica cómo esa evidencia se relaciona con el nivel sugerido',
  '- Usa un tono reflexivo y constructivo',
  '- Si necesitas más información para evaluar, explica qué necesitas saber',
].join('\n');

function normaliseConversationHistory(history: Json | null): ContextChunk[] {
  if (!history || !Array.isArray(history)) {
    return [];
  }

  return history
    .map((entry) => {
      if (
        entry &&
        typeof entry === 'object' &&
        'role' in entry &&
        'content' in entry
      ) {
        const roleValue = (entry as { role: unknown }).role;
        if (roleValue === 'user' || roleValue === 'assistant' || roleValue === 'system') {
          return {
            role: roleValue,
            content: String((entry as { content: unknown }).content ?? ''),
          } satisfies ContextChunk;
        }
      }
      return null;
    })
    .filter((item): item is ContextChunk => Boolean(item));
}

function normaliseMetadata(metadata: Json | null): Record<string, unknown> {
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) {
    return {};
  }
  return metadata as Record<string, unknown>;
}

function buildDimensionPrompt(rubric: TransformationRubricRow): ContextChunk[] {
  const descriptors = [
    `Nivel 1 (Incipiente): ${rubric.level_1_descriptor}`,
    `Nivel 2 (En desarrollo): ${rubric.level_2_descriptor}`,
    `Nivel 3 (Avanzado): ${rubric.level_3_descriptor}`,
    `Nivel 4 (Consolidado): ${rubric.level_4_descriptor}`,
  ]
    .map((line) => `- ${line}`)
    .join('\n');

  const content = [
    `Estamos evaluando el área "${rubric.area}" en la dimensión "${rubric.dimension}".`,
    `Objetivo ${rubric.objective_number}: ${rubric.objective_text}`,
    `Acción ${rubric.action_number}: ${rubric.action_text}`,
    '',
    'Referencias de nivel:',
    descriptors,
  ].join('\n');

  return [
    {
      role: 'system' as const,
      content,
    },
  ];
}

function buildMetadataPrompt(metadata: Record<string, unknown>): ContextChunk | null {
  const entries = Object.entries(metadata);
  if (entries.length === 0) {
    return null;
  }

  const lines = entries.map(([key, value]) => `- ${key}: ${JSON.stringify(value)}`);
  return {
    role: 'system',
    content: ['Contexto clave de la comunidad:', ...lines].join('\n'),
  };
}

function buildInitialQuestionsPrompt(questions: string[]): ContextChunk | null {
  if (!questions.length) {
    return null;
  }

  const text = questions.map((question) => `• ${question}`).join('\n');
  return {
    role: 'user',
    content: [
      'Para iniciar la conversación, responde a estas preguntas brevemente:',
      text,
    ].join('\n'),
  };
}

function buildSummaryPrompt(summary: Record<string, unknown> | undefined): ContextChunk | null {
  if (!summary || typeof summary !== 'object' || Array.isArray(summary)) {
    return null;
  }

  const pieces: string[] = [];
  const level = summary.suggested_level;
  if (typeof level === 'number') {
    pieces.push(`Nivel sugerido más reciente: ${level}.`);
  }

  if (typeof summary.rationale === 'string' && summary.rationale.length > 0) {
    pieces.push(`Resumen de la evidencia: ${summary.rationale}`);
  }

  if (pieces.length === 0) {
    return null;
  }

  return {
    role: 'system',
    content: ['Resumen previo de la conversación:', ...pieces].join('\n'),
  };
}

/**
 * Construye todo el contexto necesario para conversar con Claude.
 */
export async function buildTransformationContext({
  supabase,
  assessmentId,
  rubricItemId,
  userId,
  maxHistoryMessages = 20,
}: ContextBuilderInput): Promise<ContextBuilderOutput> {
  const assessmentResponse = await supabase
    .from('transformation_assessments')
    .select(
      [
        'id',
        'area',
        'status',
        'conversation_history',
        'context_metadata',
        'growth_community_id',
        'started_at',
        'completed_at',
        'updated_at',
      ].join(', ')
    )
    .eq('id', assessmentId)
    .single<TransformationAssessmentRow>();

  if (assessmentResponse.error) {
    const { code } = assessmentResponse.error;
    if (code === 'PGRST116' || code === 'PGRST301') {
      throw new Error('No tienes permiso para acceder a esta evaluación.');
    }

    console.error('[contextBuilder] Error inesperado al obtener assessment', {
      code,
      assessmentId,
      userId,
    });

    throw new Error('No se pudo acceder a la evaluación.');
  }

  const assessment = assessmentResponse.data;
  if (assessment.status === 'archived') {
    throw new Error('La evaluación está archivada y no acepta cambios.');
  }

  const rubricResponse = await supabase
    .from('transformation_rubric')
    .select('*')
    .eq('id', rubricItemId)
    .single<TransformationRubricRow>();

  if (rubricResponse.error) {
    const { message } = rubricResponse.error;
    throw new Error(`No encontramos la dimensión solicitada: ${message}`);
  }

  const rubric = rubricResponse.data;
  if (rubric.area !== assessment.area) {
    throw new Error('La dimensión seleccionada no pertenece a esta evaluación.');
  }

  const metadata = normaliseMetadata(assessment.context_metadata);
  const summaryMap = metadata?.conversation_summaries as
    | Record<string, Record<string, unknown>>
    | undefined;
  const dimensionSummary = summaryMap ? summaryMap[rubricItemId] : undefined;

  const { data: storedMessages, error: storedMessagesError } = await supabase
    .from('transformation_conversation_messages')
    .select('role, content, created_at')
    .eq('assessment_id', assessmentId)
    .eq('rubric_item_id', rubricItemId)
    .order('created_at', { ascending: false })
    .limit(maxHistoryMessages * 2);

  if (storedMessagesError && storedMessagesError.code !== 'PGRST116') {
    console.error('[contextBuilder] No se pudo obtener historial persistido', {
      error: storedMessagesError.message,
      assessmentId,
      rubricItemId,
    });
  }

  let conversationHistory: ContextChunk[];
  if (storedMessages && storedMessages.length > 0) {
    conversationHistory = storedMessages
      .map((row: StoredMessageRow) => ({
        role: row.role,
        content: row.content,
      }))
      .reverse()
      .slice(-maxHistoryMessages);
  } else {
    const rawHistory = normaliseConversationHistory(assessment.conversation_history);
    conversationHistory = rawHistory.slice(-maxHistoryMessages);
  }

  const prompt: ContextChunk[] = [
    { role: 'system', content: GLOBAL_SYSTEM_PROMPT },
    ...buildDimensionPrompt(rubric),
  ];

  const metadataPrompt = buildMetadataPrompt(metadata);
  if (metadataPrompt) {
    prompt.push(metadataPrompt);
  }

  const summaryPrompt = buildSummaryPrompt(dimensionSummary);
  if (summaryPrompt) {
    prompt.push(summaryPrompt);
  }

  prompt.push(...conversationHistory);

  // Si aún no hay diálogo, ofrecer preguntas iniciales.
  if (conversationHistory.length === 0) {
    const initialQuestionsPrompt = buildInitialQuestionsPrompt(rubric.initial_questions);
    if (initialQuestionsPrompt) {
      prompt.push(initialQuestionsPrompt);
    }
  }

  return {
    assessment: {
      id: assessment.id,
      area: assessment.area,
      status: assessment.status,
      started_at: assessment.started_at,
      updated_at: assessment.updated_at,
      context_metadata: metadata,
    },
    rubric: {
      id: rubric.id,
      objective_number: rubric.objective_number,
      action_number: rubric.action_number,
      dimension: rubric.dimension,
      objective_text: rubric.objective_text,
      action_text: rubric.action_text,
      level_descriptors: {
        '1': rubric.level_1_descriptor,
        '2': rubric.level_2_descriptor,
        '3': rubric.level_3_descriptor,
        '4': rubric.level_4_descriptor,
      },
      initial_questions: rubric.initial_questions ?? [],
    },
    conversationHistory,
    prompt,
  };
}
