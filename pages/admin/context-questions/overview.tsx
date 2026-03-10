import { useSupabaseClient } from '@supabase/auth-helpers-react';
import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import Link from 'next/link';
import { toast } from 'react-hot-toast';
import MainLayout from '@/components/layout/MainLayout';
import { ResponsiveFunctionalPageHeader } from '@/components/layout/FunctionalPageHeader';
import { metadataHasRole } from '@/utils/roleUtils';
import {
  Building2,
  CheckCircle,
  XCircle,
  Loader2,
  ExternalLink,
  Settings,
} from 'lucide-react';
import type {
  ContextGeneralQuestion,
  ContextQuestionType,
  GradeLevel,
  SchoolTransversalContext,
} from '@/types/assessment-builder';
import { GRADE_LEVEL_LABELS } from '@/types/assessment-builder';

// ---------------------------------------------------------------------------
// Types for the API response
// ---------------------------------------------------------------------------

interface SchoolEntry {
  id: number;
  name: string;
}

interface OverviewData {
  schools: SchoolEntry[];
  structuralContextBySchool: Record<number, SchoolTransversalContext>;
  customResponsesBySchool: Record<
    number,
    Array<{
      question_id: string;
      response: unknown;
      question: { question_text: string; question_type: ContextQuestionType };
    }>
  >;
  questions: ContextGeneralQuestion[];
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Render grade_levels as a compact label. */
function renderGradeLevels(levels: GradeLevel[] | undefined): React.ReactNode {
  if (!levels || levels.length === 0) return <span className="text-gray-400">&mdash;</span>;

  if (levels.length <= 3) {
    return (
      <div className="flex flex-wrap gap-1">
        {levels.map((gl) => (
          <span
            key={gl}
            className="inline-block px-1.5 py-0.5 text-xs bg-brand_primary/10 text-brand_primary rounded"
          >
            {GRADE_LEVEL_LABELS[gl] ?? gl}
          </span>
        ))}
      </div>
    );
  }

  return <span className="text-sm">{levels.length} niveles</span>;
}

/** Render a custom-question response cell based on its question_type. */
function renderCustomCell(
  value: unknown,
  questionType: ContextQuestionType
): React.ReactNode {
  if (value === undefined || value === null || value === '') {
    return <span className="text-gray-400">&mdash;</span>;
  }

  switch (questionType) {
    case 'boolean': {
      const boolVal =
        value === true || value === 'true' || value === 'yes' || value === 1;
      return boolVal ? (
        <CheckCircle className="w-5 h-5 text-green-600 inline" />
      ) : (
        <XCircle className="w-5 h-5 text-red-500 inline" />
      );
    }
    case 'number':
    case 'scale':
      return <span className="text-sm">{String(value)}</span>;
    case 'select':
      return <span className="text-sm">{String(value)}</span>;
    case 'multiselect': {
      const arr = Array.isArray(value) ? value : [];
      return <span className="text-sm">{arr.join(', ') || <span className="text-gray-400">&mdash;</span>}</span>;
    }
    case 'text':
    case 'textarea':
    default: {
      const str = String(value);
      return (
        <span className="text-sm" title={str.length > 50 ? str : undefined}>
          {str.length > 50 ? str.slice(0, 50) + '...' : str}
        </span>
      );
    }
  }
}

// ---------------------------------------------------------------------------
// Page Component
// ---------------------------------------------------------------------------

export default function ContextQuestionsOverview() {
  const supabase = useSupabaseClient();
  const router = useRouter();

  // Auth state
  const [user, setUser] = useState<any>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [avatarUrl, setAvatarUrl] = useState('');
  const [loading, setLoading] = useState(true);

  // Data state
  const [data, setData] = useState<OverviewData | null>(null);
  const [dataLoading, setDataLoading] = useState(false);

  // -----------------------------------------------------------------------
  // Auth
  // -----------------------------------------------------------------------

  useEffect(() => {
    initializeAuth();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router]);

  useEffect(() => {
    if (user && isAdmin) {
      fetchOverview();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, isAdmin]);

  const initializeAuth = async () => {
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session?.user) {
        router.push('/login');
        return;
      }

      setUser(session.user);

      // Avatar
      const { data: profileData } = await supabase
        .from('profiles')
        .select('avatar_url')
        .eq('id', session.user.id)
        .single();

      if (profileData?.avatar_url) {
        setAvatarUrl(profileData.avatar_url);
      }

      // Role check: metadata OR user_roles table
      const adminFromMetadata = metadataHasRole(
        session.user.user_metadata,
        'admin'
      );

      const { data: userRoles } = await supabase
        .from('user_roles')
        .select('role_type')
        .eq('user_id', session.user.id)
        .eq('is_active', true);

      const hasAdminRoleInDB =
        userRoles?.some((role: any) => role.role_type === 'admin') || false;

      if (!adminFromMetadata && !hasAdminRoleInDB) {
        router.push('/dashboard');
        return;
      }

      setIsAdmin(true);
    } catch (error) {
      console.error('Auth initialization error:', error);
      router.push('/login');
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    localStorage.removeItem('rememberMe');
    sessionStorage.removeItem('sessionOnly');
    router.push('/login');
  };

  // -----------------------------------------------------------------------
  // Data fetching
  // -----------------------------------------------------------------------

  const fetchOverview = async () => {
    setDataLoading(true);
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session?.access_token) {
        toast.error('Error de autenticacion');
        return;
      }

      const res = await fetch('/api/admin/context-questions/overview', {
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          'Content-Type': 'application/json',
        },
      });

