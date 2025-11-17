import type { NextApiRequest, NextApiResponse } from 'next';
import { createPagesServerClient } from '@supabase/auth-helpers-nextjs';
import Anthropic from '@anthropic-ai/sdk';
import type { MessageParam } from '@anthropic-ai/sdk/resources/messages';
import { z } from 'zod';
import { buildTransformationContext } from '@/lib/transformation/contextBuilder';
import { persistTransformationInteraction } from '@/lib/transformation/interactionService';

type ErrorResponse = { error: string };

const MODEL_ID = process.env.ANTHROPIC_MODEL_ID ?? 'claude-haiku-4-5';
const MAX_USER_MESSAGE_LENGTH = 2_000;
const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX_REQUESTS = 10;
const MODEL_MAX_TOKENS = 1500;
const MODEL_CONTEXT_TOKENS = 200_000;

const ModelResponseSchema = z.object({
  assistant_message: z.string().max(5_000),
  suggested_level: z.union([z.number().int().min(1).max(4), z.null()]).optional(),
  rationale: z.union([z.string().max(3_000), z.null()]).optional(),
  metadata_patch: z.record(z.unknown()).optional(),
});

function sanitizeUserMessage(message: string): string {
  return message
    .replace(/```/g, '')
    .replace(/<script/gi, '')
    .replace(/<\/script>/gi, '')
    .slice(0, MAX_USER_MESSAGE_LENGTH)
    .trim();
}

function containsDangerousPatterns(message: string): boolean {
  const lowered = message.toLowerCase();
  return lowered.includes('ignora todas las instrucciones') || lowered.includes('ignore all instructions');
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<ErrorResponse | Record<string, any>>
) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST']);
    return res.status(405).json({ error: 'Método no permitido' });
  }

  const supabase = createPagesServerClient({ req, res });
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session) {
    return res.status(401).json({ error: 'No autorizado' });
  }

  const { assessmentId, rubricItemId, userMessage, forceLevel, metadataPatch } = req.body ?? {};

  if (!assessmentId || !rubricItemId) {
    return res
      .status(400)
      .json({ error: 'Faltan parámetros obligatorios: assessmentId y rubricItemId' });
  }

  if (!userMessage && (forceLevel === undefined || forceLevel === null)) {
    return res
      .status(400)
      .json({ error: 'Debes proporcionar un mensaje del usuario o un nivel a forzar.' });
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    return res.status(500).json({
      error:
        'El servicio LLM no está configurado. Define ANTHROPIC_API_KEY en el entorno antes de continuar.',
    });
  }

  try {
    const safeMetadataPatch =
      metadataPatch && typeof metadataPatch === 'object' && !Array.isArray(metadataPatch)
        ? (metadataPatch as Record<string, unknown>)
        : {};

    const context = await buildTransformationContext({
      supabase,
      assessmentId: String(assessmentId),
      rubricItemId: String(rubricItemId),
      userId: session.user.id,
    });

    const conversationHistory = context.conversationHistory;

    // Si el usuario fuerza un nivel, evitamos llamar al LLM y dejamos registro directo.
    if (forceLevel !== undefined && forceLevel !== null) {
      const level = Number(forceLevel);
      if (Number.isNaN(level) || level < 1 || level > 4) {
        return res.status(400).json({ error: 'El nivel forzado debe estar entre 1 y 4.' });
      }

      const safeForcedMessage = sanitizeUserMessage(userMessage ?? `Nivel establecido manualmente en ${level}.`);
      const assistantMessage = `Entendido. Registré el nivel ${level} para esta dimensión según tu indicación.`;
      const persistence = await persistTransformationInteraction({
        supabase,
        assessmentId: context.assessment.id,
        rubricItemId: context.rubric.id,
        conversationHistory,
        currentMetadata: context.assessment.context_metadata,
        userMessage: safeForcedMessage || `Nivel establecido manualmente en ${level}.`,
        assistantMessage,
        suggestedLevel: level,
        rationale: 'Nivel fijado manualmente por el equipo.',
        metadataPatch: safeMetadataPatch,
      });

      return res.status(200).json({
        assistantMessage,
        suggestedLevel: level,
        rationale: 'Nivel fijado manualmente por el equipo.',
        resultId: persistence.resultId,
        assessmentStatus: persistence.assessmentStatus,
        summary: persistence.summary,
        conversationSnapshot: persistence.updatedHistory,
      });
    }

    if (!userMessage || typeof userMessage !== 'string' || userMessage.trim().length === 0) {
      return res.status(400).json({ error: 'El mensaje del usuario no puede estar vacío.' });
    }

    const sanitizedMessage = sanitizeUserMessage(userMessage);
    if (containsDangerousPatterns(sanitizedMessage)) {
      return res.status(400).json({
        error: 'El mensaje contiene patrones no permitidos. Reformula tu consulta.',
      });
    }

    if (!sanitizedMessage) {
      return res.status(400).json({
        error: 'El mensaje no contiene contenido válido después de sanearlo. Intenta nuevamente.',
      });
    }

    const windowStart = new Date(Date.now() - RATE_LIMIT_WINDOW_MS).toISOString();
    const { count: recentUsageCount, error: recentUsageError } = await supabase
      .from('transformation_llm_usage')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', session.user.id)
      .gte('created_at', windowStart);

    if (recentUsageError) {
      console.error('[transformation/chat] No se pudo evaluar el rate limit', recentUsageError);
      return res.status(500).json({
        error:
          'No fue posible procesar la solicitud en este momento. Intenta nuevamente en unos segundos.',
      });
    }

    if ((recentUsageCount ?? 0) >= RATE_LIMIT_MAX_REQUESTS) {
      return res
        .status(429)
        .json({ error: 'Límite de interacción alcanzado. Espera un minuto e intenta nuevamente.' });
    }

    const anthropic = new Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY,
      timeout: 25_000,
    });

    const systemSegments = context.prompt.filter((chunk) => chunk.role === 'system');
    const conversationSegments = context.prompt.filter((chunk) => chunk.role !== 'system');

    const systemPrompt =
      systemSegments.map((segment) => segment.content).join('\n\n') +
      '\n\n' +
      'FORMATO DE RESPUESTA:\n' +
      'Responde siempre en formato JSON con las siguientes claves:\n' +
      '- assistant_message: Tu mensaje conversacional al equipo\n' +
      '- suggested_level: Número entre 1-4 o null (sugiérelo solo cuando tengas suficiente evidencia clara)\n' +
      '- rationale: Justificación que cite específicamente elementos de la respuesta del equipo y explique cómo se relacionan con el nivel sugerido\n' +
      '- metadata_patch (opcional): Objeto con claves adicionales de contexto';

    const messages: MessageParam[] = conversationSegments.map((segment) => ({
      role: segment.role === 'assistant' ? 'assistant' : 'user',
      content: [{ type: 'text', text: segment.content }],
    }));

    messages.push({
      role: 'user',
      content: [{ type: 'text', text: sanitizedMessage }],
    });

    const estimatedInputTokens = Math.ceil(
      (systemPrompt.length + messages.map((m) => typeof m.content[0] === 'string' ? m.content[0] : (m.content[0] as any).text).join('').length) / 4
    );

    const maxTokens = Math.min(
      MODEL_MAX_TOKENS,
      Math.max(800, MODEL_CONTEXT_TOKENS - estimatedInputTokens - 1000)
    );

    const startTime = Date.now();
    const response = await anthropic.messages.create({
      model: MODEL_ID,
      max_tokens: maxTokens,
      temperature: 0.2,
      system: systemPrompt,
      messages,
    });
    const elapsed = Date.now() - startTime;

    const textResponse =
      response.content
        .map((item) => (item.type === 'text' ? item.text : ''))
        .join('\n')
        .trim() || '{}';

    let parsed: z.infer<typeof ModelResponseSchema>;
    try {
      // Remove markdown code fences
      let cleaned = textResponse.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();

      // Fix common JSON issues from LLM responses
      // Replace literal newlines within strings with escaped newlines
      cleaned = cleaned.replace(/"\s*:\s*"([^"]*)\n([^"]*)/g, (match, before, after) => {
        return `": "${before}\\n${after}`;
      });

      const rawParsed = JSON.parse(cleaned);
      parsed = ModelResponseSchema.parse(rawParsed);
    } catch (jsonError) {
      console.error('Respuesta inválida del modelo:', jsonError, textResponse);
      return res.status(502).json({
        error:
          'El modelo devolvió una respuesta no interpretable. Intenta reformular tu mensaje o vuelve a intentarlo.',
      });
    }

    const assistantMessage = parsed.assistant_message ?? 'No pude generar una respuesta.';
    const suggestedLevel =
      parsed.suggested_level && typeof parsed.suggested_level === 'number'
        ? Math.round(parsed.suggested_level)
        : null;
    const rationale = parsed.rationale ?? null;

    const mergedMetadataPatch = {
      ...safeMetadataPatch,
      ...(parsed.metadata_patch &&
      typeof parsed.metadata_patch === 'object' &&
      !Array.isArray(parsed.metadata_patch)
        ? parsed.metadata_patch
        : {}),
    };

    const persistence = await persistTransformationInteraction({
      supabase,
      assessmentId: context.assessment.id,
      rubricItemId: context.rubric.id,
      conversationHistory,
      currentMetadata: context.assessment.context_metadata,
      userMessage: sanitizedMessage,
      assistantMessage,
      suggestedLevel,
      rationale,
      metadataPatch: mergedMetadataPatch,
    });

    const { error: logError } = await supabase.from('transformation_llm_usage').insert({
      user_id: session.user.id,
      assessment_id: context.assessment.id,
      model: MODEL_ID,
      input_tokens: response.usage?.input_tokens ?? null,
      output_tokens: response.usage?.output_tokens ?? null,
      latency_ms: elapsed,
    });

    if (logError) {
      console.error('[transformation/chat] No se pudo registrar el uso del LLM', logError);
    }

    return res.status(200).json({
      assistantMessage,
      suggestedLevel,
      rationale,
      conversationSnapshot: persistence.updatedHistory.slice(-10),
      updatedAssessment: {
        status: persistence.assessmentStatus,
        updated_at: new Date().toISOString(),
      },
      llmUsage: {
        model: MODEL_ID,
        inputTokens: response.usage?.input_tokens ?? null,
        outputTokens: response.usage?.output_tokens ?? null,
        latencyMs: elapsed,
      },
      resultId: persistence.resultId,
      assessmentStatus: persistence.assessmentStatus,
      persistedMessages: persistence.persistedMessages,
      summary: persistence.summary,
    });
  } catch (error) {
    console.error('Error en /api/transformation/chat:', error);
    const message =
      error instanceof Error ? error.message : 'No se pudo procesar la interacción.';
    const status = message.includes('permiso') || message.includes('No se pudo acceder')
      ? 403
      : message.includes('otra actualización') || message.includes('espera unos segundos')
        ? 409
        : 500;
    return res.status(status).json({ error: message });
  }
}
