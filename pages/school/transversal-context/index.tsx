import { useSupabaseClient } from '@supabase/auth-helpers-react';
import React, { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { toast } from 'react-hot-toast';
import MainLayout from '@/components/layout/MainLayout';
import { ResponsiveFunctionalPageHeader } from '@/components/layout/FunctionalPageHeader';
import {
  Building2,
  Edit2,
  CheckCircle,
  AlertCircle,
  Users,
  GraduationCap,
  Calendar,
  UserPlus,
  UserCog,
  X,
  Loader2,
  ArrowLeft,
  MapIcon,
  BookOpen,
  Clock,
  HelpCircle,
} from 'lucide-react';
import ChangeHistorySection from '@/components/school/ChangeHistorySection';
import CompletionStatusBadge from '@/components/school/CompletionStatusBadge';
import { TRANSVERSAL_CONTEXT_FIELD_LABELS } from '@/lib/constants/transversal-context';
import type { SchoolTransversalContext, GradeLevel, ContextGeneralQuestion, ContextGeneralResponse } from '@/types/assessment-builder';
import { GRADE_LEVEL_LABELS } from '@/types/assessment-builder';
import type { UserRoleType } from '@/types/roles';

type DocenteOption = {
  id: string;
  name: string | null;
  email: string | null;
  roles?: UserRoleType[];
};

const DOCENTE_ROLE_BADGE_LABELS: Partial<Record<UserRoleType, string>> = {
  docente: 'Docente',
  admin: 'Admin',
  consultor: 'Consultor',
  equipo_directivo: 'Directivo',
  lider_generacion: 'Líder generación',
  lider_comunidad: 'Líder comunidad',
};

const docenteRoleLabel = (role: UserRoleType): string =>
  DOCENTE_ROLE_BADGE_LABELS[role] ?? role;

const WIDGET_ICON_MAP: Record<string, React.FC<{ className?: string }>> = {
  total_students: Users,
  grade_levels: GraduationCap,
  courses_per_level: BookOpen,
  implementation_year: Calendar,
  period_system: Clock,
  programa_inicia: CheckCircle,
  generic: HelpCircle,
};

const TransversalContextDashboard: React.FC = () => {
  const router = useRouter();
  const supabase = useSupabaseClient();
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [hasPermission, setHasPermission] = useState<boolean | null>(null);
  const [avatarUrl, setAvatarUrl] = useState<string>('');
  const [schoolId, setSchoolId] = useState<number | null>(null);
  const [schoolName, setSchoolName] = useState<string>('');

  const [context, setContext] = useState<SchoolTransversalContext | null>(null);
  const [courseStructure, setCourseStructure] = useState<any[]>([]);

  // Track if user is admin/consultor (read-only mode)
  // R11 — admin and consultor are separated: an admin (without a directivo
  // role at the school) picks a school and then holds the full initial-assign /
  // edit / assign / replace capability; a consultor is denied on this surface
  // until the product decision (deny vs. designed read-only) is taken.
  const [isAdminViewer, setIsAdminViewer] = useState(false);
  const [consultorDenied, setConsultorDenied] = useState(false);

  // School selector for admins
  const [schools, setSchools] = useState<any[]>([]);
  const [loadingSchools, setLoadingSchools] = useState(false);

  // Docente assignment modal state
  const [assignModalOpen, setAssignModalOpen] = useState(false);
  const [selectedCourse, setSelectedCourse] = useState<any>(null);
  const [availableDocentes, setAvailableDocentes] = useState<DocenteOption[]>([]);
  const [selectedDocente, setSelectedDocente] = useState<string>('');
  const [loadingDocentes, setLoadingDocentes] = useState(false);
  const [assigning, setAssigning] = useState(false);
  // Blocking failure of the last attempt, shown inside the modal (which stays open)
  const [assignError, setAssignError] = useState<string | null>(null);
  const [assignErrorWarnings, setAssignErrorWarnings] = useState<string[]>([]);
  // Non-blocking warnings from the last successful assignment, visible until dismissed
  const [assignmentNotice, setAssignmentNotice] = useState<{
    courseName: string;
    message: string;
    warnings: string[];
  } | null>(null);

  // PR 2 item 2 — safe docente replacement (admin / equipo_directivo only).
  // The modal posts to /replace-docente; the RPC behind it swaps the docente
  // only while every live evaluation of the course is pending and answer-free.
  const [canReplaceDocente, setCanReplaceDocente] = useState(false);
  const [replaceModalOpen, setReplaceModalOpen] = useState(false);
  const [replaceCourse, setReplaceCourse] = useState<any>(null);
  const [replaceCandidates, setReplaceCandidates] = useState<DocenteOption[]>([]);
  const [selectedReplacement, setSelectedReplacement] = useState<string>('');
  const [loadingReplaceCandidates, setLoadingReplaceCandidates] = useState(false);
  const [replacing, setReplacing] = useState(false);
  // Refusal of the last attempt, shown inside the modal (which stays open)
  const [replaceError, setReplaceError] = useState<{ code: string | null; message: string } | null>(null);
  // Last successful replacement, visible until dismissed
  const [replacementNotice, setReplacementNotice] = useState<{ courseName: string; message: string } | null>(null);

  // All context questions (structural + generic, driven from DB)
  const [allQuestions, setAllQuestions] = useState<ContextGeneralQuestion[]>([]);
  const [customResponses, setCustomResponses] = useState<ContextGeneralResponse[]>([]);

  // Completion status
  const [completionStatus, setCompletionStatus] = useState<Record<string, {
    is_completed: boolean;
    completed_at: string | null;
    completed_by_name: string | null;
    last_updated_at: string | null;
    last_updated_by_name: string | null;
  }>>({});

  // Check auth and permissions
  useEffect(() => {
    const checkAuth = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user) {
        router.push('/login');
        return;
      }
      setUser(session.user);

      const { data: profileData } = await supabase
        .from('profiles')
        .select('avatar_url')
        .eq('id', session.user.id)
        .single();

      if (profileData?.avatar_url) {
        setAvatarUrl(profileData.avatar_url);
      }

      // Check permissions and get school_id
      const { data: roles } = await supabase
        .from('user_roles')
        .select('role_type, school_id')
        .eq('user_id', session.user.id)
        .eq('is_active', true);

      if (!roles || roles.length === 0) {
        setHasPermission(false);
        setLoading(false);
        return;
      }

      const isAdmin = roles.some(r => r.role_type === 'admin');
      const isConsultor = roles.some(r => r.role_type === 'consultor');
      const directivoRole = roles.find(r => r.role_type === 'equipo_directivo');

      if (!isAdmin && !directivoRole) {
        // A consultor without admin/directivo rights lands on the pending-
        // decision notice, everyone else on the generic denial. Nothing is
        // fetched for either.
        setConsultorDenied(isConsultor);
        setHasPermission(false);
        setLoading(false);
        return;
      }

      setHasPermission(true);
      // Codex round 1 (finding 6): ADMIN takes precedence over equipo_directivo.
      // A mixed-role admin keeps the global selector, the "back to schools"
      // control and the edit / assign / replace capability on ANY school.
      setIsAdminViewer(isAdmin);
      // Replacement is a write: admin or equipo_directivo only (never consultor).
      setCanReplaceDocente(roles.some(r => ['admin', 'equipo_directivo'].includes(r.role_type)));

      // Get school_id — admin first, then the directivo's own school.
      let effectiveSchoolId: number | null = null;
      const querySchoolId = router.query.school_id;
      const parsedQuerySchoolId =
        typeof querySchoolId === 'string' && /^\d+$/.test(querySchoolId) ? parseInt(querySchoolId, 10) : null;

      if (isAdmin) {
        // An explicit school_id is honoured on any school (admin authority);
        // without one, a mixed-role admin still gets the global selector.
        effectiveSchoolId = parsedQuerySchoolId;
      } else if (directivoRole?.school_id) {
        effectiveSchoolId = directivoRole.school_id;

        // Block cross-school access: if query has a different school_id, ignore it
        if (parsedQuerySchoolId !== null && parsedQuerySchoolId !== effectiveSchoolId) {
          router.push('/dashboard');
          return;
        }
      }

      if (effectiveSchoolId) {
        setSchoolId(effectiveSchoolId);

        // Get school name
        const { data: school } = await supabase
          .from('schools')
          .select('name')
          .eq('id', effectiveSchoolId)
          .single();

        if (school) {
          setSchoolName(school.name);
        }
      } else if (isAdmin) {
        // No school selected (admin case without query parameter)
        // Fetch schools via API (bypasses RLS)
        setLoadingSchools(true);
        try {
          const response = await fetch('/api/school/transversal-context/schools');
          const data = await response.json();
          if (response.ok && data.schools) {
            setSchools(data.schools);
          } else {
            console.error('Error fetching schools:', data.error);
          }
        } catch (err) {
          console.error('Error fetching schools:', err);
        } finally {
          setLoadingSchools(false);
          setLoading(false);
        }
      } else {
        setLoading(false);
      }
    };

    checkAuth();
  }, [supabase, router]);

  // Fetch context data
  const fetchContext = useCallback(async () => {
    if (!schoolId) {
      setLoading(false);
      return;
    }

    try {
      const response = await fetch(`/api/school/transversal-context?school_id=${schoolId}`);
      if (!response.ok) {
        throw new Error('Error al cargar el contexto');
      }

      const data = await response.json();
      setContext(data.context);
      setCourseStructure(data.courseStructure || []);
    } catch (error: any) {
      console.error('[TransversalContext] Error fetching context:', error);
      toast.error(error.message || 'Error al cargar el contexto');
    } finally {
      setLoading(false);
    }
  }, [schoolId]);

  useEffect(() => {
    if (schoolId && hasPermission) {
      fetchContext();
    }
  }, [schoolId, hasPermission, fetchContext]);

  // Fetch custom context questions, responses, and completion status
  useEffect(() => {
    if (!schoolId || !hasPermission) return;
    const fetchCustom = async () => {
      try {
        const [qRes, rRes, csRes] = await Promise.all([
          fetch('/api/school/transversal-context/questions'),
          fetch(`/api/school/transversal-context/custom-responses?school_id=${schoolId}`),
          fetch(`/api/school/completion-status?school_id=${schoolId}`),
        ]);
        if (qRes.ok) {
          const qData = await qRes.json();
          setAllQuestions((qData.questions || []).filter((q: ContextGeneralQuestion) => q.is_active));
        }
        if (rRes.ok) {
          const rData = await rRes.json();
          setCustomResponses(rData.responses || []);
        }
        if (csRes.ok) {
          const csData = await csRes.json();
          setCompletionStatus(csData.status || {});
        }
      } catch (err) {
        console.error('Error fetching custom context:', err);
      }
    };
    fetchCustom();
  }, [schoolId, hasPermission]);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    router.push('/login');
  };

  // Open assignment modal and fetch available docentes
  const openAssignModal = async (course: any) => {
    setSelectedCourse(course);
    setSelectedDocente('');
    setAssignError(null);
    setAssignErrorWarnings([]);
    setAssignModalOpen(true);
    setLoadingDocentes(true);

    try {
      const response = await fetch(`/api/school/transversal-context/docentes?school_id=${schoolId}`);
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Error al cargar docentes');
      }

      // Get already assigned docentes to this course
      const assignedIds = new Set(
        course.school_course_docente_assignments
          ?.filter((a: any) => a.is_active)
          .map((a: any) => a.docente_id) || []
      );

      // Filter out already assigned docentes
      const available: DocenteOption[] = (data.docentes || [])
        .filter((d: DocenteOption) => !assignedIds.has(d.id));

      setAvailableDocentes(available);
    } catch (error: any) {
      console.error('Error fetching docentes:', error);
      toast.error('Error al cargar docentes');
      setAvailableDocentes([]);
    } finally {
      setLoadingDocentes(false);
    }
  };

  const closeAssignModal = () => {
    setAssignModalOpen(false);
    setAssignError(null);
    setAssignErrorWarnings([]);
  };

  // Handle docente assignment.
  // PROC-CONTAIN-01 (A-02): the API preflights the eligible templates and answers
  // 422 (nothing written) or 207 (assignment written, no evaluation confirmed)
  // with a structured, actionable message. A blocking failure keeps the modal
  // open and shows that message so the directivo can act or retry (a retry
  // reconciles missing evaluations). Warnings on success stay visible in a
  // banner and are never relabeled as complete success.
  // C-01: a 409 (course already has an active docente, or has more than one)
  // also keeps the modal open with the message, and ALWAYS refreshes the course
  // list even though nothing was written — the list this page rendered was
  // stale, and the refreshed state removes the "Asignar" control it offered.
  // No replacement flow is opened or suggested.
  const handleAssignDocente = async () => {
    if (!selectedCourse || !selectedDocente) return;

    setAssigning(true);
    setAssignError(null);
    setAssignErrorWarnings([]);
    try {
      const response = await fetch('/api/school/transversal-context/assign-docente', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          course_structure_id: selectedCourse.id,
          docente_id: selectedDocente,
        }),
      });

      let data: any = {};
      try {
        data = await response.json();
      } catch {
        data = {};
      }

      const warnings: string[] = Array.isArray(data.warnings)
        ? data.warnings
        : Array.isArray(data.assessments?.warnings)
          ? data.assessments.warnings
          : [];

      if (!response.ok || data.success !== true) {
        const message = data.error || data.message || 'No se pudo completar la asignación del docente';
        setAssignError(message);
        setAssignErrorWarnings(warnings);
        toast.error(message, { duration: 8000 });
        if (data.assignment?.mutated || response.status === 409) {
          // Either the course assignment was written even though no evaluation
          // was confirmed, or the course state this page offered was stale
          // (409): refresh so the course list stays truthful.
          fetchContext();
        }
        return; // modal stays open
      }

      const message = data.message || 'Docente asignado correctamente';
      if (warnings.length > 0) {
        setAssignmentNotice({ courseName: selectedCourse.course_name, message, warnings });
        toast(`${message} Hay advertencias que revisar.`, { icon: '⚠️', duration: 10000 });
      } else {
        setAssignmentNotice(null);
        toast.success(message);
      }

      closeAssignModal();
      fetchContext(); // Refresh data
    } catch (error: any) {
      console.error('Error assigning docente:', error);
      const message = error.message || 'Error al asignar docente';
      setAssignError(message);
      toast.error(message);
    } finally {
      setAssigning(false);
    }
  };

  // C-01: the page-level "Desasignar" control is deliberately gone. Exposing it
  // next to "Asignar" created an unassign-then-reassign replacement path that
  // could attach a new docente to a preserved assessment instance. Replacement
  // is the controlled process below (PR 2 item 2): one atomic RPC that only
  // proceeds while the evaluation has not started and never transfers answers.
  // The DELETE endpoint itself is unchanged.

  const currentDocenteOf = (course: any) =>
    course?.school_course_docente_assignments?.find((a: any) => a.is_active) ?? null;

  const openReplaceModal = async (course: any) => {
    setReplaceCourse(course);
    setSelectedReplacement('');
    setReplaceError(null);
    setReplaceModalOpen(true);
    setLoadingReplaceCandidates(true);

    try {
      const response = await fetch(`/api/school/transversal-context/docentes?school_id=${schoolId}`);
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'Error al cargar docentes');
      }
      const currentId = currentDocenteOf(course)?.docente_id;
      setReplaceCandidates(
        (data.docentes || []).filter((d: DocenteOption) => d.id !== currentId)
      );
    } catch (error: any) {
      console.error('Error fetching docentes:', error);
      toast.error('Error al cargar docentes');
      setReplaceCandidates([]);
    } finally {
      setLoadingReplaceCandidates(false);
    }
  };

  const closeReplaceModal = () => {
    setReplaceModalOpen(false);
    setReplaceError(null);
  };

  // A refusal keeps the modal open with the API's explanation. A 409
  // evaluation_started means the course can no longer be changed from here;
  // the other 409s (no active docente, invariant violation) mean the list this
  // page rendered was stale, so the course list is refreshed. Success closes
  // the modal, refreshes the list and leaves a notice.
  const handleReplaceDocente = async () => {
    if (!replaceCourse || !selectedReplacement) return;

    setReplacing(true);
    setReplaceError(null);
    try {
      const response = await fetch('/api/school/transversal-context/replace-docente', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          course_structure_id: replaceCourse.id,
          docente_id: selectedReplacement,
        }),
      });

      let data: any = {};
      try {
        data = await response.json();
      } catch {
        data = {};
      }

      if (!response.ok || data.success !== true) {
        const message = data.error || data.message || 'No se pudo completar el cambio de docente';
        setReplaceError({ code: data.code ?? null, message });
        toast.error(message, { duration: 8000 });
        if (response.status === 409 && data.code !== 'evaluation_started') {
          fetchContext();
        }
        return; // modal stays open
      }

      const message = data.message || 'Docente cambiado correctamente';
      setReplacementNotice({ courseName: replaceCourse.course_name, message });
      toast.success(message);
      closeReplaceModal();
      fetchContext();
    } catch (error: any) {
      console.error('Error replacing docente:', error);
      const message = error.message || 'Error al cambiar docente';
      setReplaceError({ code: null, message });
      toast.error(message);
    } finally {
      setReplacing(false);
    }
  };

  // Loading state
  if (loading || hasPermission === null) {
    return (
      <div className="min-h-screen bg-brand_beige flex justify-center items-center">
        <Loader2 className="w-8 h-8 animate-spin text-brand_primary" />
      </div>
    );
  }

  // Access denied
  if (hasPermission === false) {
    return (
      <MainLayout
        user={user}
        currentPage="transversal-context"
        pageTitle=""
        breadcrumbs={[]}
        isAdmin={false}
        onLogout={handleLogout}
        avatarUrl={avatarUrl}
      >
        <div className="flex flex-col justify-center items-center min-h-[50vh]">
          <div className="text-center p-8" data-testid={consultorDenied ? 'consultor-access-pending' : 'access-denied'}>
            <h1 className="text-2xl font-semibold text-brand_primary mb-4">
              {consultorDenied ? 'Acceso pendiente de definición' : 'Acceso Denegado'}
            </h1>
            <p className="text-brand_primary/70 mb-6">
              {consultorDenied
                ? 'El acceso de consultores al contexto transversal aún no está definido. Por ahora solo el equipo directivo y los administradores pueden acceder.'
                : 'Solo directivos y administradores pueden acceder al contexto transversal.'}
            </p>
            <Link href="/dashboard" legacyBehavior>
              <a className="px-6 py-2 bg-brand_primary text-white rounded-lg shadow hover:bg-brand_primary/90 transition-colors">
                Ir al Panel
              </a>
            </Link>
          </div>
        </div>
      </MainLayout>
    );
  }

  // No school selected (admin case)
  if (!schoolId) {
    const handleSchoolSelect = (e: React.ChangeEvent<HTMLSelectElement>) => {
      const selectedId = e.target.value;
      if (selectedId) {
        router.push(`/school/transversal-context?school_id=${selectedId}`);
      }
    };

    return (
      <MainLayout
        user={user}
        currentPage="transversal-context"
        pageTitle=""
        breadcrumbs={[]}
        isAdmin={true}
        onLogout={handleLogout}
        avatarUrl={avatarUrl}
      >
        <ResponsiveFunctionalPageHeader
          icon={<Building2 />}
          title="Contexto Transversal"
          subtitle="Selecciona una escuela"
        />
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="bg-white shadow-md rounded-lg p-8 text-center">
            <Building2 className="mx-auto h-12 w-12 text-brand_primary/30 mb-4" />
            <h3 className="text-lg font-medium text-brand_primary mb-2">
              Selecciona una escuela
            </h3>
            <p className="text-sm text-brand_primary/60 mb-6">
              Como administrador, selecciona una escuela para ver su contexto transversal.
            </p>

            {loadingSchools ? (
              <div className="flex items-center justify-center">
                <Loader2 className="w-6 h-6 animate-spin text-brand_primary" />
              </div>
            ) : schools.length > 0 ? (
              <div className="max-w-xs mx-auto">
                <select
                  onChange={handleSchoolSelect}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand_accent text-brand_primary"
                  defaultValue=""
                >
                  <option value="" disabled>-- Seleccionar escuela --</option>
                  {schools.map((school) => (
                    <option key={school.id} value={school.id}>
                      {school.name}
                    </option>
                  ))}
                </select>
              </div>
            ) : (
              <p className="text-sm text-brand_primary/60">No hay escuelas disponibles</p>
            )}
          </div>
        </div>
      </MainLayout>
    );
  }

  // Group courses by grade level
  const coursesByGrade: Record<string, any[]> = {};
  courseStructure.forEach(course => {
    if (!coursesByGrade[course.grade_level]) {
      coursesByGrade[course.grade_level] = [];
    }
    coursesByGrade[course.grade_level].push(course);
  });

  const hasCompleteContext = context &&
    context.total_students &&
    context.grade_levels?.length > 0 &&
    context.implementation_year_2026 &&
    context.period_system;

  // Sort grade levels in order
  const sortedGradeLevels = context?.grade_levels?.sort((a, b) => {
    const order = [
      'medio_menor', 'medio_mayor', 'pre_kinder', 'kinder',
      '1_basico', '2_basico', '3_basico', '4_basico', '5_basico', '6_basico', '7_basico', '8_basico',
      '1_medio', '2_medio', '3_medio', '4_medio'
    ];
    return order.indexOf(a) - order.indexOf(b);
  }) || [];

  return (
    <MainLayout
      user={user}
      currentPage="transversal-context"
      pageTitle=""
      breadcrumbs={[]}
      isAdmin={hasPermission}
      onLogout={handleLogout}
      avatarUrl={avatarUrl}
    >
      <ResponsiveFunctionalPageHeader
        icon={<Building2 />}
        title="Contexto Transversal"
        subtitle={schoolName || 'Mi Escuela'}
      />

      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {/* Back button for admins (school picker) */}
        {isAdminViewer && (
          <button
            onClick={async () => {
              setSchoolId(null);
              setSchoolName('');
              setContext(null);
              setCourseStructure([]);
              setLoadingSchools(true);
              try {
                const response = await fetch('/api/school/transversal-context/schools');
                const data = await response.json();
                if (response.ok && data.schools) {
                  setSchools(data.schools);
                }
              } catch (err) {
                console.error('Error fetching schools:', err);
              } finally {
                setLoadingSchools(false);
              }
              router.push('/school/transversal-context', undefined, { shallow: true });
            }}
            className="inline-flex items-center text-sm text-brand_primary/70 hover:text-brand_accent mb-6 transition-colors"
          >
            <ArrowLeft className="w-4 h-4 mr-1" />
            Volver a Selección de Escuelas
          </button>
        )}

        {/* Status Banner */}
        <div className={`mb-6 p-4 rounded-lg flex items-center gap-3 ${
          hasCompleteContext
            ? 'bg-brand_accent/20 border border-brand_accent'
            : 'bg-brand_beige border border-brand_primary/20'
        }`}>
          {hasCompleteContext ? (
            <>
              <CheckCircle className="w-6 h-6 text-brand_primary" />
              <div>
                <p className="font-medium text-brand_primary">Contexto Estructural</p>
                <p className="text-sm text-brand_primary/70">
                  Última actualización: {new Date(context.updated_at).toLocaleDateString('es-CL')}
                </p>
              </div>
            </>
          ) : (
            <>
              <AlertCircle className="w-6 h-6 text-brand_primary/70" />
              <div>
                <p className="font-medium text-brand_primary">Cuestionario pendiente</p>
                <p className="text-sm text-brand_primary/70">
                  {isAdminViewer
                    ? 'El equipo directivo debe completar el cuestionario transversal; como administrador también puede completarlo'
                    : 'Complete el cuestionario transversal para configurar su escuela'}
                </p>
              </div>
            </>
          )}
          {/* Edit button - directivos and admins (R11: admin keeps the initial-assign / edit capability) */}
          {(
            <Link
              href={`/school/transversal-context/edit${schoolId ? `?school_id=${schoolId}` : ''}`}
              legacyBehavior
            >
              <a className="ml-auto inline-flex items-center px-4 py-2 bg-brand_primary text-white rounded-lg text-sm font-medium hover:bg-brand_primary/90">
                <Edit2 className="w-4 h-4 mr-2" />
                {hasCompleteContext ? 'Editar' : 'Completar'}
              </a>
            </Link>
          )}
        </div>

        {/* Completion status badges — always visible */}
        {schoolId && Object.keys(completionStatus).length > 0 && (
          <div className="mb-4 flex flex-wrap items-center gap-4">
            <div className="flex items-center gap-2">
              <p className="text-sm text-brand_primary/70">Contexto Estructural</p>
              <CompletionStatusBadge
                isCompleted={completionStatus.transversal_context?.is_completed ?? false}
                completedByName={completionStatus.transversal_context?.completed_by_name ?? undefined}
                completedAt={completionStatus.transversal_context?.completed_at ?? undefined}
                lastUpdatedByName={completionStatus.transversal_context?.last_updated_by_name ?? undefined}
                lastUpdatedAt={completionStatus.transversal_context?.last_updated_at ?? undefined}
              />
            </div>
            <div className="flex items-center gap-2">
              <p className="text-sm text-brand_primary/70">Preguntas de Contexto</p>
              <CompletionStatusBadge
                isCompleted={completionStatus.context_responses?.is_completed ?? false}
                completedByName={completionStatus.context_responses?.completed_by_name ?? undefined}
                completedAt={completionStatus.context_responses?.completed_at ?? undefined}
                lastUpdatedByName={completionStatus.context_responses?.last_updated_by_name ?? undefined}
                lastUpdatedAt={completionStatus.context_responses?.last_updated_at ?? undefined}
              />
            </div>
          </div>
        )}

        {/* Link to Migration Plan */}
        {context && (
          <div className="mb-6">
            <Link
              href={`/school/migration-plan${schoolId ? `?school_id=${schoolId}` : ''}`}
              legacyBehavior
            >
              <a className="inline-flex items-center px-4 py-2 bg-brand_accent text-brand_primary rounded-lg text-sm font-medium hover:bg-brand_accent/80 transition-colors">
                <MapIcon className="w-4 h-4 mr-2" />
                Ver Plan de Migración
              </a>
            </Link>
          </div>
        )}

        {/* Questions and Answers Section — data-driven from DB */}
        {context && (
          <div className="space-y-6">
            {allQuestions.map(q => {
              const widgetType = q.widget_type || 'generic';
              const IconComponent = WIDGET_ICON_MAP[widgetType] || HelpCircle;

              // --- total_students ---
              if (widgetType === 'total_students') {
                return (
                  <div key={q.id} className="bg-white shadow-md rounded-lg p-6">
                    <div className="flex items-start gap-4">
                      <div className="p-3 bg-brand_accent/20 rounded-lg">
                        <IconComponent className="w-6 h-6 text-brand_primary" />
                      </div>
                      <div className="flex-1">
                        <h3 className="text-sm font-medium text-brand_primary/60 mb-1">
                          {q.question_text}
                        </h3>
                        <p className="text-2xl font-bold text-brand_primary">
                          {context.total_students?.toLocaleString('es-CL') || 'No especificado'}
                        </p>
                      </div>
                    </div>
                  </div>
                );
              }

              // --- grade_levels ---
              if (widgetType === 'grade_levels') {
                return (
                  <div key={q.id} className="bg-white shadow-md rounded-lg p-6">
                    <div className="flex items-start gap-4">
                      <div className="p-3 bg-brand_accent/20 rounded-lg">
                        <IconComponent className="w-6 h-6 text-brand_primary" />
                      </div>
                      <div className="flex-1">
                        <h3 className="text-sm font-medium text-brand_primary/60 mb-3">
                          {q.question_text} ({sortedGradeLevels.length} seleccionados)
                        </h3>
                        <div className="flex flex-wrap gap-2">
                          {sortedGradeLevels.map(level => (
                            <span
                              key={level}
                              className="px-3 py-1.5 bg-brand_accent/20 text-brand_primary text-sm font-medium rounded-lg"
                            >
                              {GRADE_LEVEL_LABELS[level as GradeLevel] || level}
                            </span>
                          ))}
                          {sortedGradeLevels.length === 0 && (
                            <span className="text-brand_primary/60">No hay niveles seleccionados</span>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              }

              // --- courses_per_level ---
              if (widgetType === 'courses_per_level') {
                if (!context.courses_per_level || Object.keys(context.courses_per_level).length === 0) {
                  return null;
                }
                return (
                  <div key={q.id} className="bg-white shadow-md rounded-lg p-6">
                    <div className="flex items-start gap-4">
                      <div className="p-3 bg-brand_accent/20 rounded-lg">
                        <IconComponent className="w-6 h-6 text-brand_primary" />
                      </div>
                      <div className="flex-1">
                        <h3 className="text-sm font-medium text-brand_primary/60 mb-3">
                          {q.question_text}
                        </h3>
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                          {sortedGradeLevels.map(level => {
                            const count = context.courses_per_level?.[level as GradeLevel] || 1;
                            return (
                              <div key={level} className="flex items-center gap-2 p-2 bg-brand_beige rounded-lg">
                                <span className="text-sm text-brand_primary">
                                  {GRADE_LEVEL_LABELS[level as GradeLevel] || level}
                                </span>
                                <span className="text-sm font-bold text-brand_primary bg-brand_accent/30 px-2 py-0.5 rounded">
                                  {count}
                                </span>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              }

              // --- implementation_year ---
              if (widgetType === 'implementation_year') {
                return (
                  <div key={q.id} className="bg-white shadow-md rounded-lg p-6">
                    <div className="flex items-start gap-4">
                      <div className="p-3 bg-brand_accent/20 rounded-lg">
                        <IconComponent className="w-6 h-6 text-brand_primary" />
                      </div>
                      <div className="flex-1">
                        <h3 className="text-sm font-medium text-brand_primary/60 mb-1">
                          {q.question_text}
                        </h3>
                        <p className="text-2xl font-bold text-brand_primary">
                          Año {context.implementation_year_2026 || 'No especificado'}
                        </p>
                        <p className="text-sm text-brand_primary/60 mt-1">
                          {context.implementation_year_2026 === 1 && 'Incipiente - Primer año de transformación'}
                          {context.implementation_year_2026 === 2 && 'En Desarrollo - Segundo año de transformación'}
                          {context.implementation_year_2026 === 3 && 'Avanzado - Tercer año de transformación'}
                          {context.implementation_year_2026 === 4 && 'Consolidando - Cuarto año de transformación'}
                          {context.implementation_year_2026 === 5 && 'Consolidado - Quinto año de transformación'}
                        </p>
                      </div>
                    </div>
                  </div>
                );
              }

              // --- period_system ---
              if (widgetType === 'period_system') {
                return (
                  <div key={q.id} className="bg-white shadow-md rounded-lg p-6">
                    <div className="flex items-start gap-4">
                      <div className="p-3 bg-brand_accent/20 rounded-lg">
                        <IconComponent className="w-6 h-6 text-brand_primary" />
                      </div>
                      <div className="flex-1">
                        <h3 className="text-sm font-medium text-brand_primary/60 mb-1">
                          {q.question_text}
                        </h3>
                        <p className="text-2xl font-bold text-brand_primary capitalize">
                          {context.period_system || 'No especificado'}
                        </p>
                        <p className="text-sm text-brand_primary/60 mt-1">
                          {context.period_system === 'semestral' && '2 períodos por año académico'}
                          {context.period_system === 'trimestral' && '3 períodos por año académico'}
                        </p>
                      </div>
                    </div>
                  </div>
                );
              }

              // --- programa_inicia ---
              if (widgetType === 'programa_inicia') {
                return (
                  <div key={q.id} className="bg-white shadow-md rounded-lg p-6">
                    <div className="flex items-start gap-4">
                      <div className="p-3 bg-brand_accent/20 rounded-lg">
                        <IconComponent className="w-6 h-6 text-brand_primary" />
                      </div>
                      <div className="flex-1">
                        <h3 className="text-sm font-medium text-brand_primary/60 mb-1">
                          {q.question_text}
                        </h3>
                        <p className="text-2xl font-bold text-brand_primary">
                          {context.programa_inicia_completed ? 'Sí' : 'No'}
                        </p>
                        {context.programa_inicia_completed && context.programa_inicia_hours && (
                          <p className="text-sm text-brand_primary/60 mt-1">
                            {context.programa_inicia_hours} horas/año
                          </p>
                        )}
                      </div>
                    </div>
                  </div>
                );
              }

              // --- generic ---
              if (widgetType === 'generic') {
                const resp = customResponses.find(r => r.question_id === q.id);
                const value = resp?.response;
                return (
                  <div key={q.id} className="bg-white shadow-md rounded-lg p-6">
                    <div className="flex items-start gap-4">
                      <div className="p-3 bg-brand_accent/20 rounded-lg">
                        <IconComponent className="w-6 h-6 text-brand_primary" />
                      </div>
                      <div className="flex-1">
                        <h3 className="text-sm font-medium text-brand_primary/60 mb-1">
                          {q.question_text}
                        </h3>
                        <p className="text-base font-medium text-brand_primary">
                          {value === undefined || value === null || value === ''
                            ? <span className="text-brand_primary/40">Sin respuesta</span>
                            : q.question_type === 'boolean'
                              ? (value === true ? 'Sí' : 'No')
                              : q.question_type === 'multiselect' && Array.isArray(value)
                                ? (value as string[]).join(', ')
                                : String(value)
                          }
                        </p>
                      </div>
                    </div>
                  </div>
                );
              }

              // Unknown widget type — skip
              return null;
            })}
          </div>
        )}

        {/* Non-blocking warnings from the last docente assignment (visible until dismissed) */}
        {assignmentNotice && (
          <div
            data-testid="assign-docente-warnings"
            role="status"
            className="mt-6 p-4 rounded-lg bg-amber-50 border border-amber-300 text-sm text-amber-900"
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="font-medium">
                  Docente asignado con advertencias: {assignmentNotice.courseName}
                </p>
                <p className="mt-1">{assignmentNotice.message}</p>
                <ul className="list-disc ml-5 mt-2">
                  {assignmentNotice.warnings.map((w) => (
                    <li key={w}>{w}</li>
                  ))}
                </ul>
              </div>
              <button
                data-testid="assign-docente-warnings-dismiss"
                onClick={() => setAssignmentNotice(null)}
                className="p-1 hover:bg-amber-100 rounded"
                title="Cerrar"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}

        {/* Last successful docente replacement (visible until dismissed) */}
        {replacementNotice && (
          <div
            data-testid="replace-docente-success"
            role="status"
            className="mt-6 p-4 rounded-lg bg-green-50 border border-green-300 text-sm text-green-900"
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="font-medium">Docente cambiado: {replacementNotice.courseName}</p>
                <p className="mt-1">{replacementNotice.message}</p>
              </div>
              <button
                data-testid="replace-docente-success-dismiss"
                onClick={() => setReplacementNotice(null)}
                className="p-1 hover:bg-green-100 rounded"
                title="Cerrar"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}

        {/* Course Structure */}
        {courseStructure.length > 0 && (
          <div className="bg-white shadow-md rounded-lg overflow-hidden mt-6">
            <div className="p-4 border-b border-gray-200">
              <h3 className="text-lg font-semibold text-brand_primary">Estructura de Cursos</h3>
              <p className="text-sm text-brand_primary/60">
                {courseStructure.length} cursos configurados
              </p>
            </div>

            <div className="divide-y divide-gray-200">
              {Object.entries(coursesByGrade).map(([gradeLevel, courses]) => (
                <div key={gradeLevel} className="p-4">
                  <h4 className="font-medium text-brand_primary mb-3">
                    {GRADE_LEVEL_LABELS[gradeLevel as GradeLevel] || gradeLevel}
                  </h4>
                  <div className="space-y-2">
                    {courses.map(course => {
                      const activeAssignments = course.school_course_docente_assignments?.filter(
                        (a: any) => a.is_active
                      ) || [];
                      // C-01 — classify by the number of ACTIVE assignments the API returned:
                      //   0  → the ordinary "Asignar" control (directivos and admins)
                      //   1  → locked: no "Asignar", no "Desasignar"; changing the docente is a
                      //        controlled administrative resolution (C-02), not a page action
                      //   >1 → integrity conflict: nothing is offered and no row is presumed
                      //        correct; every active assignment stays visible as returned
                      const activeCount = activeAssignments.length;
                      const isLocked = activeCount === 1;
                      const hasIntegrityConflict = activeCount > 1;
                      // R11: admin and directivo may assign; a consultor never reaches this page.
                      const canOfferAssign = activeCount === 0;

                      return (
                        <div
                          key={course.id}
                          data-testid={`course-card-${course.id}`}
                          className={`p-3 rounded-lg border ${
                            hasIntegrityConflict
                              ? 'bg-red-50 border-red-300'
                              : isLocked
                                ? 'bg-brand_accent/10 border-brand_accent'
                                : 'bg-brand_beige border-brand_primary/10'
                          }`}
                        >
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <span className="font-medium text-brand_primary">{course.course_name}</span>
                              {isLocked && <CheckCircle className="w-4 h-4 text-brand_primary" />}
                              {hasIntegrityConflict && <AlertCircle className="w-4 h-4 text-red-700" />}
                            </div>
                            {/* Assign control — directivos only, and only while the course has no active docente */}
                            {canOfferAssign && (
                              <button
                                data-testid={`open-assign-docente-${course.id}`}
                                onClick={() => openAssignModal(course)}
                                className="inline-flex items-center px-2 py-1 text-xs font-medium text-brand_primary hover:bg-brand_accent/20 rounded transition-colors"
                              >
                                <UserPlus className="w-3.5 h-3.5 mr-1" />
                                Asignar
                              </button>
                            )}
                          </div>

                          {/* Every active assignment, exactly as returned — no unassign control, no chosen row */}
                          {activeCount > 0 && (
                            <div className="mt-2 space-y-1">
                              {activeAssignments.map((assignment: any) => (
                                <div
                                  key={assignment.id}
                                  data-testid={`course-active-assignment-${assignment.id}`}
                                  className="flex items-center justify-between text-sm bg-white px-2 py-1 rounded"
                                >
                                  <span className="text-brand_primary/80">
                                    {assignment.profiles?.name || assignment.docente_id}
                                  </span>
                                </div>
                              ))}
                            </div>
                          )}

                          {isLocked && (
                            <div className="mt-2 flex items-start justify-between gap-3">
                              <p
                                data-testid={`course-assignment-locked-${course.id}`}
                                className="text-xs text-brand_primary/70"
                              >
                                Este curso ya tiene un docente asignado. Mientras la evaluación no haya comenzado,
                                el equipo directivo puede cambiar el docente con «Cambiar docente»; si ya comenzó,
                                se requiere una resolución administrativa controlada. No es posible desasignar desde esta página.
                              </p>
                              {canReplaceDocente && (
                                <button
                                  data-testid={`open-replace-docente-${course.id}`}
                                  onClick={() => openReplaceModal(course)}
                                  className="shrink-0 inline-flex items-center px-2 py-1 text-xs font-medium text-brand_primary hover:bg-brand_accent/20 rounded transition-colors"
                                >
                                  <UserCog className="w-3.5 h-3.5 mr-1" />
                                  Cambiar docente
                                </button>
                              )}
                            </div>
                          )}

                          {hasIntegrityConflict && (
                            <div
                              data-testid={`course-assignment-integrity-warning-${course.id}`}
                              role="alert"
                              className="mt-2 p-2 rounded bg-white border border-red-200 text-xs text-red-800"
                            >
                              <p className="font-medium">Estado de asignación inválido</p>
                              <p className="mt-1">
                                Este curso registra {activeCount} docentes activos y solo debe tener uno. No es posible
                                asignar ni desasignar desde esta página: solicite una resolución administrativa controlada
                                para corregir la asignación de este curso.
                              </p>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Change History */}
        {context && schoolId && (
          <>
            <ChangeHistorySection
              schoolId={schoolId}
              feature="transversal_context"
              fieldLabels={TRANSVERSAL_CONTEXT_FIELD_LABELS}
            />
            <ChangeHistorySection
              schoolId={schoolId}
              feature="context_responses"
              fieldLabels={Object.fromEntries(
                allQuestions
                  .filter(q => q.widget_type === 'generic')
                  .map(q => [q.id, q.question_text])
              )}
            />
          </>
        )}

        {/* Empty State */}
        {!context && (
          <div className="bg-white shadow-md rounded-lg p-12 text-center">
            <Building2 className="mx-auto h-16 w-16 text-brand_primary/30 mb-4" />
            <h3 className="text-xl font-semibold text-brand_primary mb-2">
              {isAdminViewer ? 'Escuela sin configurar' : 'Configure su escuela'}
            </h3>
            <p className="text-brand_primary/60 mb-6 max-w-md mx-auto">
              {isAdminViewer
                ? 'El equipo directivo de esta escuela aún no ha completado el cuestionario transversal. Como administrador puede completarlo ahora.'
                : 'Complete el cuestionario transversal para configurar los datos de su escuela y habilitar las evaluaciones de transformación.'}
            </p>
            {(
              <Link
                href={`/school/transversal-context/edit${schoolId ? `?school_id=${schoolId}` : ''}`}
                legacyBehavior
              >
                <a className="inline-flex items-center px-6 py-3 bg-brand_primary text-white rounded-lg font-medium hover:bg-brand_primary/90">
                  <Edit2 className="w-5 h-5 mr-2" />
                  Completar Cuestionario
                </a>
              </Link>
            )}
          </div>
        )}
      </div>

      {/* Docente Assignment Modal */}
      {assignModalOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full">
            <div className="p-4 border-b border-gray-200 flex items-center justify-between">
              <h3 className="text-lg font-semibold text-brand_primary">
                Asignar Docente
              </h3>
              <button
                data-testid="assign-docente-close"
                onClick={closeAssignModal}
                className="p-1 hover:bg-brand_beige rounded"
              >
                <X className="w-5 h-5 text-brand_primary/60" />
              </button>
            </div>

            <div className="p-4">
              <p className="text-sm text-brand_primary/70 mb-4">
                Asignar docente al curso <strong className="text-brand_primary">{selectedCourse?.course_name}</strong>
              </p>

              {loadingDocentes ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="w-6 h-6 animate-spin text-brand_primary" />
                </div>
              ) : availableDocentes.length === 0 ? (
                <div className="text-center py-8">
                  <Users className="mx-auto h-10 w-10 text-brand_primary/30 mb-2" />
                  <p className="text-sm text-brand_primary/60">
                    No hay docentes disponibles para asignar
                  </p>
                  <p className="text-xs text-brand_primary/40 mt-1">
                    Todos los docentes ya están asignados o no hay docentes en esta escuela
                  </p>
                </div>
              ) : (
                <div>
                  <label className="block text-sm font-medium text-brand_primary mb-2">
                    Seleccionar Docente
                  </label>
                  <select
                    data-testid="assign-docente-select"
                    value={selectedDocente}
                    onChange={(e) => setSelectedDocente(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand_accent text-brand_primary"
                  >
                    <option value="">-- Seleccionar --</option>
                    {availableDocentes.map(docente => {
                      const displayName = docente.name || docente.email;
                      const roleLabels = (docente.roles ?? [])
                        .map(docenteRoleLabel)
                        .join(', ');
                      return (
                        <option key={docente.id} value={docente.id}>
                          {roleLabels ? `${displayName} — ${roleLabels}` : displayName}
                        </option>
                      );
                    })}
                  </select>
                </div>
              )}

              {assignError && (
                <div
                  data-testid="assign-docente-error"
                  role="alert"
                  className="mt-4 p-3 rounded-lg bg-red-50 border border-red-200 text-sm text-red-800"
                >
                  <p className="font-medium">No se pudo completar la asignación</p>
                  <p className="mt-1">{assignError}</p>
                  {assignErrorWarnings.length > 0 && (
                    <ul className="list-disc ml-5 mt-2 text-red-700">
                      {assignErrorWarnings.map((w) => (
                        <li key={w}>{w}</li>
                      ))}
                    </ul>
                  )}
                </div>
              )}
            </div>

            <div className="p-4 border-t border-gray-200 flex justify-end gap-3">
              <button
                data-testid="assign-docente-cancel"
                onClick={closeAssignModal}
                className="px-4 py-2 text-sm font-medium text-brand_primary/70 hover:text-brand_primary"
              >
                Cancelar
              </button>
              <button
                data-testid="assign-docente-submit"
                onClick={handleAssignDocente}
                disabled={!selectedDocente || assigning}
                className="px-4 py-2 bg-brand_primary text-white text-sm font-medium rounded-lg hover:bg-brand_primary/90 disabled:opacity-50 inline-flex items-center"
              >
                {assigning ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin mr-2" />
                    Asignando...
                  </>
                ) : (
                  <>
                    <UserPlus className="w-4 h-4 mr-2" />
                    Asignar
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Docente Replacement Modal (PR 2 item 2) */}
      {replaceModalOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full">
            <div className="p-4 border-b border-gray-200 flex items-center justify-between">
              <h3 className="text-lg font-semibold text-brand_primary">
                Cambiar Docente
              </h3>
              <button
                data-testid="replace-docente-close"
                onClick={closeReplaceModal}
                className="p-1 hover:bg-brand_beige rounded"
              >
                <X className="w-5 h-5 text-brand_primary/60" />
              </button>
            </div>

            <div className="p-4">
              <p className="text-sm text-brand_primary/70">
                Curso <strong className="text-brand_primary">{replaceCourse?.course_name}</strong>
              </p>
              <p data-testid="replace-docente-current" className="text-sm text-brand_primary/70 mt-1">
                Docente actual:{' '}
                <strong className="text-brand_primary">
                  {currentDocenteOf(replaceCourse)?.profiles?.name || currentDocenteOf(replaceCourse)?.docente_id || '—'}
                </strong>
              </p>
              <p className="mt-3 text-xs text-brand_primary/70 bg-brand_beige rounded p-2">
                El cambio solo es posible mientras la evaluación del curso no haya comenzado y no registre
                respuestas. El docente anterior pierde el acceso a las evaluaciones pendientes y el nuevo docente
                las recibe en blanco: las respuestas nunca se transfieren.
              </p>

              {loadingReplaceCandidates ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="w-6 h-6 animate-spin text-brand_primary" />
                </div>
              ) : replaceCandidates.length === 0 ? (
                <div className="text-center py-8">
                  <Users className="mx-auto h-10 w-10 text-brand_primary/30 mb-2" />
                  <p className="text-sm text-brand_primary/60">
                    No hay otros docentes disponibles en esta escuela
                  </p>
                </div>
              ) : (
                <div className="mt-4">
                  <label className="block text-sm font-medium text-brand_primary mb-2">
                    Nuevo docente
                  </label>
                  <select
                    data-testid="replace-docente-select"
                    value={selectedReplacement}
                    onChange={(e) => setSelectedReplacement(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand_accent text-brand_primary"
                  >
                    <option value="">-- Seleccionar --</option>
                    {replaceCandidates.map(docente => {
                      const displayName = docente.name || docente.email;
                      const roleLabels = (docente.roles ?? [])
                        .map(docenteRoleLabel)
                        .join(', ');
                      return (
                        <option key={docente.id} value={docente.id}>
                          {roleLabels ? `${displayName} — ${roleLabels}` : displayName}
                        </option>
                      );
                    })}
                  </select>
                </div>
              )}

              {replaceError && (
                <div
                  data-testid="replace-docente-error"
                  role="alert"
                  className="mt-4 p-3 rounded-lg bg-red-50 border border-red-200 text-sm text-red-800"
                >
                  <p className="font-medium">
                    {replaceError.code === 'evaluation_started'
                      ? 'La evaluación ya comenzó'
                      : 'No se pudo cambiar el docente'}
                  </p>
                  <p className="mt-1">{replaceError.message}</p>
                </div>
              )}
            </div>

            <div className="p-4 border-t border-gray-200 flex justify-end gap-3">
              <button
                data-testid="replace-docente-cancel"
                onClick={closeReplaceModal}
                className="px-4 py-2 text-sm font-medium text-brand_primary/70 hover:text-brand_primary"
              >
                Cancelar
              </button>
              <button
                data-testid="replace-docente-submit"
                onClick={handleReplaceDocente}
                disabled={!selectedReplacement || replacing}
                className="px-4 py-2 bg-brand_primary text-white text-sm font-medium rounded-lg hover:bg-brand_primary/90 disabled:opacity-50 inline-flex items-center"
              >
                {replacing ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin mr-2" />
                    Cambiando...
                  </>
                ) : (
                  <>
                    <UserCog className="w-4 h-4 mr-2" />
                    Cambiar docente
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </MainLayout>
  );
};

export default TransversalContextDashboard;
