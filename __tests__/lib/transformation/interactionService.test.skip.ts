import { describe, expect, it, vi } from 'vitest';
import { persistTransformationInteraction } from '@/lib/transformation/interactionService';

const ASSESSMENT_ID = 'assessment-1';
const RUBRIC_ID = 'rubric-1';

function createSupabaseStub(options: {
  existingResult?: { determined_at: string } | null;
  updateSpy?: (payload: Record<string, unknown>) => void;
  insertedMessages?: Array<{ id: string; role: 'user' | 'assistant'; content: string; created_at: string }>;
}) {
  const existingResult = options.existingResult ?? null;
  const insertedMessages =
    options.insertedMessages ??
    [
      { id: 'msg-1', role: 'user', content: 'Mensaje', created_at: new Date().toISOString() },
      { id: 'msg-2', role: 'assistant', content: 'Respuesta', created_at: new Date().toISOString() },
    ];

  return {
    from: vi.fn((table: string) => {
      if (table === 'transformation_results') {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              eq: vi.fn(() => ({
                single: vi.fn(async () => ({
                  data: existingResult,
                  error: existingResult ? null : { code: 'PGRST116' },
                })),
              })),
            })),
          })),
          upsert: vi.fn(() => ({
            select: vi.fn(() => ({
              single: vi.fn(async () => ({
                data: { id: 'result-1' },
                error: null,
              })),
            })),
          })),
        };
      }

      if (table === 'transformation_assessments') {
        return {
          update: vi.fn((payload: Record<string, unknown>) => {
            options.updateSpy?.(payload);
            return {
              eq: vi.fn(async () => ({ error: null })),
            };
          }),
        };
      }

      if (table === 'transformation_conversation_messages') {
        return {
          insert: vi.fn(() => ({
            select: vi.fn(async () => ({
              data: insertedMessages,
              error: null,
            })),
          })),
        };
      }

      throw new Error(`Tabla inesperada: ${table}`);
    }),
  };
}

describe('persistTransformationInteraction', () => {
  it('trunca historial a 50 mensajes y registra resumen', async () => {
    const longHistory = Array.from({ length: 60 }).map((_, index) => ({
      role: index % 2 === 0 ? 'user' : 'assistant',
      content: `msg-${index}`,
    }));

    const updateSpy = vi.fn();
    const supabase = createSupabaseStub({ updateSpy });

    const result = await persistTransformationInteraction({
      supabase: supabase as any,
      assessmentId: ASSESSMENT_ID,
      rubricItemId: RUBRIC_ID,
      conversationHistory: longHistory as any,
      currentMetadata: {},
      userMessage: 'Último mensaje',
      assistantMessage: 'Respuesta final',
      suggestedLevel: 3,
      rationale: 'Resumen generado por el asistente',
      markCompleted: false,
      metadataPatch: {},
    });

    expect(result.updatedHistory.length).toBeLessThanOrEqual(50);

    const updates = updateSpy.mock.calls[0][0] as Record<string, any>;
    expect(updates.context_metadata.conversation_summaries[RUBRIC_ID]).toMatchObject({
      suggested_level: 3,
      rationale: 'Resumen generado por el asistente',
    });
    expect(result.persistedMessages).toHaveLength(2);
  });

  it('bloquea actualizaciones concurrentes recientes', async () => {
    const recent = new Date(Date.now() - 2_000).toISOString();
    const supabase = createSupabaseStub({
      existingResult: { determined_at: recent },
    });

    await expect(
      persistTransformationInteraction({
        supabase: supabase as any,
        assessmentId: ASSESSMENT_ID,
        rubricItemId: RUBRIC_ID,
        conversationHistory: [],
        currentMetadata: {},
        userMessage: 'Mensaje',
        assistantMessage: 'Respuesta',
        suggestedLevel: 2,
        rationale: 'Razonamiento',
        metadataPatch: {},
      })
    ).rejects.toThrow(/otra actualización reciente/);
  });

  it('permite guardar resultado cuando no hay concurrencia', async () => {
    const past = new Date(Date.now() - 10_000).toISOString();
    const supabase = createSupabaseStub({
      existingResult: { determined_at: past },
    });

    const result = await persistTransformationInteraction({
      supabase: supabase as any,
      assessmentId: ASSESSMENT_ID,
      rubricItemId: RUBRIC_ID,
      conversationHistory: [],
      currentMetadata: {},
      userMessage: 'Mensaje válido',
      assistantMessage: 'Respuesta válida',
      suggestedLevel: 4,
      rationale: 'Razonamiento válido',
      metadataPatch: {},
    });

    expect(result.resultId).toBe('result-1');
  });
});
