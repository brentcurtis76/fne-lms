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
  X,
  Loader2,
} from 'lucide-react';
import type { SchoolTransversalContext, GradeLevel } from '@/types/assessment-builder';
import { GRADE_LEVEL_LABELS } from '@/types/assessment-builder';

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

  // School selector for admins
  const [schools, setSchools] = useState<any[]>([]);
  const [loadingSchools, setLoadingSchools] = useState(false);

  // Docente assignment modal state
  const [assignModalOpen, setAssignModalOpen] = useState(false);
  const [selectedCourse, setSelectedCourse] = useState<any>(null);
  const [availableDocentes, setAvailableDocentes] = useState<any[]>([]);
  const [selectedDocente, setSelectedDocente] = useState<string>('');
  const [loadingDocentes, setLoadingDocentes] = useState(false);
  const [assigning, setAssigning] = useState(false);

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

      const isAdmin = roles.some(r => ['admin', 'consultor'].includes(r.role_type));
      const directivoRole = roles.find(r => r.role_type === 'equipo_directivo');

      if (!isAdmin && !directivoRole) {
        setHasPermission(false);
        setLoading(false);
        return;
      }

      setHasPermission(true);

      // Get school_id
      let effectiveSchoolId: number | null = null;
      console.log('[TransversalContext] Getting school_id:', {
        directivoRole,
        isAdmin,
        querySchoolId: router.query.school_id,
      });
      if (directivoRole?.school_id) {
        effectiveSchoolId = directivoRole.school_id;
      } else if (isAdmin) {
        // For admin, check query parameter or show school selector
        const querySchoolId = router.query.school_id;
        if (querySchoolId && typeof querySchoolId === 'string') {
          effectiveSchoolId = parseInt(querySchoolId);
        }
      }
      console.log('[TransversalContext] effectiveSchoolId:', effectiveSchoolId);

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
    console.log('[TransversalContext] fetchContext called, schoolId:', schoolId);
    if (!schoolId) {
      console.log('[TransversalContext] No schoolId, skipping fetch');
      setLoading(false);
      return;
    }

    try {
      console.log('[TransversalContext] Fetching from API...');
      const response = await fetch(`/api/school/transversal-context?school_id=${schoolId}`);
      if (!response.ok) {
        throw new Error('Error al cargar el contexto');
      }

      const data = await response.json();
      console.log('[TransversalContext] API response:', {
        hasContext: !!data.context,
        courseStructureLength: data.courseStructure?.length || 0,
        courseStructure: data.courseStructure,
      });
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
    console.log('[TransversalContext] useEffect check:', { schoolId, hasPermission });
    if (schoolId && hasPermission) {
      fetchContext();
    }
  }, [schoolId, hasPermission, fetchContext]);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    router.push('/login');
  };

  // Open assignment modal and fetch available docentes
  const openAssignModal = async (course: any) => {
    setSelectedCourse(course);
    setSelectedDocente('');
    setAssignModalOpen(true);
    setLoadingDocentes(true);

    try {
      // Fetch docentes from the same school via API (bypasses RLS issues)
      console.log('[Docentes] Fetching for school_id:', schoolId);
      const response = await fetch(`/api/school/transversal-context/docentes?school_id=${schoolId}`);
      const data = await response.json();

      console.log('[Docentes] API response:', data);

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
      const available = (data.docentes || [])
        .filter((d: any) => !assignedIds.has(d.id));

      setAvailableDocentes(available);
    } catch (error: any) {
      console.error('Error fetching docentes:', error);
      toast.error('Error al cargar docentes');
      setAvailableDocentes([]);
    } finally {
      setLoadingDocentes(false);
    }
  };

  // Handle docente assignment
  const handleAssignDocente = async () => {
    if (!selectedCourse || !selectedDocente) return;

    setAssigning(true);
    try {
      const response = await fetch('/api/school/transversal-context/assign-docente', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          course_structure_id: selectedCourse.id,
          docente_id: selectedDocente,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Error al asignar docente');
      }

      toast.success('Docente asignado correctamente');

      // Show auto-assignment result
      if (data.autoAssignment) {
        const { instancesCreated, instancesSkipped } = data.autoAssignment;
        if (instancesCreated > 0) {
          toast.success(`Se crearon ${instancesCreated} evaluaciones automáticamente`);
        }
      }

      setAssignModalOpen(false);
      fetchContext(); // Refresh data
    } catch (error: any) {
      console.error('Error assigning docente:', error);
      toast.error(error.message || 'Error al asignar docente');
    } finally {
      setAssigning(false);
    }
  };

  // Handle docente unassignment
  const handleUnassignDocente = async (courseId: string, docenteId: string, docenteName: string) => {
    if (!confirm(`¿Desea desasignar a ${docenteName} de este curso?`)) return;

    try {
      const response = await fetch('/api/school/transversal-context/assign-docente', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          course_structure_id: courseId,
          docente_id: docenteId,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Error al desasignar docente');
      }

      toast.success('Docente desasignado');
      fetchContext(); // Refresh data
    } catch (error: any) {
      console.error('Error unassigning docente:', error);
      toast.error(error.message || 'Error al desasignar docente');
    }
  };

  // Loading state
  if (loading || hasPermission === null) {
    return (
      <div className="min-h-screen bg-brand_beige flex justify-center items-center">
        <p className="text-xl text-brand_blue">Cargando...</p>
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
          <div className="text-center p-8">
            <h1 className="text-2xl font-semibold text-brand_blue mb-4">Acceso Denegado</h1>
            <p className="text-gray-700 mb-6">
              Solo directivos y administradores pueden acceder al contexto transversal.
            </p>
            <Link href="/dashboard" legacyBehavior>
              <a className="px-6 py-2 bg-brand_blue text-white rounded-lg shadow hover:bg-opacity-90 transition-colors">
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
            <Building2 className="mx-auto h-12 w-12 text-gray-300 mb-4" />
            <h3 className="text-lg font-medium text-gray-900 mb-2">
              Selecciona una escuela
            </h3>
            <p className="text-sm text-gray-500 mb-6">
              Como administrador, selecciona una escuela para ver su contexto transversal.
            </p>

            {loadingSchools ? (
              <div className="flex items-center justify-center">
                <Loader2 className="w-6 h-6 animate-spin text-brand_blue" />
              </div>
            ) : schools.length > 0 ? (
              <div className="max-w-xs mx-auto">
                <select
                  onChange={handleSchoolSelect}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand_blue text-gray-900"
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
              <p className="text-sm text-gray-500">No hay escuelas disponibles</p>
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
        {/* Status Banner */}
        <div className={`mb-6 p-4 rounded-lg flex items-center gap-3 ${
          hasCompleteContext
            ? 'bg-green-50 border border-green-200'
            : 'bg-yellow-50 border border-yellow-200'
        }`}>
          {hasCompleteContext ? (
            <>
              <CheckCircle className="w-6 h-6 text-green-600" />
              <div>
                <p className="font-medium text-green-800">Cuestionario completado</p>
                <p className="text-sm text-green-600">
                  Última actualización: {new Date(context.updated_at).toLocaleDateString('es-CL')}
                </p>
              </div>
            </>
          ) : (
            <>
              <AlertCircle className="w-6 h-6 text-yellow-600" />
              <div>
                <p className="font-medium text-yellow-800">Cuestionario pendiente</p>
                <p className="text-sm text-yellow-600">
                  Complete el cuestionario transversal para configurar su escuela
                </p>
              </div>
            </>
          )}
          <Link
            href={`/school/transversal-context/edit${schoolId ? `?school_id=${schoolId}` : ''}`}
            legacyBehavior
          >
            <a className="ml-auto inline-flex items-center px-4 py-2 bg-brand_blue text-white rounded-lg text-sm font-medium hover:bg-brand_blue/90">
              <Edit2 className="w-4 h-4 mr-2" />
              {hasCompleteContext ? 'Editar' : 'Completar'}
            </a>
          </Link>
        </div>

        {/* Context Summary */}
        {context && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
            <div className="bg-white shadow-md rounded-lg p-4">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-blue-100 rounded-lg">
                  <Users className="w-5 h-5 text-blue-600" />
                </div>
                <div>
                  <p className="text-2xl font-bold text-gray-900">{context.total_students}</p>
                  <p className="text-sm text-gray-500">Estudiantes</p>
                </div>
              </div>
            </div>

            <div className="bg-white shadow-md rounded-lg p-4">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-green-100 rounded-lg">
                  <GraduationCap className="w-5 h-5 text-green-600" />
                </div>
                <div>
                  <p className="text-2xl font-bold text-gray-900">
                    {context.grade_levels?.length || 0}
                  </p>
                  <p className="text-sm text-gray-500">Niveles</p>
                </div>
              </div>
            </div>

            <div className="bg-white shadow-md rounded-lg p-4">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-amber-100 rounded-lg">
                  <Calendar className="w-5 h-5 text-amber-600" />
                </div>
                <div>
                  <p className="text-2xl font-bold text-gray-900">
                    Año {context.implementation_year_2026}
                  </p>
                  <p className="text-sm text-gray-500">de transformación (2026)</p>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Course Structure */}
        {courseStructure.length > 0 && (
          <div className="bg-white shadow-md rounded-lg overflow-hidden">
            <div className="p-4 border-b border-gray-200">
              <h3 className="text-lg font-semibold text-brand_blue">Estructura de Cursos</h3>
              <p className="text-sm text-gray-500">
                {courseStructure.length} cursos configurados
              </p>
            </div>

            <div className="divide-y divide-gray-200">
              {Object.entries(coursesByGrade).map(([gradeLevel, courses]) => (
                <div key={gradeLevel} className="p-4">
                  <h4 className="font-medium text-gray-900 mb-3">
                    {GRADE_LEVEL_LABELS[gradeLevel as GradeLevel] || gradeLevel}
                  </h4>
                  <div className="space-y-2">
                    {courses.map(course => {
                      const activeAssignments = course.school_course_docente_assignments?.filter(
                        (a: any) => a.is_active
                      ) || [];
                      const hasDocente = activeAssignments.length > 0;

                      return (
                        <div
                          key={course.id}
                          className={`p-3 rounded-lg border ${
                            hasDocente
                              ? 'bg-green-50 border-green-200'
                              : 'bg-gray-50 border-gray-200'
                          }`}
                        >
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <span className="font-medium text-gray-900">{course.course_name}</span>
                              {hasDocente && <CheckCircle className="w-4 h-4 text-green-600" />}
                            </div>
                            <button
                              onClick={() => openAssignModal(course)}
                              className="inline-flex items-center px-2 py-1 text-xs font-medium text-brand_blue hover:bg-brand_blue/10 rounded transition-colors"
                            >
                              <UserPlus className="w-3.5 h-3.5 mr-1" />
                              Asignar
                            </button>
                          </div>

                          {/* Show assigned docentes */}
                          {activeAssignments.length > 0 && (
                            <div className="mt-2 space-y-1">
                              {activeAssignments.map((assignment: any) => (
                                <div
                                  key={assignment.id}
                                  className="flex items-center justify-between text-sm bg-white px-2 py-1 rounded"
                                >
                                  <span className="text-gray-700">
                                    {assignment.profiles?.full_name || assignment.docente_id}
                                  </span>
                                  <button
                                    onClick={() => handleUnassignDocente(
                                      course.id,
                                      assignment.docente_id,
                                      assignment.profiles?.full_name || 'docente'
                                    )}
                                    className="text-red-500 hover:text-red-700 p-1"
                                    title="Desasignar"
                                  >
                                    <X className="w-3.5 h-3.5" />
                                  </button>
                                </div>
                              ))}
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

        {/* Empty State */}
        {!context && (
          <div className="bg-white shadow-md rounded-lg p-12 text-center">
            <Building2 className="mx-auto h-16 w-16 text-gray-300 mb-4" />
            <h3 className="text-xl font-semibold text-gray-900 mb-2">
              Configure su escuela
            </h3>
            <p className="text-gray-500 mb-6 max-w-md mx-auto">
              Complete el cuestionario transversal para configurar los datos de su escuela
              y habilitar las evaluaciones de transformación.
            </p>
            <Link
              href={`/school/transversal-context/edit${schoolId ? `?school_id=${schoolId}` : ''}`}
              legacyBehavior
            >
              <a className="inline-flex items-center px-6 py-3 bg-brand_blue text-white rounded-lg font-medium hover:bg-brand_blue/90">
                <Edit2 className="w-5 h-5 mr-2" />
                Completar Cuestionario
              </a>
            </Link>
          </div>
        )}
      </div>

      {/* Docente Assignment Modal */}
      {assignModalOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full">
            <div className="p-4 border-b border-gray-200 flex items-center justify-between">
              <h3 className="text-lg font-semibold text-brand_blue">
                Asignar Docente
              </h3>
              <button
                onClick={() => setAssignModalOpen(false)}
                className="p-1 hover:bg-gray-100 rounded"
              >
                <X className="w-5 h-5 text-gray-500" />
              </button>
            </div>

            <div className="p-4">
              <p className="text-sm text-gray-600 mb-4">
                Asignar docente al curso <strong>{selectedCourse?.course_name}</strong>
              </p>

              {loadingDocentes ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="w-6 h-6 animate-spin text-brand_blue" />
                </div>
              ) : availableDocentes.length === 0 ? (
                <div className="text-center py-8">
                  <Users className="mx-auto h-10 w-10 text-gray-300 mb-2" />
                  <p className="text-sm text-gray-500">
                    No hay docentes disponibles para asignar
                  </p>
                  <p className="text-xs text-gray-400 mt-1">
                    Todos los docentes ya están asignados o no hay docentes en esta escuela
                  </p>
                </div>
              ) : (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Seleccionar Docente
                  </label>
                  <select
                    value={selectedDocente}
                    onChange={(e) => setSelectedDocente(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand_blue"
                  >
                    <option value="">-- Seleccionar --</option>
                    {availableDocentes.map(docente => (
                      <option key={docente.id} value={docente.id}>
                        {docente.full_name || docente.email}
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </div>

            <div className="p-4 border-t border-gray-200 flex justify-end gap-3">
              <button
                onClick={() => setAssignModalOpen(false)}
                className="px-4 py-2 text-sm font-medium text-gray-700 hover:text-gray-900"
              >
                Cancelar
              </button>
              <button
                onClick={handleAssignDocente}
                disabled={!selectedDocente || assigning}
                className="px-4 py-2 bg-brand_blue text-white text-sm font-medium rounded-lg hover:bg-brand_blue/90 disabled:opacity-50 inline-flex items-center"
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
    </MainLayout>
  );
};

export default TransversalContextDashboard;