      if (!res.ok) {
        throw new Error('Failed to fetch overview');
      }

      const json = await res.json();
      setData({
        schools: json.schools ?? [],
        structuralContextBySchool: json.structuralContextBySchool ?? {},
        customResponsesBySchool: json.customResponsesBySchool ?? {},
        questions: json.questions ?? [],
      });
    } catch (err) {
      console.error('Error fetching overview:', err);
      toast.error('Error al cargar la vista general');
    } finally {
      setDataLoading(false);
    }
  };

  // -----------------------------------------------------------------------
  // Derived stats
  // -----------------------------------------------------------------------

  const totalSchools = data?.schools?.length ?? 0;

  const schoolsWithStructural = data
    ? data.schools.filter(
        (s) => data.structuralContextBySchool[s.id] != null
      ).length
    : 0;

  const schoolsWithCustom = data
    ? data.schools.filter(
        (s) =>
          data.customResponsesBySchool[s.id] &&
          data.customResponsesBySchool[s.id].length > 0
      ).length
    : 0;

  // -----------------------------------------------------------------------
  // Render
  // -----------------------------------------------------------------------

  if (loading) {
    return (
      <div className="min-h-screen bg-brand_beige flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-brand_primary" />
      </div>
    );
  }

  if (!isAdmin) {
    return null;
  }

  return (
    <MainLayout
      user={user}
      currentPage="context-overview"
      pageTitle=""
      breadcrumbs={[]}
      isAdmin={true}
      onLogout={handleLogout}
      avatarUrl={avatarUrl}
    >
      <div className="min-h-screen bg-brand_beige">
        {/* Header */}
        <ResponsiveFunctionalPageHeader
          icon={<Building2 className="w-6 h-6" />}
          title="Contexto General — Vista Global"
          subtitle="Respuestas de todas las escuelas"
        />

        <div className="px-4 sm:px-6 lg:px-8 py-6 space-y-6">
          {/* Summary stats */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="bg-white shadow-md rounded-lg p-5">
              <p className="text-sm text-gray-500">Total Escuelas</p>
              <p className="text-2xl font-bold text-brand_primary">
                {totalSchools}
              </p>
            </div>
            <div className="bg-white shadow-md rounded-lg p-5">
              <p className="text-sm text-gray-500">
                Con Contexto Estructural
              </p>
              <p className="text-2xl font-bold text-brand_primary">
                {schoolsWithStructural}
                <span className="text-sm font-normal text-gray-400 ml-1">
                  / {totalSchools}
                </span>
              </p>
            </div>
            <div className="bg-white shadow-md rounded-lg p-5">
              <p className="text-sm text-gray-500">
                Con Respuestas Personalizadas
              </p>
              <p className="text-2xl font-bold text-brand_primary">
                {schoolsWithCustom}
                <span className="text-sm font-normal text-gray-400 ml-1">
                  / {totalSchools}
                </span>
              </p>
            </div>
          </div>

          {/* Manage questions link */}
          <div className="flex justify-end">
            <Link
              href="/admin/context-questions"
              className="inline-flex items-center gap-1.5 text-sm text-brand_primary hover:underline"
            >
              <Settings className="w-4 h-4" />
              Administrar Preguntas
            </Link>
          </div>

          {/* Main table card */}
          <div className="bg-white shadow-md rounded-lg overflow-hidden">
            {dataLoading ? (
              <div className="flex items-center justify-center py-20">
                <Loader2 className="w-7 h-7 animate-spin text-brand_primary" />
                <span className="ml-3 text-gray-500">Cargando datos...</span>
              </div>
            ) : !data || data.schools.length === 0 ? (
              <div className="text-center py-20 text-gray-500">
                No hay escuelas registradas.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead>
                    <tr className="bg-brand_primary/5">
                      <th className="px-4 py-3 text-left text-xs font-semibold text-brand_primary uppercase tracking-wider whitespace-nowrap">
                        Escuela
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-brand_primary uppercase tracking-wider whitespace-nowrap">
                        Total Estudiantes
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-brand_primary uppercase tracking-wider whitespace-nowrap">
                        Niveles
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-brand_primary uppercase tracking-wider whitespace-nowrap">
                        Ano Impl.
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-brand_primary uppercase tracking-wider whitespace-nowrap">
                        Sist. Periodos
                      </th>
                      {/* One column per custom question */}
                      {data.questions.map((q) => (
                        <th
                          key={q.id}
                          className="px-4 py-3 text-left text-xs font-semibold text-brand_primary uppercase tracking-wider whitespace-nowrap max-w-[200px]"
                          title={q.question_text}
                        >
                          {q.question_text.length > 30
                            ? q.question_text.slice(0, 30) + '...'
                            : q.question_text}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {data.schools.map((school) => {
                      const structural =
                        data.structuralContextBySchool[school.id];
                      const customResponses =
                        data.customResponsesBySchool[school.id] ?? [];

                      // Build a lookup: question_id -> response row
                      const responseMap = new Map<string, any>();
                      for (const r of customResponses) {
                        responseMap.set(r.question_id, r);
                      }

                      return (
                        <tr
                          key={school.id}
                          className="hover:bg-gray-50 transition-colors"
                        >
                          {/* School name */}
                          <td className="px-4 py-3 whitespace-nowrap">
                            <Link
                              href={`/school/transversal-context?school_id=${school.id}`}
                              className="text-sm font-medium text-brand_primary hover:underline inline-flex items-center gap-1"
                            >
                              {school.name}
                              <ExternalLink className="w-3.5 h-3.5 opacity-50" />
                            </Link>
                          </td>

                          {/* Total students */}
                          <td className="px-4 py-3 whitespace-nowrap text-sm">
                            {structural?.total_students != null ? (
                              structural.total_students.toLocaleString('es-CL')
                            ) : (
                              <span className="text-gray-400">&mdash;</span>
                            )}
                          </td>

                          {/* Grade levels */}
                          <td className="px-4 py-3 whitespace-nowrap">
                            {renderGradeLevels(
                              structural?.grade_levels as
                                | GradeLevel[]
                                | undefined
                            )}
                          </td>

                          {/* Implementation year */}
                          <td className="px-4 py-3 whitespace-nowrap text-sm">
                            {structural?.implementation_year_2026 != null ? (
                              `Ano ${structural.implementation_year_2026}`
                            ) : (
                              <span className="text-gray-400">&mdash;</span>
                            )}
                          </td>

                          {/* Period system */}
                          <td className="px-4 py-3 whitespace-nowrap text-sm">
                            {structural?.period_system ? (
                              <span className="capitalize">
                                {structural.period_system}
                              </span>
                            ) : (
                              <span className="text-gray-400">&mdash;</span>
                            )}
                          </td>

                          {/* Custom question columns */}
                          {data.questions.map((q) => {
                            const responseRow = responseMap.get(q.id);
                            return (
                              <td
                                key={q.id}
                                className="px-4 py-3 whitespace-nowrap"
                              >
                                {renderCustomCell(
                                  responseRow?.response,
                                  q.question_type as ContextQuestionType
                                )}
                              </td>
                            );
                          })}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </div>
    </MainLayout>
  );
}
