import { GetServerSideProps } from 'next';
import Head from 'next/head';
import Link from 'next/link';
import { useState } from 'react';
import { createPagesServerClient } from '@supabase/auth-helpers-nextjs';
import { ResultsDisplay } from '@/components/transformation/ResultsDisplay';
import { downloadReportAsPdf } from '@/utils/transformationReportPdf';

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
  answer?: string;  // Legacy field name from database
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
  school?: {
    id: number;
    name: string;
  };
}

interface ReportOwner {
  id: string;
  full_name: string;
  email: string;
}

interface ResultsPageProps {
  assessment: Assessment | null;
  rubricItems: RubricItem[];
  community: Community | null;
  reportOwner: ReportOwner | null;
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
        destination: `/login?redirect=/community/transformation/results/${assessmentId}`,
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
        reportOwner: null,
        error: 'ID de evaluación no válido.',
      },
    };
  }

  // Fetch the assessment with community info
  const { data: assessment, error: assessmentError } = await supabase
    .from('transformation_assessments')
    .select('*, growth_communities(id, name, school_id)')
    .eq('id', assessmentId)
    .single();

  if (assessmentError || !assessment) {
    console.error('Assessment fetch error:', assessmentError);
    return {
      props: {
        assessment: null,
        rubricItems: [],
        community: null,
        reportOwner: null,
        error: 'No se encontró la evaluación o no tienes acceso a ella.',
      },
    };
  }

  // Fetch current user's profile for report attribution
  // The report shows the logged-in user who is viewing/accessing the report
  let creatorData = null;

  if (session?.user?.id) {
    const { data: currentUserProfile, error: currentUserError } = await supabase
      .from('profiles')
      .select('id, first_name, last_name, email')
      .eq('id', session.user.id)
      .single();

    console.log('Debug - Current user profile:', currentUserProfile);
    console.log('Debug - Profile error:', currentUserError);

    if (currentUserProfile) {
      creatorData = {
        id: currentUserProfile.id,
        full_name: `${currentUserProfile.first_name || ''} ${currentUserProfile.last_name || ''}`.trim() || 'Usuario',
        email: currentUserProfile.email,
      };
    }
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
        reportOwner: null,
        error: 'No se pudieron cargar los ítems de la rúbrica.',
      },
    };
  }

  // Extract community info and fetch school separately if needed
  const communityData = assessment.growth_communities as any;
  let schoolData = null;
  if (communityData?.school_id) {
    const { data: school } = await supabase
      .from('schools')
      .select('id, name')
      .eq('id', communityData.school_id)
      .single();
    schoolData = school;
  }

  const community: Community | null = communityData ? {
    id: communityData.id,
    name: communityData.name,
    school: schoolData ? {
      id: schoolData.id,
      name: schoolData.name,
    } : undefined,
  } : null;

  // Extract report creator info (fetched separately above)
  const reportOwner: ReportOwner | null = creatorData ? {
    id: creatorData.id,
    full_name: creatorData.full_name || 'Usuario',
    email: creatorData.email || '',
  } : null;

  console.log('Debug - communityData:', communityData);
  console.log('Debug - schoolData:', schoolData);
  console.log('Debug - community:', community);
  console.log('Debug - reportOwner:', reportOwner);

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
      community,
      reportOwner,
    },
  };
};

