import { GetServerSideProps } from 'next';
import Head from 'next/head';
import Link from 'next/link';
import { createPagesServerClient } from '@supabase/auth-helpers-nextjs';
import { ResultsDisplay } from '@/components/transformation/ResultsDisplay';

interface RubricItem {
  id: string;
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
}

interface DimensionResponse {
  rubricItemId: string;
  response: string;
  suggestedLevel: number | null;
  confirmedLevel: number | null;
  lastUpdated: string;
}

interface DimensionEvaluation {
  rubricItemId: string;
  dimension: string;
  level: number;
  reasoning: string;
  evidence_quote: string;
  next_steps: string[];
}

interface AssessmentEvaluation {
  overall_stage: number;
  overall_stage_label: 'Incipiente' | 'Emergente' | 'Avanzado' | 'Consolidado';
  dimension_evaluations: DimensionEvaluation[];
  strengths: string[];
  growth_areas: string[];
  summary: string;
  recommendations: string[];
}

interface Assessment {
  id: string;
  area: string;
  status: 'in_progress' | 'completed' | 'archived';
  context_metadata: {
    responses?: Record<string, DimensionResponse>;
    evaluation?: AssessmentEvaluation;
    evaluated_at?: string;
    [key: string]: unknown;
  };
  conversation_history: Array<{ role: string; content: string }>;
  started_at: string;
  updated_at: string;
  finalized_at?: string | null;
}

interface Community {
  id: string;
  name: string;
}

interface ResultsPageProps {
  assessment: Assessment | null;
  rubricItems: RubricItem[];
  community: Community | null;
  error?: string;
}

export const getServerSideProps: GetServerSideProps<ResultsPageProps> = async (ctx) => {
  const { assessmentId } = ctx.query;
  const supabase = createPagesServerClient(ctx);
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session) {
    return {
      redirect: {
        destination: `/auth/login?redirect=/community/transformation/results/${assessmentId}`,
        permanent: false,
      },
    };
  }

  if (!assessmentId || typeof assessmentId !== 'string') {
    return {
      props: {
        assessment: null,
        rubricItems: [],
        community: null,
        error: 'ID de evaluación no válido.',
      },
    };
  }

  // Fetch the assessment
  const { data: assessment, error: assessmentError } = await supabase
    .from('transformation_assessments')
    .select('*, growth_communities(id, name)')
    .eq('id', assessmentId)
    .single();

  if (assessmentError || !assessment) {
    return {
      props: {
        assessment: null,
        rubricItems: [],
        community: null,
        error: 'No se encontró la evaluación o no tienes acceso a ella.',
      },
    };
  }

  // Check that assessment is completed
  if (assessment.status !== 'completed') {
    return {
      redirect: {
        destination: '/community/transformation/assessment',
        permanent: false,
      },
    };
  }

  // Load rubric items for the assessment area
  const { data: rubricItems, error: rubricError } = await supabase
    .from('transformation_rubric')
    .select('*')
    .eq('area', assessment.area)
    .order('display_order', { ascending: true });

  if (rubricError || !rubricItems) {
    return {
      props: {
        assessment: null,
        rubricItems: [],
        community: null,
        error: 'No se pudieron cargar los ítems de la rúbrica.',
      },
    };
  }

  // Extract community info
  const community = assessment.growth_communities as any;

  return {
    props: {
      assessment: {
        id: assessment.id,
        area: assessment.area,
        status: assessment.status,
        context_metadata: assessment.context_metadata || {},
        conversation_history: assessment.conversation_history || [],
        started_at: assessment.started_at,
        updated_at: assessment.updated_at,
        finalized_at: assessment.finalized_at || null,
      },
      rubricItems,
      community: community ? { id: community.id, name: community.name } : null,
    },
  };
};

