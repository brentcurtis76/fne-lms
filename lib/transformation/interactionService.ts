import type { SupabaseClient } from '@supabase/supabase-js';
import type { Json } from '@/types/supabase';
import type { ContextChunk } from './contextBuilder';

type SupabaseJsonArray = Json[];

export interface PersistInteractionInput {
  supabase: SupabaseClient;
  assessmentId: string;
  rubricItemId: string;
  conversationHistory: ContextChunk[];
  currentMetadata?: Record<string, unknown>;
  userMessage: string;
  assistantMessage: string;
  suggestedLevel?: number | null;
  rationale?: string | null;
  markCompleted?: boolean;
  metadataPatch?: Record<string, unknown>;
}

export interface PersistInteractionOutput {
  updatedHistory: ContextChunk[];
  resultId: string | null;
  assessmentStatus: 'in_progress' | 'completed';
  persistedMessages: Array<{
    id: string;
    role: 'user' | 'assistant' | 'system';
    content: string;
    created_at: string;
  }>;
  summary: {
    last_user_message: string;
    last_assistant_message: string;
    suggested_level: number | null;
    rationale: string;
    updated_at: string;
  };
}

function toJsonArray(history: ContextChunk[]): SupabaseJsonArray {
  return history.map((message) => ({
    role: message.role,
    content: message.content,
  }));
}

const MAX_HISTORY_SIZE = 50;
const CONCURRENCY_GUARD_WINDOW_MS = 5_000;

export async function persistTransformationInteraction({
  supabase,
  assessmentId,
  rubricItemId,
  conversationHistory,
  currentMetadata = {},
  userMessage,
  assistantMessage,
  suggestedLevel,
  rationale,
  markCompleted = false,
  metadataPatch = {},
}: PersistInteractionInput): Promise<PersistInteractionOutput> {
  const timestamp = new Date().toISOString();

  if (suggestedLevel && suggestedLevel >= 1 && suggestedLevel <= 4) {
    const { data: existingResult, error: existingResultError } = await supabase
      .from('transformation_results')
      .select('id, determined_at')
      .eq('assessment_id', assessmentId)
      .eq('rubric_item_id', rubricItemId)
      .single();

    if (existingResultError && existingResultError.code !== 'PGRST116') {
      throw new Error(`No se pudo validar el resultado previo: ${existingResultError.message}`);
    }

    if (existingResult?.determined_at) {
      const previous = new Date(existingResult.determined_at).getTime();
      if (!Number.isNaN(previous) && Date.now() - previous < CONCURRENCY_GUARD_WINDOW_MS) {
        throw new Error(
          'Detectamos otra actualización reciente de esta dimensión. Espera unos segundos e intenta nuevamente.'
        );
      }
    }
  }

  const trimmedHistory = conversationHistory.slice(
    Math.max(conversationHistory.length - (MAX_HISTORY_SIZE - 2), 0)
  );

  if (conversationHistory.length >= MAX_HISTORY_SIZE) {
    console.warn(
      `[transformation] Assessment ${assessmentId} alcanzó el límite de historial (${MAX_HISTORY_SIZE}).`
    );
  }

  const updatedHistory: ContextChunk[] = [
    ...trimmedHistory,
    { role: 'user', content: userMessage },
    { role: 'assistant', content: assistantMessage },
  ];

  const updates: Record<string, unknown> = {
    conversation_history: toJsonArray(updatedHistory),
    updated_at: timestamp,
  };

  if (markCompleted) {
    updates.status = 'completed';
    updates.completed_at = timestamp;
  }

  const metadataBase =
    currentMetadata && typeof currentMetadata === 'object' && !Array.isArray(currentMetadata)
      ? { ...currentMetadata }
      : {};

  const summaries =
    (metadataBase.conversation_summaries as Record<string, unknown> | undefined) ?? {};

  const summaryPayload = {
    last_user_message: userMessage.slice(0, 500),
    last_assistant_message: assistantMessage.slice(0, 500),
    suggested_level: suggestedLevel ?? null,
    rationale: (rationale ?? assistantMessage).slice(0, 1000),
    updated_at: timestamp,
  };

  updates.context_metadata = {
    ...metadataBase,
    conversation_summaries: {
      ...(summaries as Record<string, unknown>),
      [rubricItemId]: summaryPayload,
    },
  };

  if (metadataPatch && Object.keys(metadataPatch).length > 0) {
    updates.context_metadata = {
      ...(updates.context_metadata as Record<string, unknown>),
      ...metadataPatch,
    };
  }

  const { error: updateError } = await supabase
    .from('transformation_assessments')
    .update(updates)
    .eq('id', assessmentId);

  if (updateError) {
    throw new Error(`No se pudo actualizar la conversación: ${updateError.message}`);
  }

  let resultId: string | null = null;
  if (suggestedLevel && suggestedLevel >= 1 && suggestedLevel <= 4) {

    const { data: upsertedResult, error: resultError } = await supabase
      .from('transformation_results')
      .upsert(
        {
          assessment_id: assessmentId,
          rubric_item_id: rubricItemId,
          determined_level: suggestedLevel,
          rationale: rationale ?? null,
          determined_at: timestamp,
        },
        { onConflict: 'assessment_id,rubric_item_id' }
      )
      .select('id')
      .single();

    if (resultError) {
      throw new Error(`No se pudo guardar el resultado: ${resultError.message}`);
    }

    resultId = upsertedResult?.id ?? null;
  }

  const messagePayload = [
    {
      assessment_id: assessmentId,
      rubric_item_id: rubricItemId,
      role: 'user' as const,
      content: userMessage,
    },
    {
      assessment_id: assessmentId,
      rubric_item_id: rubricItemId,
      role: 'assistant' as const,
      content: assistantMessage,
    },
  ];

  const { data: insertedMessages, error: messageError } = await supabase
    .from('transformation_conversation_messages')
    .insert(messagePayload)
    .select('id, role, content, created_at');

  if (messageError) {
    throw new Error(`No se pudo registrar el historial detallado: ${messageError.message}`);
  }

  return {
    updatedHistory,
    resultId,
    assessmentStatus: markCompleted ? 'completed' : 'in_progress',
    persistedMessages: insertedMessages ?? [],
    summary: summaryPayload,
  };
}