export default function TransformationResultsPage({
  assessment,
  rubricItems,
  community,
  reportOwner,
  error,
}: ResultsPageProps) {
  const [isRegenerating, setIsRegenerating] = useState(false);
  const [regenerationError, setRegenerationError] = useState<string | null>(null);
  const [regenerationSuccess, setRegenerationSuccess] = useState(false);

  const handleRegenerateEvaluation = async () => {
    if (!assessment) return;

    setIsRegenerating(true);
    setRegenerationError(null);
    setRegenerationSuccess(false);

    try {
      const response = await fetch(`/api/transformation/assessments/${assessment.id}/evaluate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Error al regenerar la evaluación');
      }

      setRegenerationSuccess(true);
      // Reload the page to show updated evaluation after a brief delay
      setTimeout(() => {
        window.location.reload();
      }, 1500);
    } catch (err: any) {
      console.error('Regeneration error:', err);
      setRegenerationError(err.message || 'Error al regenerar la evaluación');
    } finally {
      setIsRegenerating(false);
    }
  };

  // Error state
  if (error || !assessment) {
    return (
      <main className="min-h-screen bg-brand_beige flex items-center justify-center px-6">
        <Head>
          <title>Resultados de Evaluación · Error</title>
        </Head>
        <div className="max-w-xl bg-white border border-slate-200 rounded-2xl shadow-sm px-8 py-10 text-center space-y-6">
          <div className="w-16 h-16 mx-auto bg-rose-100 rounded-full flex items-center justify-center">
            <svg className="w-8 h-8 text-rose-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
          </div>
          <h1 className="text-2xl font-semibold text-brand_blue">Error al Cargar Resultados</h1>
          <p className="text-slate-600">{error || 'No se encontró la evaluación.'}</p>
          <Link
            href="/community/workspace?section=transformation"
            className="inline-flex items-center justify-center px-4 py-2 rounded-lg bg-brand_blue text-white font-semibold hover:bg-brand_blue/90 transition"
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
    (r) => {
      // Handle both legacy 'answer' field and new 'response' field
      const text = (r as any).response || (r as any).answer || '';
      return text.trim().length > 0;
    }
  ).length;
  const progressPercent = totalDimensions > 0 ? Math.round((completedDimensions / totalDimensions) * 100) : 0;

  return (
    <>
      <Head>
        <title>Resultados de Evaluación · Personalización</title>
      </Head>
      <main className="min-h-screen bg-brand_beige">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-200 bg-white">
          <div className="flex items-center gap-4 mb-3">
            <img src="/Logo BW.png" alt="FNE Logo" className="h-10 w-auto" />
            <div className="h-8 w-px bg-slate-300" />
            <nav className="text-sm text-slate-500 flex items-center gap-2">
              <Link href="/community/workspace?section=transformation" className="hover:text-brand_blue">
                Espacio Colaborativo
              </Link>
              <span>/</span>
              <Link href="/community/workspace?section=transformation" className="hover:text-brand_blue">
                Vías de Transformación
              </Link>
              <span>/</span>
              <strong className="text-brand_blue">Resultados</strong>
            </nav>
          </div>

          {/* School Name Banner */}
          {community?.school?.name && (
            <div className="bg-brand_blue text-white px-4 py-2 rounded-lg mb-4 inline-block">
              <span className="text-sm font-medium">{community.school.name}</span>
            </div>
          )}

          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h1 className="text-2xl font-semibold text-brand_blue">
                Resultados de Evaluación: Personalización
              </h1>
              <p className="text-sm text-slate-600 mt-1">
                <span className="font-medium">{community?.name}</span>
                {' · '}
                Completada el {new Date(assessment.finalized_at || assessment.updated_at).toLocaleDateString('es-CL')}
                {reportOwner?.full_name && (
                  <span> · Generado por <span className="font-medium">{reportOwner.full_name}</span></span>
                )}
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
              <div className="bg-gradient-to-r from-brand_blue/5 to-brand_blue/10 border border-brand_blue/20 rounded-xl shadow-sm p-8 mb-8">
                <div className="flex items-center justify-between">
                  <div className="flex-1">
                    <h2 className="text-sm font-semibold text-brand_yellow uppercase tracking-wide mb-2">
                      Nivel de Transformación
                    </h2>
                    <div className="text-5xl font-bold text-brand_blue mb-3">
                      {evaluation.overall_stage_label}
                    </div>
                    <p className="text-slate-700 text-lg max-w-3xl">
                      {evaluation.summary}
                    </p>
                  </div>
                  <div className="flex-shrink-0 ml-8">
                    <div className="w-32 h-32 rounded-full bg-white border-8 border-brand_blue flex items-center justify-center">
                      <div className="text-center">
                        <div className="text-4xl font-bold text-brand_blue">
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
                  <div className="text-4xl font-bold text-brand_yellow mb-2">
                    {evaluation.growth_areas.length}
                  </div>
                  <div className="text-sm text-slate-600">Áreas de Crecimiento</div>
                </div>
                <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-6 text-center">
                  <div className="text-4xl font-bold text-brand_blue mb-2">
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
                <h3 className="text-lg font-semibold text-brand_yellow mb-4 flex items-center gap-2">
                  <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
                  </svg>
                  Áreas de Crecimiento
                </h3>
                <ul className="space-y-3">
                  {evaluation.growth_areas.map((area, idx) => (
                    <li key={idx} className="flex items-start gap-3">
                      <span className="flex-shrink-0 w-6 h-6 rounded-full bg-brand_yellow/20 text-brand_yellow font-semibold text-sm flex items-center justify-center mt-0.5">
                        {idx + 1}
                      </span>
                      <span className="text-slate-700">{area}</span>
                    </li>
                  ))}
                </ul>
              </div>

              {/* Recommendations Section */}
              <div className="bg-gradient-to-r from-brand_blue/5 to-brand_blue/10 border border-brand_blue/20 rounded-xl shadow-sm p-6 mb-8">
                <h3 className="text-lg font-semibold text-brand_blue mb-4 flex items-center gap-2">
                  <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                  </svg>
                  Recomendaciones Prioritarias
                </h3>
                <ul className="space-y-3">
                  {evaluation.recommendations.map((rec, idx) => (
                    <li key={idx} className="flex items-start gap-3">
                      <span className="flex-shrink-0 w-6 h-6 rounded-full bg-brand_yellow text-brand_blue font-semibold text-sm flex items-center justify-center mt-0.5">
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
                    <div className="text-4xl font-bold text-brand_blue mb-2">{progressPercent}%</div>
                    <div className="text-sm text-slate-600">Completado</div>
                  </div>
                  <div className="text-center">
                    <div className="text-4xl font-bold text-emerald-600 mb-2">{completedDimensions}</div>
                    <div className="text-sm text-slate-600">Dimensiones respondidas</div>
                  </div>
                  <div className="text-center">
                    <div className="text-4xl font-bold text-brand_yellow mb-2">{totalDimensions}</div>
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

          {/* Status Messages */}
          {regenerationError && (
            <div className="bg-rose-50 border border-rose-200 rounded-lg p-3 mt-6 flex items-center gap-3">
              <svg className="w-4 h-4 text-rose-600 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <p className="text-sm text-rose-700 flex-1">{regenerationError}</p>
              <button onClick={() => setRegenerationError(null)} className="text-rose-500 hover:text-rose-700">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          )}

          {regenerationSuccess && (
            <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-3 mt-6 flex items-center gap-3">
              <svg className="w-4 h-4 text-emerald-600 flex-shrink-0 animate-spin" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
              </svg>
              <p className="text-sm text-emerald-700">Evaluación regenerada. Recargando...</p>
            </div>
          )}

          {/* Actions Footer */}
          <div className="mt-8 flex flex-col sm:flex-row items-center justify-between gap-4">
            <Link
              href="/community/workspace?section=transformation"
              className="text-sm text-slate-500 hover:text-brand_blue transition flex items-center gap-1"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
              </svg>
              Volver al workspace
            </Link>

            <div className="flex items-center gap-2">
              <button
                onClick={handleRegenerateEvaluation}
                disabled={isRegenerating}
                className={`text-sm px-3 py-1.5 rounded-md transition flex items-center gap-1.5 ${
                  isRegenerating
                    ? 'text-slate-400 cursor-not-allowed'
                    : 'text-slate-600 hover:text-brand_blue hover:bg-brand_beige'
                }`}
              >
                {isRegenerating ? (
                  <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                  </svg>
                ) : (
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                  </svg>
                )}
                {isRegenerating ? 'Regenerando...' : 'Regenerar'}
              </button>

              {evaluation && (
                <>
                  <span className="text-slate-300">|</span>
                  <button
                    onClick={() => {
                      downloadReportAsPdf({
                        communityName: community?.name || 'Comunidad Educativa',
                        schoolName: community?.school?.name,
                        generatedBy: reportOwner?.full_name,
                        area: assessment.area,
                        completedDate: new Date(assessment.finalized_at || assessment.updated_at).toLocaleDateString('es-CL', {
                          year: 'numeric',
                          month: 'long',
                          day: 'numeric',
                        }),
                        evaluation,
                        rubricItems,
                        responses,
                        viewMode: 'summary',
                      });
                    }}
                    className="text-sm px-3 py-1.5 rounded-md text-slate-600 hover:text-brand_blue hover:bg-brand_beige transition flex items-center gap-1.5"
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3M3 17V7a2 2 0 012-2h6l2 2h6a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2z" />
                    </svg>
                    PDF Resumen
                  </button>
                  <button
                    onClick={() => {
                      downloadReportAsPdf({
                        communityName: community?.name || 'Comunidad Educativa',
                        schoolName: community?.school?.name,
                        generatedBy: reportOwner?.full_name,
                        area: assessment.area,
                        completedDate: new Date(assessment.finalized_at || assessment.updated_at).toLocaleDateString('es-CL', {
                          year: 'numeric',
                          month: 'long',
                          day: 'numeric',
                        }),
                        evaluation,
                        rubricItems,
                        responses,
                        viewMode: 'detailed',
                      });
                    }}
                    className="text-sm px-3 py-1.5 rounded-md bg-brand_blue text-white hover:bg-brand_blue/90 transition flex items-center gap-1.5"
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                    PDF Completo
                  </button>
                </>
              )}
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
      : 'bg-brand_blue/10 border-brand_blue/20 text-brand_blue';

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
