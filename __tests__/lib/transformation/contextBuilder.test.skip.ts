import { describe, expect, it, vi } from 'vitest';
import { buildTransformationContext } from '@/lib/transformation/contextBuilder';

const ASSESSMENT_ID = 'assessment-1';
const RUBRIC_ID = 'rubric-1';

function createSupabaseStub(options: {
  storedMessages?: Array<{ role: 'user' | 'assistant'; content: string; created_at: string }>;
  conversationHistory?: Array<{ role: string; content: string }>;
  summary?: Record<string, unknown>;
}) {
  const storedMessages = options.storedMessages ?? [];
  const conversationHistory = options.conversationHistory ?? [];
  const summary = options.summary;

  return {
    from: vi.fn((table: string) => {
      if (table === 'transformation_assessments') {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              single: vi.fn(async () => ({
                data: {
                  id: ASSESSMENT_ID,
                  area: 'personalizacion',
                  status: 'in_progress',
                  conversation_history: conversationHistory,
                  context_metadata: summary
                    ? { conversation_summaries: { [RUBRIC_ID]: summary } }
                    : {},
                  growth_community_id: 'community-1',
                  started_at: new Date().toISOString(),
                  completed_at: null,
                  updated_at: new Date().toISOString(),
                },
                error: null,
              })),
            })),
          })),
        };
      }

      if (table === 'transformation_rubric') {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              single: vi.fn(async () => ({
                data: {
                  id: RUBRIC_ID,
                  area: 'personalizacion',
                  objective_number: 1,
                  objective_text: 'Objetivo',
                  action_number: 1,
                  action_text: 'Acción',
                  dimension: 'cobertura',
                  level_1_descriptor: 'Nivel 1',
                  level_2_descriptor: 'Nivel 2',
                  level_3_descriptor: 'Nivel 3',
                  level_4_descriptor: 'Nivel 4',
                  initial_questions: ['Pregunta 1', 'Pregunta 2'],
                  display_order: 1,
                },
                error: null,
              })),
            })),
          })),
        };
      }

      if (table === 'transformation_conversation_messages') {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              eq: vi.fn(() => ({
                order: vi.fn(() => ({
                  limit: vi.fn(async () => ({
                    data: storedMessages,
                    error: storedMessages.length === 0 ? { code: 'PGRST116' } : null,
                  })),
                })),
              })),
            })),
          })),
        };
      }

      throw new Error(`Tabla inesperada: ${table}`);
    }),
  };
}

describe('buildTransformationContext', () => {
  it('usa mensajes persistidos cuando están disponibles', async () => {
    const now = new Date().toISOString();
    const supabase = createSupabaseStub({
      storedMessages: [
        { role: 'assistant', content: 'Respuesta 1', created_at: now },
        { role: 'user', content: 'Mensaje 1', created_at: new Date(Date.now() - 1_000).toISOString() },
      ],
    });

    const context = await buildTransformationContext({
      supabase: supabase as any,
      assessmentId: ASSESSMENT_ID,
      rubricItemId: RUBRIC_ID,
      userId: 'user-1',
      maxHistoryMessages: 5,
    });

    expect(context.conversationHistory).toHaveLength(2);
    expect(context.conversationHistory[0]).toMatchObject({ role: 'user', content: 'Mensaje 1' });
  });

  it('incluye resumen cuando existe en metadata', async () => {
    const supabase = createSupabaseStub({
      storedMessages: [],
      summary: {
        suggested_level: 3,
        rationale: 'Resumen de progreso',
      },
    });

    const context = await buildTransformationContext({
      supabase: supabase as any,
      assessmentId: ASSESSMENT_ID,
      rubricItemId: RUBRIC_ID,
      userId: 'user-1',
    });

    const hasSummary = context.prompt.some(
      (chunk) => chunk.role === 'system' && chunk.content.includes('Resumen previo')
    );
    expect(hasSummary).toBe(true);
  });

  it('recurrre a conversation_history cuando no hay mensajes persistidos', async () => {
    const supabase = createSupabaseStub({
      storedMessages: [],
      conversationHistory: [
        { role: 'user', content: 'Historial legado' },
        { role: 'assistant', content: 'Respuesta legada' },
      ],
    });

    const context = await buildTransformationContext({
      supabase: supabase as any,
      assessmentId: ASSESSMENT_ID,
      rubricItemId: RUBRIC_ID,
      userId: 'user-1',
      maxHistoryMessages: 10,
    });

    expect(context.conversationHistory).toHaveLength(2);
    expect(context.conversationHistory[0].content).toBe('Historial legado');
  });
});
