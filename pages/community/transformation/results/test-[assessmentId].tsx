import { GetServerSideProps } from 'next';
import Head from 'next/head';
import Link from 'next/link';
import { createClient } from '@supabase/supabase-js';
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

  // BYPASS AUTHENTICATION FOR TESTING
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY! // Use service role to bypass RLS
  );

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
        context_metadata: JSON.parse(JSON.stringify(assessment.context_metadata || {})),
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

export default function TransformationResultsTestPage({
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
    (r) => r.response?.trim().length > 0 || (r as any).answer?.trim().length > 0
  ).length;
  const progressPercent = totalDimensions > 0 ? Math.round((completedDimensions / totalDimensions) * 100) : 0;

  return (
    <>
      <Head>
        <title>Resultados de Evaluación (TEST) · Personalización</title>
      </Head>
      <main className="min-h-screen bg-slate-50">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-200 bg-amber-100">
          <div className="bg-amber-50 border border-amber-300 rounded-lg p-3 mb-4">
            <strong className="text-amber-900">⚠️ MODO DE PRUEBA:</strong>
            <span className="text-amber-800"> Esta es una versión de prueba sin autenticación.</span>
          </div>
          <nav className="text-sm text-slate-500 mb-2 flex items-center gap-2">
            <span>Espacio Colaborativo</span>
            <span>/</span>
            <span>Vías de Transformación</span>
            <span>/</span>
            <strong>Resultados (TEST)</strong>
          </nav>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h1 className="text-2xl font-semibold text-slate-900">
                Resultados de Evaluación: {assessment.area === 'personalizacion' ? 'Personalización' : 'Aprendizaje'}
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
                    {evaluation.dimension_evaluations?.length || 0}
                  </div>
                  <div className="text-sm text-slate-600">Dimensiones Evaluadas</div>
                </div>
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
                <h3 className="text-lg font-semibold text-amber-900 mb-2">
                  Evaluación AI Pendiente
                </h3>
                <p className="text-amber-800">
                  La evaluación con inteligencia artificial aún no se ha completado.
                </p>
              </div>

              <ResultsDisplay
                assessment={assessment}
                rubricItems={rubricItems}
                responses={responses}
              />
            </>
          )}
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
