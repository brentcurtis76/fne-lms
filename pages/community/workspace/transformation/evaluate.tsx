import { GetServerSideProps } from 'next';
import Head from 'next/head';
import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { createPagesServerClient } from '@supabase/auth-helpers-nextjs';
import { formatDistanceToNow } from 'date-fns';
import { es } from 'date-fns/locale';
import { Message, useTransformationChat } from '@/hooks/useTransformationChat';
import type { TransformationChatState } from '@/hooks/useTransformationChat';

interface RubricItem {
  id: string;
  objective_number: number;
  objective_text: string;
  action_number: number;
  action_text: string;
  dimension: 'cobertura' | 'frecuencia' | 'profundidad';
}

interface AssessmentDetails {
  id: string;
  area: string;
  status: 'in_progress' | 'completed' | 'archived';
}

interface ConversationSummary {
  last_user_message?: string;
  last_assistant_message?: string;
  suggested_level?: number | null;
  rationale?: string | null;
  updated_at?: string;
}

interface EvaluatePageProps {
  assessment: AssessmentDetails | null;
  rubricItems: RubricItem[];
  initialRubricId: string;
  summaries: Record<string, ConversationSummary>;
  emptyState: boolean;
}

export const getServerSideProps: GetServerSideProps<EvaluatePageProps> = async (ctx) => {
  const supabase = createPagesServerClient(ctx);
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session) {
    return {
      redirect: {
        destination: '/auth/login?redirect=/community/workspace/transformation/evaluate',
        permanent: false,
      },
    };
  }

  const queryId = ctx.query.assessmentId;
  let assessmentId = typeof queryId === 'string' && queryId.length > 0 ? queryId : null;

  if (!assessmentId) {
    const { data: candidate } = await supabase
      .from('transformation_assessments')
      .select('id')
      .eq('area', 'personalizacion')
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    assessmentId = candidate?.id ?? null;
  }

  const [{ data: assessment }, { data: rubricItems }] = await Promise.all([
    assessmentId
      ? supabase
          .from('transformation_assessments')
          .select('id, area, status, context_metadata')
          .eq('id', assessmentId)
          .maybeSingle()
      : Promise.resolve({ data: null }),
    supabase
      .from('transformation_rubric')
      .select('id, objective_number, objective_text, action_number, action_text, dimension')
      .eq('area', 'personalizacion')
      .order('objective_number', { ascending: true })
      .order('action_number', { ascending: true })
      .order('dimension', { ascending: true }),
  ]);

  if (!rubricItems) {
    return { notFound: true };
  }

  const summaries =
    ((assessment?.context_metadata as { conversation_summaries?: Record<string, ConversationSummary> } | null)
      ?.conversation_summaries ?? {}) as Record<string, ConversationSummary>;

  return {
    props: {
      assessment: assessment
        ? {
            id: assessment.id,
            area: assessment.area,
            status: assessment.status,
          }
        : null,
      rubricItems,
      initialRubricId: assessment ? rubricItems[0]?.id ?? '' : '',
      summaries,
      emptyState: !assessment,
    },
  };
};

