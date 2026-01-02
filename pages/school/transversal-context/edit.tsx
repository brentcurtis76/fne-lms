import { useSupabaseClient } from '@supabase/auth-helpers-react';
import React, { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { toast } from 'react-hot-toast';
import MainLayout from '@/components/layout/MainLayout';
import { ResponsiveFunctionalPageHeader } from '@/components/layout/FunctionalPageHeader';
import { Building2, ArrowLeft, Save, Info } from 'lucide-react';
import type { GradeLevel, PeriodSystem, SaveTransversalContextRequest } from '@/types/assessment-builder';
import { GRADE_LEVEL_LABELS, GRADE_LEVEL_CATEGORIES } from '@/types/assessment-builder';

const TransversalContextEdit: React.FC = () => {
  const router = useRouter();
  const supabase = useSupabaseClient();
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [hasPermission, setHasPermission] = useState<boolean | null>(null);
  const [avatarUrl, setAvatarUrl] = useState<string>('');
  const [schoolId, setSchoolId] = useState<number | null>(null);
  const [schoolName, setSchoolName] = useState<string>('');

  // Form state
  const [formData, setFormData] = useState<{
    total_students: number;
    grade_levels: GradeLevel[];
    courses_per_level: Record<string, number>;
    implementation_year_2026: 1 | 2 | 3 | 4 | 5;
    period_system: PeriodSystem;
    programa_inicia_completed: boolean;
    programa_inicia_hours?: 20 | 40 | 80;
    programa_inicia_year?: number;
  }>({
    total_students: 0,
    grade_levels: [],
    courses_per_level: {},
    implementation_year_2026: 1,
    period_system: 'semestral',
    programa_inicia_completed: false,
  });

  const [errors, setErrors] = useState<Record<string, string>>({});

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
      if (directivoRole?.school_id) {
        effectiveSchoolId = directivoRole.school_id;
      } else if (isAdmin) {
        const querySchoolId = router.query.school_id;
        if (querySchoolId && typeof querySchoolId === 'string') {
          effectiveSchoolId = parseInt(querySchoolId);
        }
      }

      if (effectiveSchoolId) {
        setSchoolId(effectiveSchoolId);

        const { data: school } = await supabase
          .from('schools')
          .select('name')
          .eq('id', effectiveSchoolId)
          .single();

        if (school) {
          setSchoolName(school.name);
        }
      }
    };

    checkAuth();
  }, [supabase, router.query.school_id]);

  // Fetch existing context
  const fetchContext = useCallback(async () => {
    if (!schoolId) {
      setLoading(false);
      return;
    }

    try {
      const response = await fetch(`/api/school/transversal-context?school_id=${schoolId}`);
      if (response.ok) {
        const data = await response.json();
        if (data.context) {
          setFormData({
            total_students: data.context.total_students || 0,
            grade_levels: data.context.grade_levels || [],
            courses_per_level: data.context.courses_per_level || {},
            implementation_year_2026: data.context.implementation_year_2026 || 1,
            period_system: data.context.period_system || 'semestral',
            programa_inicia_completed: data.context.programa_inicia_completed || false,
            programa_inicia_hours: data.context.programa_inicia_hours,
            programa_inicia_year: data.context.programa_inicia_year,
          });
        }
      }
    } catch (error) {
      console.error('Error fetching context:', error);
    } finally {
      setLoading(false);
    }
  }, [schoolId]);

  useEffect(() => {
    if (schoolId && hasPermission) {
      fetchContext();
    }
  }, [schoolId, hasPermission, fetchContext]);

  // Toggle grade level selection
  const toggleGradeLevel = (level: GradeLevel) => {
    setFormData(prev => {
      const isSelected = prev.grade_levels.includes(level);
      let newLevels: GradeLevel[];
      let newCoursesPerLevel = { ...prev.courses_per_level };

      if (isSelected) {
        newLevels = prev.grade_levels.filter(l => l !== level);
        delete newCoursesPerLevel[level];
      } else {
        newLevels = [...prev.grade_levels, level];
        newCoursesPerLevel[level] = 1; // Default to 1 course
      }

      return {
        ...prev,
        grade_levels: newLevels,
        courses_per_level: newCoursesPerLevel,
      };
    });
  };

  // Update courses per level
  const updateCoursesPerLevel = (level: GradeLevel, count: number) => {
    setFormData(prev => ({
      ...prev,
      courses_per_level: {
        ...prev.courses_per_level,
        [level]: Math.max(1, Math.min(10, count)), // Limit 1-10
      },
    }));
  };

  // Validate form
  const validateForm = (): boolean => {
    const newErrors: Record<string, string> = {};

    if (!formData.total_students || formData.total_students < 1) {
      newErrors.total_students = 'Ingrese el número total de estudiantes';
    }

    if (formData.grade_levels.length === 0) {
      newErrors.grade_levels = 'Seleccione al menos un nivel';
    }

    if (!formData.implementation_year_2026) {
      newErrors.implementation_year_2026 = 'Seleccione el año de implementación';
    }

    if (!formData.period_system) {
      newErrors.period_system = 'Seleccione el sistema de períodos';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  // Submit form
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!validateForm() || !schoolId) return;

    setSaving(true);
    try {
      const response = await fetch('/api/school/transversal-context', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          school_id: schoolId,
          ...formData,
        } as SaveTransversalContextRequest),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Error al guardar');
      }

      // Show success message
      toast.success(data.message || 'Contexto guardado exitosamente');

      // Show warning if courses failed to generate
      if (data.warning) {
        toast.error(data.warning, { duration: 6000 });
      } else if (data.coursesGenerated !== undefined) {
        toast.success(`${data.coursesGenerated} cursos generados`, { duration: 3000 });
      }

      router.push(`/school/transversal-context?school_id=${schoolId}`);
    } catch (error: any) {
      console.error('Error saving context:', error);
      toast.error(error.message || 'Error al guardar el contexto');
    } finally {
      setSaving(false);
    }
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    router.push('/login');
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
  if (hasPermission === false || !schoolId) {
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
              No tiene permiso para editar el contexto transversal.
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
        title="Cuestionario Transversal"
        subtitle={schoolName || 'Mi Escuela'}
      />

      <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {/* Back button */}
        <Link
          href={`/school/transversal-context?school_id=${schoolId}`}
          legacyBehavior
        >
          <a className="inline-flex items-center text-sm text-gray-600 hover:text-brand_blue mb-6">
            <ArrowLeft className="w-4 h-4 mr-1" />
            Volver al dashboard
          </a>
        </Link>

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* P1: Total Students */}
          <div className="bg-white shadow-md rounded-lg p-6">
            <h3 className="text-lg font-semibold text-brand_blue mb-2">
              P1. Número total de estudiantes
            </h3>
            <p className="text-sm text-gray-500 mb-4">
              Indique el número total de estudiantes matriculados en su establecimiento.
            </p>
            <input
              type="number"
              value={formData.total_students || ''}
              onChange={(e) => setFormData(prev => ({
                ...prev,
                total_students: parseInt(e.target.value) || 0
              }))}
              min={1}
              className={`w-full max-w-xs px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-brand_blue ${
                errors.total_students ? 'border-red-500' : 'border-gray-300'
              }`}
              placeholder="Ej: 500"
            />
            {errors.total_students && (
              <p className="mt-2 text-sm text-red-500">{errors.total_students}</p>
            )}
          </div>

          {/* P2: Grade Levels */}
          <div className="bg-white shadow-md rounded-lg p-6">
            <h3 className="text-lg font-semibold text-brand_blue mb-2">
              P2. Niveles educativos
            </h3>
            <p className="text-sm text-gray-500 mb-4">
              Seleccione todos los niveles que tiene su establecimiento.
            </p>

            {/* Preescolar */}
            <div className="mb-4">
              <h4 className="text-sm font-medium text-gray-700 mb-2">Preescolar</h4>
              <div className="flex flex-wrap gap-2">
                {GRADE_LEVEL_CATEGORIES.preescolar.map(level => (
                  <button
                    key={level}
                    type="button"
                    onClick={() => toggleGradeLevel(level)}
                    className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                      formData.grade_levels.includes(level)
                        ? 'bg-brand_blue text-white'
                        : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                    }`}
                  >
                    {GRADE_LEVEL_LABELS[level]}
                  </button>
                ))}
              </div>
            </div>

            {/* Básica */}
            <div className="mb-4">
              <h4 className="text-sm font-medium text-gray-700 mb-2">Educación Básica</h4>
              <div className="flex flex-wrap gap-2">
                {GRADE_LEVEL_CATEGORIES.basica.map(level => (
                  <button
                    key={level}
                    type="button"
                    onClick={() => toggleGradeLevel(level)}
                    className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                      formData.grade_levels.includes(level)
                        ? 'bg-brand_blue text-white'
                        : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                    }`}
                  >
                    {GRADE_LEVEL_LABELS[level]}
                  </button>
                ))}
              </div>
            </div>

            {/* Media */}
            <div className="mb-4">
              <h4 className="text-sm font-medium text-gray-700 mb-2">Educación Media</h4>
              <div className="flex flex-wrap gap-2">
                {GRADE_LEVEL_CATEGORIES.media.map(level => (
                  <button
                    key={level}
                    type="button"
                    onClick={() => toggleGradeLevel(level)}
                    className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                      formData.grade_levels.includes(level)
                        ? 'bg-brand_blue text-white'
                        : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                    }`}
                  >
                    {GRADE_LEVEL_LABELS[level]}
                  </button>
                ))}
              </div>
            </div>

            {errors.grade_levels && (
              <p className="mt-2 text-sm text-red-500">{errors.grade_levels}</p>
            )}
          </div>

          {/* P3: Courses per Level */}
          {formData.grade_levels.length > 0 && (
            <div className="bg-white shadow-md rounded-lg p-6">
              <h3 className="text-lg font-semibold text-brand_blue mb-2">
                P3. Cursos por nivel
              </h3>
              <p className="text-sm text-gray-500 mb-4">
                Indique cuántos cursos paralelos tiene en cada nivel seleccionado.
              </p>

              <div className="space-y-3">
                {formData.grade_levels
                  .sort((a, b) => {
                    const order = [...GRADE_LEVEL_CATEGORIES.preescolar, ...GRADE_LEVEL_CATEGORIES.basica, ...GRADE_LEVEL_CATEGORIES.media];
                    return order.indexOf(a) - order.indexOf(b);
                  })
                  .map(level => (
                    <div key={level} className="flex items-center gap-4">
                      <span className="w-32 text-sm font-medium text-gray-700">
                        {GRADE_LEVEL_LABELS[level]}
                      </span>
                      <input
                        type="number"
                        value={formData.courses_per_level[level] || 1}
                        onChange={(e) => updateCoursesPerLevel(level, parseInt(e.target.value) || 1)}
                        min={1}
                        max={10}
                        className="w-20 px-3 py-1.5 border border-gray-300 rounded-lg text-center focus:outline-none focus:ring-2 focus:ring-brand_blue"
                      />
                      <span className="text-sm text-gray-500">
                        {(formData.courses_per_level[level] || 1) === 1 ? 'curso' : 'cursos'}
                      </span>
                    </div>
                  ))}
              </div>
            </div>
          )}

          {/* P5: Implementation Year */}
          <div className="bg-white shadow-md rounded-lg p-6">
            <h3 className="text-lg font-semibold text-brand_blue mb-2">
              P5. Año de implementación para 2026
            </h3>
            <p className="text-sm text-gray-500 mb-4">
              Indique en qué año de transformación estará su escuela en 2026.
            </p>

            <div className="flex flex-wrap gap-3">
              {[1, 2, 3, 4, 5].map(year => (
                <button
                  key={year}
                  type="button"
                  onClick={() => setFormData(prev => ({
                    ...prev,
                    implementation_year_2026: year as 1 | 2 | 3 | 4 | 5
                  }))}
                  className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                    formData.implementation_year_2026 === year
                      ? 'bg-brand_blue text-white'
                      : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  }`}
                >
                  Año {year}
                </button>
              ))}
            </div>

            <div className="mt-4 p-3 bg-blue-50 rounded-lg flex items-start gap-2">
              <Info className="w-4 h-4 text-blue-600 mt-0.5 flex-shrink-0" />
              <p className="text-sm text-blue-700">
                El año de implementación determina el nivel de madurez esperado para las evaluaciones.
                Año 1 = Incipiente, Año 5 = Consolidado.
              </p>
            </div>

            {errors.implementation_year_2026 && (
              <p className="mt-2 text-sm text-red-500">{errors.implementation_year_2026}</p>
            )}
          </div>

          {/* P11: Period System */}
          <div className="bg-white shadow-md rounded-lg p-6">
            <h3 className="text-lg font-semibold text-brand_blue mb-2">
              P11. Sistema de períodos
            </h3>
            <p className="text-sm text-gray-500 mb-4">
              Indique el sistema de períodos académicos que utiliza su establecimiento.
            </p>

            <div className="flex gap-4">
              <button
                type="button"
                onClick={() => setFormData(prev => ({ ...prev, period_system: 'semestral' }))}
                className={`flex-1 px-4 py-3 rounded-lg text-sm font-medium transition-colors ${
                  formData.period_system === 'semestral'
                    ? 'bg-brand_blue text-white'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                Semestral
                <span className="block text-xs opacity-80 mt-1">2 períodos por año</span>
              </button>
              <button
                type="button"
                onClick={() => setFormData(prev => ({ ...prev, period_system: 'trimestral' }))}
                className={`flex-1 px-4 py-3 rounded-lg text-sm font-medium transition-colors ${
                  formData.period_system === 'trimestral'
                    ? 'bg-brand_blue text-white'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                Trimestral
                <span className="block text-xs opacity-80 mt-1">3 períodos por año</span>
              </button>
            </div>

            {errors.period_system && (
              <p className="mt-2 text-sm text-red-500">{errors.period_system}</p>
            )}
          </div>

          {/* Deferred questions notice */}
          <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
            <p className="text-sm text-gray-600">
              <strong>Nota:</strong> Las preguntas P6-P10 (asignaturas por nivel, profesionales,
              generaciones Tractor e Innova, y Programa Inicia) se habilitarán en una próxima
              actualización.
            </p>
          </div>

          {/* Submit */}
          <div className="flex items-center justify-end gap-3 pt-4">
            <Link
              href={`/school/transversal-context?school_id=${schoolId}`}
              legacyBehavior
            >
              <a className="px-4 py-2 text-sm font-medium text-gray-700 hover:text-gray-900">
                Cancelar
              </a>
            </Link>
            <button
              type="submit"
              disabled={saving}
              className="inline-flex items-center px-6 py-2 bg-brand_blue text-white rounded-lg font-medium hover:bg-brand_blue/90 disabled:opacity-50"
            >
              {saving ? (
                <>
                  <span className="animate-spin mr-2">&#9696;</span>
                  Guardando...
                </>
              ) : (
                <>
                  <Save className="w-4 h-4 mr-2" />
                  Guardar
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </MainLayout>
  );
};

export default TransversalContextEdit;
