import { useSupabaseClient } from '@supabase/auth-helpers-react';
import React, { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { toast } from 'react-hot-toast';
import MainLayout from '@/components/layout/MainLayout';
import { ResponsiveFunctionalPageHeader } from '@/components/layout/FunctionalPageHeader';
import {
  ArrowLeft,
  Lock,
  Save,
  AlertTriangle,
  CheckCircle,
  Loader2,
} from 'lucide-react';
import type { Grade, MigrationPlanEntry, GenerationType } from '@/types/assessment-builder';

const MigrationPlanPage: React.FC = () => {
  const router = useRouter();
  const supabase = useSupabaseClient();
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [hasPermission, setHasPermission] = useState<boolean | null>(null);
  const [avatarUrl, setAvatarUrl] = useState<string>('');
  const [schoolId, setSchoolId] = useState<number | null>(null);
  const [schoolName, setSchoolName] = useState<string>('');
  const [isAdmin, setIsAdmin] = useState(false);

  // Data state
  const [grades, setGrades] = useState<Grade[]>([]);
  const [entries, setEntries] = useState<MigrationPlanEntry[]>([]);
  const [transformationYear, setTransformationYear] = useState<number | null>(null);

  // Local plan state (grid: year -> grade -> generation_type)
  const [planGrid, setPlanGrid] = useState<Record<number, Record<number, GenerationType>>>({});
  const [hasChanges, setHasChanges] = useState(false);

  // School selector for admins
  const [schools, setSchools] = useState<any[]>([]);
  const [loadingSchools, setLoadingSchools] = useState(false);

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

      const adminRole = roles.some(r => ['admin', 'consultor'].includes(r.role_type));
      const directivoRole = roles.find(r => r.role_type === 'equipo_directivo');

      if (!adminRole && !directivoRole) {
        setHasPermission(false);
        setLoading(false);
        return;
      }

      setHasPermission(true);
      setIsAdmin(adminRole);

      // Get school_id
      let effectiveSchoolId: number | null = null;
      if (directivoRole?.school_id) {
        effectiveSchoolId = directivoRole.school_id;
      } else if (adminRole) {
        // For admin, check query parameter or show school selector
        const querySchoolId = router.query.school_id;
        if (querySchoolId && typeof querySchoolId === 'string') {
          effectiveSchoolId = parseInt(querySchoolId);
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
      } else if (adminRole) {
        // No school selected (admin case without query parameter)
        // Fetch schools via API
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
          setLoading(false);
        }
      } else {
        setLoading(false);
      }
    };

    checkAuth();
  }, [supabase, router]);

  // Fetch migration plan data
  const fetchMigrationPlan = useCallback(async () => {
    if (!schoolId) return;

    setLoading(true);
    try {
      const response = await fetch(`/api/school/migration-plan?school_id=${schoolId}`);
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Error al cargar el plan de migración');
      }

      setGrades(data.grades || []);
      setEntries(data.entries || []);
      setTransformationYear(data.transformation_year);

      // Initialize plan grid from entries or defaults
      initializePlanGrid(data.grades || [], data.entries || []);
    } catch (error: any) {
      console.error('Error fetching migration plan:', error);
      toast.error(error.message || 'Error al cargar el plan de migración');
    } finally {
      setLoading(false);
    }
  }, [schoolId]);

  useEffect(() => {
    if (schoolId) {
      fetchMigrationPlan();
    }
  }, [schoolId, fetchMigrationPlan]);

  // Initialize plan grid from existing entries or defaults
  const initializePlanGrid = (gradeList: Grade[], entryList: MigrationPlanEntry[]) => {
    const grid: Record<number, Record<number, GenerationType>> = {};

    // Initialize all years and grades
    for (let year = 1; year <= 5; year++) {
      grid[year] = {};
      for (const grade of gradeList) {
        // Default: GT for always-GT grades, GI for others
        grid[year][grade.id] = grade.is_always_gt ? 'GT' : 'GI';
      }
    }

    // Overwrite with existing entries
    for (const entry of entryList) {
      if (grid[entry.year_number]) {
        grid[entry.year_number][entry.grade_id] = entry.generation_type;
      }
    }

    setPlanGrid(grid);
    setHasChanges(false);
  };

  // Handle cell toggle
  const toggleCell = (yearNumber: number, gradeId: number, isLocked: boolean) => {
    if (isLocked) return; // Cannot toggle locked grades

    setPlanGrid(prev => {
      const newGrid = { ...prev };
      const currentValue = newGrid[yearNumber]?.[gradeId] || 'GI';
      newGrid[yearNumber] = {
        ...newGrid[yearNumber],
        [gradeId]: currentValue === 'GT' ? 'GI' : 'GT',
      };
      return newGrid;
    });
    setHasChanges(true);
  };

  // Save migration plan
  const handleSave = async () => {
    if (!schoolId) return;

    setSaving(true);
    try {
      // Convert grid to entries array
      const entriesToSave: Array<{ year_number: number; grade_id: number; generation_type: GenerationType }> = [];

      for (let year = 1; year <= 5; year++) {
        for (const grade of grades) {
          const genType = planGrid[year]?.[grade.id] || (grade.is_always_gt ? 'GT' : 'GI');
          entriesToSave.push({
            year_number: year as 1 | 2 | 3 | 4 | 5,
            grade_id: grade.id,
            generation_type: genType,
          });
        }
      }

      const response = await fetch('/api/school/migration-plan', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          school_id: schoolId,
          entries: entriesToSave,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Error al guardar el plan de migración');
      }

      setEntries(data.entries || []);
      setHasChanges(false);

      if (data.warning) {
        toast(data.warning, { icon: '⚠️', duration: 5000 });
      } else {
        toast.success('Plan de migración guardado exitosamente');
      }
    } catch (error: any) {
      console.error('Error saving migration plan:', error);
      toast.error(error.message || 'Error al guardar el plan de migración');
    } finally {
      setSaving(false);
    }
  };

  // Check if Year 5 has any GI grades
  const hasYear5GI = () => {
    for (const grade of grades) {
      if (!grade.is_always_gt && planGrid[5]?.[grade.id] === 'GI') {
        return true;
      }
    }
    return false;
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    localStorage.removeItem('rememberMe');
    sessionStorage.removeItem('sessionOnly');
    router.push('/login');
  };

  // Handle school selection for admins
  const handleSchoolSelect = (selectedSchoolId: number) => {
    router.push(`/school/migration-plan?school_id=${selectedSchoolId}`);
  };

  // Loading state
  if (loading && hasPermission !== false) {
    return (
      <div className="min-h-screen bg-brand_beige flex justify-center items-center">
        <div className="flex items-center gap-2">
          <Loader2 className="h-6 w-6 animate-spin text-brand_blue" />
          <p className="text-xl text-brand_blue">Cargando...</p>
        </div>
      </div>
    );
  }

  // Access denied
  if (hasPermission === false) {
    return (
      <MainLayout
        user={user}
        currentPage="migration-plan"
        pageTitle=""
        breadcrumbs={[]}
        isAdmin={false}
        onLogout={handleLogout}
        avatarUrl={avatarUrl}
      >
        <div className="flex flex-col justify-center items-center min-h-[50vh]">
          <div className="text-center p-8">
            <h1 className="text-2xl font-semibold text-brand_blue mb-4">Acceso Denegado</h1>
            <p className="text-gray-700 mb-6">No tienes permiso para acceder al Plan de Migración.</p>
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

  // School selector for admins without school_id
  if (isAdmin && !schoolId && schools.length > 0) {
    return (
      <MainLayout
        user={user}
        currentPage="migration-plan"
        pageTitle=""
        breadcrumbs={[]}
        isAdmin={true}
        onLogout={handleLogout}
        avatarUrl={avatarUrl}
      >
        <ResponsiveFunctionalPageHeader
          icon={<CheckCircle />}
          title="Plan de Migración"
          subtitle="Selecciona una escuela"
        />

        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="bg-white shadow-md rounded-lg p-6">
            <h2 className="text-lg font-semibold text-gray-800 mb-4">Selecciona una Escuela</h2>
            <div className="grid gap-3">
              {schools.map((school) => (
                <button
                  key={school.id}
                  onClick={() => handleSchoolSelect(school.id)}
                  className="w-full text-left px-4 py-3 border border-gray-200 rounded-lg hover:bg-gray-50 hover:border-brand_blue transition-colors"
                >
                  <span className="font-medium text-gray-800">{school.name}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      </MainLayout>
    );
  }

  // No school and no selector
  if (!schoolId) {
    return (
      <MainLayout
        user={user}
        currentPage="migration-plan"
        pageTitle=""
        breadcrumbs={[]}
        isAdmin={isAdmin}
        onLogout={handleLogout}
        avatarUrl={avatarUrl}
      >
        <div className="flex flex-col justify-center items-center min-h-[50vh]">
          <div className="text-center p-8">
            <h1 className="text-2xl font-semibold text-brand_blue mb-4">Sin Escuela Asignada</h1>
            <p className="text-gray-700 mb-6">No se encontró una escuela asociada a tu cuenta.</p>
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
      currentPage="migration-plan"
      pageTitle=""
      breadcrumbs={[]}
      isAdmin={isAdmin}
      onLogout={handleLogout}
      avatarUrl={avatarUrl}
    >
      <ResponsiveFunctionalPageHeader
        icon={<CheckCircle />}
        title="Plan de Migración"
        subtitle={schoolName || 'Definir generaciones por año'}
      />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {/* Back button */}
        <Link href="/school/transversal-context" legacyBehavior>
          <a className="inline-flex items-center text-sm text-gray-600 hover:text-brand_blue mb-6">
            <ArrowLeft className="w-4 h-4 mr-1" />
            Volver al Contexto Transversal
          </a>
        </Link>

        {/* Info Card */}
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
          <div className="flex items-start gap-3">
            <AlertTriangle className="h-5 w-5 text-blue-600 flex-shrink-0 mt-0.5" />
            <div>
              <h3 className="text-sm font-medium text-blue-800">Planificación de Generaciones</h3>
              <p className="text-sm text-blue-700 mt-1">
                Define qué niveles serán <strong>Generación Tractor (GT)</strong> y cuáles <strong>Generación Innova (GI)</strong> para cada año de transformación.
                Los niveles de Medio Menor a Segundo Básico son siempre GT y no pueden modificarse.
              </p>
              {transformationYear && (
                <p className="text-sm text-blue-700 mt-2">
                  <strong>Año actual de transformación:</strong> Año {transformationYear}
                </p>
              )}
            </div>
          </div>
        </div>

        {/* Year 5 Warning */}
        {hasYear5GI() && (
          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mb-6">
            <div className="flex items-start gap-3">
              <AlertTriangle className="h-5 w-5 text-yellow-600 flex-shrink-0 mt-0.5" />
              <div>
                <h3 className="text-sm font-medium text-yellow-800">Advertencia</h3>
                <p className="text-sm text-yellow-700 mt-1">
                  El Año 5 tiene niveles marcados como GI. Se recomienda que todos los niveles sean GT en el Año 5.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Migration Plan Grid */}
        <div className="bg-white shadow-md rounded-lg overflow-hidden">
          <div className="p-4 border-b border-gray-200 flex items-center justify-between">
            <h2 className="text-lg font-semibold text-gray-800">Matriz de Migración</h2>
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2 text-sm">
                <span className="inline-flex items-center px-2 py-1 rounded bg-green-100 text-green-800 font-medium">GT</span>
                <span className="text-gray-600">Generación Tractor</span>
              </div>
              <div className="flex items-center gap-2 text-sm">
                <span className="inline-flex items-center px-2 py-1 rounded bg-blue-100 text-blue-800 font-medium border border-blue-300">GI</span>
                <span className="text-gray-600">Generación Innova</span>
              </div>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="bg-gray-50">
                  <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700 border-b sticky left-0 bg-gray-50 z-10">
                    Nivel
                  </th>
                  {[1, 2, 3, 4, 5].map((year) => (
                    <th
                      key={year}
                      className={`px-4 py-3 text-center text-sm font-semibold border-b min-w-[100px] ${
                        year === transformationYear
                          ? 'bg-brand_blue text-white'
                          : 'text-gray-700'
                      }`}
                    >
                      Año {year}
                      {year === transformationYear && (
                        <span className="block text-xs font-normal mt-0.5">(Actual)</span>
                      )}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {grades.map((grade, index) => (
                  <tr
                    key={grade.id}
                    className={index % 2 === 0 ? 'bg-white' : 'bg-gray-50'}
                  >
                    <td className="px-4 py-3 text-sm font-medium text-gray-800 border-b sticky left-0 bg-inherit z-10">
                      <div className="flex items-center gap-2">
                        {grade.name}
                        {grade.is_always_gt && (
                          <span title="Siempre GT">
                            <Lock className="h-3.5 w-3.5 text-gray-400" />
                          </span>
                        )}
                      </div>
                    </td>
                    {[1, 2, 3, 4, 5].map((year) => {
                      const isLocked = grade.is_always_gt;
                      const genType = planGrid[year]?.[grade.id] || (isLocked ? 'GT' : 'GI');
                      const isGT = genType === 'GT';
                      const isCurrentYear = year === transformationYear;

                      return (
                        <td
                          key={`${grade.id}-${year}`}
                          className={`px-4 py-3 text-center border-b ${
                            isCurrentYear ? 'bg-brand_blue/5' : ''
                          }`}
                        >
                          <button
                            onClick={() => toggleCell(year, grade.id, isLocked)}
                            disabled={isLocked}
                            className={`
                              inline-flex items-center justify-center w-12 h-8 rounded font-medium text-sm transition-all
                              ${isLocked ? 'cursor-not-allowed opacity-60' : 'cursor-pointer hover:scale-105'}
                              ${isGT
                                ? 'bg-green-100 text-green-800 border border-green-300'
                                : 'bg-blue-50 text-blue-800 border-2 border-dashed border-blue-300'
                              }
                            `}
                            title={isLocked ? 'Este nivel es siempre GT' : `Clic para cambiar a ${isGT ? 'GI' : 'GT'}`}
                          >
                            {genType}
                          </button>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Actions */}
          <div className="p-4 border-t border-gray-200 flex items-center justify-between bg-gray-50">
            <div className="text-sm text-gray-600">
              {hasChanges ? (
                <span className="text-amber-600 font-medium">Tienes cambios sin guardar</span>
              ) : (
                <span className="text-green-600">Todos los cambios guardados</span>
              )}
            </div>
            <button
              onClick={handleSave}
              disabled={saving || !hasChanges}
              className={`
                inline-flex items-center px-4 py-2 rounded-lg font-medium text-sm transition-colors
                ${hasChanges
                  ? 'bg-brand_blue text-white hover:bg-brand_blue/90'
                  : 'bg-gray-200 text-gray-500 cursor-not-allowed'
                }
              `}
            >
              {saving ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Guardando...
                </>
              ) : (
                <>
                  <Save className="w-4 h-4 mr-2" />
                  Guardar Plan
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </MainLayout>
  );
};

export default MigrationPlanPage;