export default function TransformationEvaluatePage({
  assessment,
  rubricItems,
  initialRubricId,
  summaries: initialSummaries,
  emptyState,
}: EvaluatePageProps) {
  const [selectedRubricId, setSelectedRubricId] = useState(initialRubricId);
  const [summaries, setSummaries] = useState<Record<string, ConversationSummary>>(initialSummaries);
  const [historyLoading, setHistoryLoading] = useState(Boolean(assessment));
  const [historyError, setHistoryError] = useState<string | null>(null);

  const selectedRubric = useMemo(() => {
    if (!selectedRubricId) return undefined;
    return rubricItems.find((item) => item.id === selectedRubricId) ?? rubricItems[0];
  }, [rubricItems, selectedRubricId]);

  const { state, sendMessage, confirmLevel, hydrate } = useTransformationChat({
    assessmentId: assessment?.id ?? '',
    rubricItemId: selectedRubric?.id ?? '',
  });

  useEffect(() => {
    if (!selectedRubric?.id || !assessment?.id) {
      setHistoryLoading(false);
      setHistoryError(null);
      hydrate({ messages: [], summary: undefined, suggestedLevel: null });
      return;
    }

    let cancelled = false;
    const fetchHistory = async () => {
      setHistoryLoading(true);
      setHistoryError(null);
      try {
        const params = new URLSearchParams({
          assessmentId: assessment.id,
          rubricId: selectedRubric.id,
        });
        const response = await fetch(`/api/transformation/history?${params.toString()}`);
        if (!response.ok) {
          const body = await response.json().catch(() => ({}));
          throw new Error(body.error ?? 'No se pudo cargar el historial.');
        }
        const data: {
          messages: Message[];
          summary: ConversationSummary | null;
          assessmentStatus: 'in_progress' | 'completed';
        } = await response.json();

        if (cancelled) return;

        hydrate({
          messages: data.messages,
          summary: data.summary ?? undefined,
          suggestedLevel: data.summary?.suggested_level ?? null,
          assessmentStatus: data.assessmentStatus,
        });

        setSummaries((prev) => ({
          ...prev,
          [selectedRubric.id]: data.summary ?? undefined,
        }));
      } catch (err) {
        if (!cancelled) {
          const message = err instanceof Error ? err.message : 'Error inesperado cargando historial.';
          setHistoryError(message);
        }
      } finally {
        if (!cancelled) {
          setHistoryLoading(false);
        }
      }
    };

    fetchHistory();

    return () => {
      cancelled = true;
    };
  }, [assessment?.id, selectedRubric?.id, hydrate]);

  const selectedSummary = selectedRubric ? summaries[selectedRubric.id] : undefined;

  if (emptyState || !assessment) {
    return <EmptyAssessmentState />;
  }

  return (
    <>
      <Head>
        <title>Vías de Transformación · Evaluación</title>
      </Head>
      <main className="min-h-screen bg-slate-50">
        <div className="px-6 py-4 border-b border-slate-200 bg-white">
          <nav className="text-sm text-slate-500 mb-2 flex items-center gap-2">
            <Link href="/community/workspace">Espacio Colaborativo</Link>
            <span>/</span>
            <span>Vías de Transformación</span>
            <span>/</span>
            <strong>Evaluación conversacional</strong>
          </nav>
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-2xl font-semibold text-slate-900">Vías de Transformación · Evaluación</h1>
            <StatusBadge status={assessment.status} />
          </div>
          <p className="text-slate-600 mt-1">
            Conversa con el asistente para determinar el nivel de cada dimensión. A la izquierda puedes
            navegar los objetivos y dimensiones.
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-[320px,1fr] gap-6 px-6 py-6">
          <aside className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-200">
              <h2 className="text-lg font-semibold text-slate-900">Dimensiones</h2>
              <p className="text-sm text-slate-600">
                Selecciona una dimensión para continuar la conversación. Puedes ver el nivel sugerido y el
                último resumen de cada acción.
              </p>
            </div>
            <div className="max-h-[60vh] overflow-y-auto">
              {rubricItems.map((item) => {
                const isActive = item.id === selectedRubric?.id;
                const summary = summaries[item.id];
                return (
                  <button
                    key={item.id}
                    onClick={() => setSelectedRubricId(item.id)}
                    className={`w-full text-left px-5 py-3 border-b border-slate-100 transition ${
                      isActive ? 'bg-slate-100 font-semibold text-slate-900' : 'hover:bg-slate-50'
                    }`}
                  >
                    <p className="text-xs uppercase text-slate-500 tracking-wide">
                      Objetivo {item.objective_number} · Acción {item.action_number} ·{' '}
                      {item.dimension.toUpperCase()}
                    </p>
                    <p className="text-sm text-slate-700 mt-1 line-clamp-2">{item.action_text}</p>
                    {summary?.suggested_level && (
                      <span className="mt-2 inline-flex items-center gap-2 text-xs font-semibold text-slate-600">
                        <span className="inline-flex h-2 w-2 rounded-full bg-sky-500" />
                        Nivel {summary.suggested_level}
                        {summary.updated_at && (
                          <span className="font-normal text-slate-500">
                            · actualizado{' '}
                            {formatDistanceToNow(new Date(summary.updated_at), {
                              addSuffix: true,
                              locale: es,
                            })}
                          </span>
                        )}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </aside>

          <section className="bg-white border border-slate-200 rounded-xl shadow-sm flex flex-col h-[75vh]">
            <header className="px-6 py-4 border-b border-slate-200 space-y-3">
              <div>
                <h2 className="text-lg font-semibold text-slate-900">
                  Acción {selectedRubric?.action_number} · {selectedRubric?.dimension?.toUpperCase()}
                </h2>
                <p className="text-sm text-slate-600 mt-1">{selectedRubric?.action_text}</p>
              </div>
              {selectedSummary?.rationale && (
                <div className="bg-slate-50 border border-slate-200 rounded-lg px-4 py-3 text-xs text-slate-600">
                  <strong className="block text-slate-700 mb-1">Resumen reciente</strong>
                  <p>{selectedSummary.rationale}</p>
                  {selectedSummary.updated_at && (
                    <p className="mt-2 text-[11px] uppercase tracking-wide text-slate-500">
                      Actualizado{' '}
                      {formatDistanceToNow(new Date(selectedSummary.updated_at), {
                        addSuffix: true,
                        locale: es,
                      })}
                    </p>
                  )}
                </div>
              )}
            </header>

            <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4 relative">
              {(historyLoading || state.sending) && (
                <div className="absolute inset-0 flex items-center justify-center bg-white/60 z-10">
                  <div className="h-10 w-10 border-4 border-sky-200 border-t-sky-600 rounded-full animate-spin" />
                </div>
              )}
              {historyError && (
                <div className="bg-rose-50 border border-rose-200 text-rose-700 rounded-lg px-4 py-2 text-sm">
                  {historyError}
                </div>
              )}
              {!historyLoading && state.messages.length === 0 && !historyError && (
                <p className="text-slate-500 text-sm">
                  Aún no has iniciado la conversación para esta dimensión. Empieza describiendo la práctica
                  de la comunidad.
                </p>
              )}
              {state.messages.map((message, index) => (
                <MessageBubble key={`${message.role}-${index}-${message.created_at ?? index}`} message={message} />
              ))}
            </div>

            <footer className="border-t border-slate-200 px-6 py-4 space-y-3">
              {state.error && (
                <div className="bg-rose-50 border border-rose-200 text-rose-700 rounded-lg px-4 py-2 text-sm">
                  {state.error}
                </div>
              )}
              <ConversationComposer
                onSend={sendMessage}
                disabled={state.sending || historyLoading || !selectedRubric}
                suggestedLevel={state.suggestedLevel}
                onConfirmLevel={confirmLevel}
              />
             {state.llmUsage && (
                <p className="text-xs text-slate-500 text-right">
                  {state.llmUsage.model} · tokens in/out {state.llmUsage.inputTokens ?? '—'} /{' '}
                  {state.llmUsage.outputTokens ?? '—'} · {state.llmUsage.latencyMs ?? '—'} ms
                </p>
              )}
            </footer>
          </section>
        </div>
      </main>
    </>
  );
}

function StatusBadge({ status }: { status: 'in_progress' | 'completed' | 'archived' }) {
  const styles =
    status === 'completed'
      ? 'bg-emerald-50 border-emerald-200 text-emerald-700'
      : status === 'archived'
      ? 'bg-slate-50 border-slate-200 text-slate-700'
      : 'bg-sky-50 border-sky-200 text-sky-700';

  const label =
    status === 'completed'
      ? 'Completada'
      : status === 'archived'
      ? 'Archivada'
      : 'En progreso';

  return (
    <span className={`px-3 py-1 rounded-full text-xs font-semibold uppercase tracking-wide border ${styles}`}>
      {label}
    </span>
  );
}

function MessageBubble({ message }: { message: Message }) {
  const isAssistant = message.role === 'assistant';
  return (
    <div className={`flex ${isAssistant ? 'justify-start' : 'justify-end'}`}>
      <div
        className={`max-w-2xl rounded-2xl px-4 py-3 shadow-sm ${
          isAssistant ? 'bg-slate-100 text-slate-800' : 'bg-sky-600 text-white'
        }`}
      >
        <p className="text-xs uppercase tracking-wide">
          {isAssistant ? 'Asistente' : 'Tú'}{' '}
          {message.created_at && (
            <span className="text-[11px] lowercase text-slate-300">
              ·{' '}
              {formatDistanceToNow(new Date(message.created_at), {
                addSuffix: true,
                locale: es,
              })}
            </span>
          )}
        </p>
        <p className="text-sm mt-1 whitespace-pre-wrap leading-relaxed">{message.content}</p>
      </div>
    </div>
  );
}

interface ConversationComposerProps {
  onSend: (message: string) => Promise<void>;
  onConfirmLevel: (level: number) => Promise<void>;
  disabled?: boolean;
  suggestedLevel?: number | null;
}

function ConversationComposer({
  onSend,
  onConfirmLevel,
  disabled,
  suggestedLevel,
}: ConversationComposerProps) {
  const [value, setValue] = useState('');

  const handleSend = async () => {
    if (!value.trim()) return;
    await onSend(value);
    setValue('');
  };

  return (
    <div className="space-y-2">
      <textarea
        value={value}
        onChange={(event) => setValue(event.target.value)}
        placeholder="Describe la práctica, evidencias y contexto para esta dimensión..."
        className="w-full resize-none rounded-lg border border-slate-300 px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500 focus:border-sky-500"
        rows={4}
        disabled={disabled}
      />
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3 text-sm text-slate-600">
          <span>
            Nivel sugerido:{' '}
            <strong>{suggestedLevel ? `Nivel ${suggestedLevel}` : 'Sin sugerencia aún'}</strong>
          </span>
          {suggestedLevel && (
            <button
              type="button"
              onClick={() => onConfirmLevel(suggestedLevel)}
              className="px-3 py-1 text-xs font-medium rounded-full bg-sky-600 text-white hover:bg-sky-500 transition"
            >
              Confirmar nivel {suggestedLevel}
            </button>
          )}
        </div>
        <div className="flex items-center gap-2">
          {[1, 2, 3, 4].map((level) => (
            <button
              key={level}
              type="button"
              onClick={() => onConfirmLevel(level)}
              className="px-3 py-1 border border-slate-300 rounded-full text-sm text-slate-600 hover:bg-slate-100 transition"
            >
              Forzar {level}
            </button>
          ))}
          <button
            type="button"
            onClick={handleSend}
            disabled={disabled || !value.trim()}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-sky-600 text-white font-semibold hover:bg-sky-500 transition disabled:opacity-60 disabled:cursor-not-allowed"
          >
            Enviar
          </button>
        </div>
      </div>
    </div>
  );
}

function EmptyAssessmentState() {
  return (
    <main className="min-h-screen bg-slate-50 flex items-center justify-center px-6">
      <Head>
        <title>Vías de Transformación · Evaluación</title>
      </Head>
      <div className="max-w-xl bg-white border border-slate-200 rounded-2xl shadow-sm px-8 py-10 text-center space-y-6">
        <h1 className="text-2xl font-semibold text-slate-900">Aún no tienes una evaluación activa</h1>
        <p className="text-slate-600 text-sm">
          Para iniciar la conversación, crea primero un assessment desde la consola administrativa o
          habilita la Vía de Transformación para tu comunidad piloto. Luego vuelve a esta pantalla con el
          enlace que incluya <code className="bg-slate-100 px-1 py-0.5 rounded">assessmentId</code>.
        </p>
        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <Link
            href="/admin/transformation/metrics"
            className="inline-flex items-center justify-center px-4 py-2 rounded-lg border border-slate-300 text-slate-700 font-semibold hover:bg-slate-100"
          >
            Ver métricas
          </Link>
          <Link
            href="/community/workspace"
            className="inline-flex items-center justify-center px-4 py-2 rounded-lg bg-sky-600 text-white font-semibold hover:bg-sky-500"
          >
            Volver al espacio colaborativo
          </Link>
        </div>
      </div>
    </main>
  );
}