export default function TransformationResultsPage({
  assessment,
  rubricItems,
  community,
  error,
}: ResultsPageProps) {
  // Error state
  if (error || !assessment) {
    return (
      <main className="min-h-screen bg-slate-50 flex items-center justify-center px-6">
        <Head>
          <title>Resultados de Evaluación · Error</title>
        </Head>
        <div className="max-w-xl bg-white border border-slate-200 rounded-2xl shadow-sm px-8 py-10 text-center space-y-6">
          <div className="w-16 h-16 mx-auto bg-rose-100 rounded-full flex items-center justify-center">
            <svg className="w-8 h-8 text-rose-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
          </div>
          <h1 className="text-2xl font-semibold text-slate-900">Error al Cargar Resultados</h1>
          <p className="text-slate-600">{error || 'No se encontró la evaluación.'}</p>
          <Link
            href="/community/workspace?section=transformation"
            className="inline-flex items-center justify-center px-4 py-2 rounded-lg bg-sky-600 text-white font-semibold hover:bg-sky-500 transition"
          >
            Volver al espacio colaborativo
          </Link>
        </div>
      </main>
    );
  }

  const responses = assessment.context_metadata?.responses || {};
  const evaluation = assessment.context_metadata?.evaluation;
  const totalDimensions = rubricItems.length;
  const completedDimensions = Object.values(responses).filter(
    (r) => r.response.trim().length > 0
  ).length;
  const progressPercent = totalDimensions > 0 ? Math.round((completedDimensions / totalDimensions) * 100) : 0;

  return (
    <>
      <Head>
        <title>Resultados de Evaluación · Personalización</title>
      </Head>
      <main className="min-h-screen bg-slate-50">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-200 bg-white">
          <nav className="text-sm text-slate-500 mb-2 flex items-center gap-2">
            <Link href="/community/workspace?section=transformation" className="hover:text-slate-700">
              Espacio Colaborativo
            </Link>
            <span>/</span>
            <Link href="/community/workspace?section=transformation" className="hover:text-slate-700">
              Vías de Transformación
            </Link>
            <span>/</span>
            <strong>Resultados</strong>
          </nav>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h1 className="text-2xl font-semibold text-slate-900">
                Resultados de Evaluación: Personalización
              </h1>
              <p className="text-sm text-slate-600 mt-1">
                {community?.name} · Completada el {new Date(assessment.finalized_at || assessment.updated_at).toLocaleDateString('es-CL')}
              </p>
            </div>
            <div className="flex items-center gap-3">
              <StatusBadge status={assessment.status} />
            </div>
          </div>
        </div>

        {/* Results Content */}
        <div className="max-w-7xl mx-auto px-6 py-8">
          {evaluation ? (
            <>
              {/* AI Evaluation Results */}

              {/* Overall Stage Banner */}
              <div className="bg-gradient-to-r from-sky-50 to-blue-50 border border-sky-200 rounded-xl shadow-sm p-8 mb-8">
                <div className="flex items-center justify-between">
                  <div className="flex-1">
                    <h2 className="text-sm font-semibold text-sky-600 uppercase tracking-wide mb-2">
                      Nivel de Transformación
                    </h2>
                    <div className="text-5xl font-bold text-sky-900 mb-3">
                      {evaluation.overall_stage_label}
                    </div>
                    <p className="text-slate-700 text-lg max-w-3xl">
                      {evaluation.summary}
                    </p>
                  </div>
                  <div className="flex-shrink-0 ml-8">
                    <div className="w-32 h-32 rounded-full bg-white border-8 border-sky-600 flex items-center justify-center">
                      <div className="text-center">
                        <div className="text-4xl font-bold text-sky-600">
                          {evaluation.overall_stage}
                        </div>
                        <div className="text-xs text-slate-600 uppercase">
                          de 4
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Stats Overview */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
                <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-6 text-center">
                  <div className="text-4xl font-bold text-emerald-600 mb-2">
                    {evaluation.strengths.length}
                  </div>
                  <div className="text-sm text-slate-600">Fortalezas Identificadas</div>
                </div>
                <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-6 text-center">
                  <div className="text-4xl font-bold text-amber-600 mb-2">
                    {evaluation.growth_areas.length}
                  </div>
                  <div className="text-sm text-slate-600">Áreas de Crecimiento</div>
                </div>
                <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-6 text-center">
                  <div className="text-4xl font-bold text-sky-600 mb-2">
                    {evaluation.dimension_evaluations.length}
                  </div>
                  <div className="text-sm text-slate-600">Dimensiones Evaluadas</div>
                </div>
              </div>

              {/* Strengths Section */}
              <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-6 mb-8">
                <h3 className="text-lg font-semibold text-emerald-700 mb-4 flex items-center gap-2">
                  <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  Fortalezas Identificadas
                </h3>
                <ul className="space-y-3">
                  {evaluation.strengths.map((strength, idx) => (
                    <li key={idx} className="flex items-start gap-3">
                      <span className="flex-shrink-0 w-6 h-6 rounded-full bg-emerald-100 text-emerald-700 font-semibold text-sm flex items-center justify-center mt-0.5">
                        {idx + 1}
                      </span>
                      <span className="text-slate-700">{strength}</span>
                    </li>
                  ))}
                </ul>
              </div>

              {/* Growth Areas Section */}
              <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-6 mb-8">
                <h3 className="text-lg font-semibold text-amber-700 mb-4 flex items-center gap-2">
                  <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
                  </svg>
                  Áreas de Crecimiento
                </h3>
                <ul className="space-y-3">
                  {evaluation.growth_areas.map((area, idx) => (
                    <li key={idx} className="flex items-start gap-3">
                      <span className="flex-shrink-0 w-6 h-6 rounded-full bg-amber-100 text-amber-700 font-semibold text-sm flex items-center justify-center mt-0.5">
                        {idx + 1}
                      </span>
                      <span className="text-slate-700">{area}</span>
                    </li>
                  ))}
                </ul>
              </div>

              {/* Recommendations Section */}
              <div className="bg-gradient-to-r from-violet-50 to-purple-50 border border-violet-200 rounded-xl shadow-sm p-6 mb-8">
                <h3 className="text-lg font-semibold text-violet-700 mb-4 flex items-center gap-2">
                  <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                  </svg>
                  Recomendaciones Prioritarias
                </h3>
                <ul className="space-y-3">
                  {evaluation.recommendations.map((rec, idx) => (
                    <li key={idx} className="flex items-start gap-3">
                      <span className="flex-shrink-0 w-6 h-6 rounded-full bg-violet-600 text-white font-semibold text-sm flex items-center justify-center mt-0.5">
                        {idx + 1}
                      </span>
                      <span className="text-slate-700 font-medium">{rec}</span>
                    </li>
                  ))}
                </ul>
              </div>

              {/* Detailed Dimension Results */}
              <ResultsDisplay
                assessment={assessment}
                rubricItems={rubricItems}
                responses={responses}
                evaluation={evaluation}
              />
            </>
          ) : (
            <>
              {/* No AI Evaluation - Show Basic Stats */}
              <div className="bg-amber-50 border border-amber-200 rounded-xl shadow-sm p-6 mb-8">
                <div className="flex items-start gap-4">
                  <svg className="w-6 h-6 text-amber-600 flex-shrink-0 mt-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                  </svg>
                  <div className="flex-1">
                    <h3 className="text-lg font-semibold text-amber-900 mb-2">
                      Evaluación AI Pendiente
                    </h3>
                    <p className="text-amber-800 mb-4">
                      La evaluación con inteligencia artificial aún no se ha completado. Esto puede tardar unos momentos.
                    </p>
                    <button
                      onClick={() => window.location.reload()}
                      className="inline-flex items-center gap-2 px-4 py-2 bg-amber-600 text-white rounded-lg font-semibold hover:bg-amber-500 transition"
                    >
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                      </svg>
                      Actualizar Página
                    </button>
                  </div>
                </div>
              </div>

              <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-6 mb-8">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  <div className="text-center">
                    <div className="text-4xl font-bold text-sky-600 mb-2">{progressPercent}%</div>
                    <div className="text-sm text-slate-600">Completado</div>
                  </div>
                  <div className="text-center">
                    <div className="text-4xl font-bold text-emerald-600 mb-2">{completedDimensions}</div>
                    <div className="text-sm text-slate-600">Dimensiones respondidas</div>
                  </div>
                  <div className="text-center">
                    <div className="text-4xl font-bold text-slate-600 mb-2">{totalDimensions}</div>
                    <div className="text-sm text-slate-600">Total dimensiones</div>
                  </div>
                </div>
              </div>

              <ResultsDisplay
                assessment={assessment}
                rubricItems={rubricItems}
                responses={responses}
              />
            </>
          )}

          {/* Actions Footer */}
          <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-6 mt-8">
            <div className="flex flex-col sm:flex-row gap-4 justify-between items-center">
              <p className="text-sm text-slate-600">
                Evaluación finalizada el {new Date(assessment.finalized_at || assessment.updated_at).toLocaleDateString('es-CL', {
                  year: 'numeric',
                  month: 'long',
                  day: 'numeric',
                  hour: '2-digit',
                  minute: '2-digit'
                })}
              </p>
              <div className="flex gap-3">
                <Link
                  href="/community/workspace?section=transformation"
                  className="inline-flex items-center justify-center px-6 py-2 rounded-lg border border-slate-300 text-slate-700 font-semibold hover:bg-slate-100 transition"
                >
                  Volver al workspace
                </Link>
                <button
                  onClick={() => window.print()}
                  className="inline-flex items-center gap-2 justify-center px-6 py-2 rounded-lg bg-sky-600 text-white font-semibold hover:bg-sky-500 transition"
                >
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
                  </svg>
                  Imprimir
                </button>
              </div>
            </div>
          </div>
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
      ? 'bg-slate-100 border-slate-200 text-slate-600'
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
