import { useSupabaseClient } from '@supabase/auth-helpers-react';
import React, { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { toast } from 'react-hot-toast';
import MainLayout from '@/components/layout/MainLayout';
import { ResponsiveFunctionalPageHeader } from '@/components/layout/FunctionalPageHeader';
import {
  BarChart3,
  School,
  Users,
  Target,
  TrendingUp,
  CheckCircle,
  AlertTriangle,
  ChevronRight,
  RefreshCw,
} from 'lucide-react';
import {
  AREA_LABELS,
  MATURITY_LEVELS,
  GRADE_LEVEL_LABELS,
  TransformationArea,
  GradeLevel,
  GenerationType,
} from '@/types/assessment-builder';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  Radar,
  Legend,
  PieChart,
  Pie,
  Cell,
} from 'recharts';

interface AreaResult {
  area: string;
  label: string;
  avgScore: number;
  avgLevel: number;
  levelLabel: string;
  count: number;
}

interface CourseResult {
  courseId: string;
  gradeLevel: GradeLevel;
  gradeLevelLabel: string;
  courseName: string;
  generationType: GenerationType;
  summary: {
    completedAssessments: number;
    avgScore: number;
    avgLevel: number;
    avgLevelLabel: string;
    meetsExpectations: boolean;
  };
  byArea: Record<string, {
    area: string;
    label: string;
    totalScore: number;
    level: number;
    levelLabel: string;
    completedAt: string | null;
  }>;
}

interface SchoolResultsData {
  success: boolean;
  school: {
    id: number;
    name: string;
  };
  transformationYear: number;
  expectedLevel: {
    level: number;
    label: string;
  };
  results: {
    byArea: Record<string, AreaResult>;
    overall: {
      avgScore: number;
      avgLevel: number;
      levelLabel: string;
      totalInstances: number;
      meetsExpectations: boolean;
    };
  };
}

interface CourseResultsData {
  success: boolean;
  transformationYear: number;
  expectedLevel: {
    level: number;
    label: string;
  };
  courses: CourseResult[];
}

const AREA_COLORS: Record<string, string> = {
  personalizacion: '#3b82f6',
  aprendizaje: '#10b981',
  evaluacion: '#f59e0b',
  proposito: '#8b5cf6',
  familias: '#ec4899',
  trabajo_docente: '#06b6d4',
  liderazgo: '#f97316',
};

const DirectivoDashboard: React.FC = () => {
  const router = useRouter();
  const supabase = useSupabaseClient();

  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [avatarUrl, setAvatarUrl] = useState<string>('');
  const [schoolResults, setSchoolResults] = useState<SchoolResultsData | null>(null);
  const [courseResults, setCourseResults] = useState<CourseResultsData | null>(null);
  const [activeTab, setActiveTab] = useState<'overview' | 'courses'>('overview');

  // Check auth and role
  useEffect(() => {
    const checkAuth = async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session?.user) {
        router.push('/login');
        return;
      }

      // Query user_roles table directly (more reliable than user_metadata)
      const { data: userRoles } = await supabase
        .from('user_roles')
        .select('role_type')
        .eq('user_id', session.user.id)
        .eq('is_active', true);

      const roleTypes = (userRoles || []).map((r: any) => r.role_type);
      const hasPermission = roleTypes.includes('equipo_directivo') ||
                           roleTypes.includes('admin') ||
                           roleTypes.includes('consultor');

      if (!hasPermission) {
        toast.error('No tienes permiso para acceder a esta página');
        router.push('/');
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
    };

    checkAuth();
  }, [supabase, router]);

  // Fetch school results
  const fetchSchoolResults = useCallback(async () => {
    if (!user) return;

    try {
      const response = await fetch('/api/directivo/assessments/school-results');
      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Error al cargar resultados');
      }

      const data = await response.json();
      setSchoolResults(data);
    } catch (error: any) {
      console.error('Error fetching school results:', error);
      toast.error(error.message || 'Error al cargar resultados de la escuela');
    }
  }, [user]);

  // Fetch course results
  const fetchCourseResults = useCallback(async () => {
    if (!user) return;

    try {
      const response = await fetch('/api/directivo/assessments/course-results');
      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Error al cargar resultados por curso');
      }

      const data = await response.json();
      setCourseResults(data);
    } catch (error: any) {
      console.error('Error fetching course results:', error);
      // Don't show error toast for this, it's secondary data
    }
  }, [user]);

  // Fetch all data
  const fetchData = useCallback(async () => {
    setLoading(true);
    await Promise.all([fetchSchoolResults(), fetchCourseResults()]);
    setLoading(false);
  }, [fetchSchoolResults, fetchCourseResults]);

  useEffect(() => {
    if (user) {
      fetchData();
    }
  }, [user, fetchData]);

  const handleRefresh = async () => {
    setRefreshing(true);
    await fetchData();
    setRefreshing(false);
    toast.success('Datos actualizados');
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    router.push('/login');
  };

  // Loading state
  if (loading || !user) {
    return (
      <div className="min-h-screen bg-brand_beige flex justify-center items-center">
        <p className="text-xl text-brand_blue">Cargando...</p>
      </div>
    );
  }

  const hasResults = schoolResults?.results?.overall?.totalInstances > 0;
  const areas = schoolResults?.results?.byArea || {};
  const overall = schoolResults?.results?.overall;
  const courses = courseResults?.courses || [];

  // Prepare chart data
  const areaChartData = Object.values(areas).map((area) => ({
    name: area.label,
    score: Math.round(area.avgScore),
    count: area.count,
    fullArea: area.area,
  }));

  const radarData = Object.values(areas).map((area) => ({
    subject: area.label,
    score: area.avgScore,
    fullMark: 100,
  }));

  // Pie chart for expectations met
  const coursesMetExpectations = courses.filter((c) => c.summary.meetsExpectations).length;
  const coursesNotMet = courses.length - coursesMetExpectations;
  const pieData = [
    { name: 'Cumplen', value: coursesMetExpectations },
    { name: 'En desarrollo', value: coursesNotMet },
  ];
  const PIE_COLORS = ['#10b981', '#f59e0b'];

  return (
    <MainLayout
      user={user}
      currentPage="assessments-dashboard"
      pageTitle=""
      breadcrumbs={[]}
      isAdmin={false}
      onLogout={handleLogout}
      avatarUrl={avatarUrl}
    >
      <ResponsiveFunctionalPageHeader
        icon={<BarChart3 />}
        title="Panel de Resultados"
        subtitle={schoolResults?.school?.name || 'Escuela'}
      />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {/* Header with refresh */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <p className="text-gray-600">
              Año de transformación: <strong>{schoolResults?.transformationYear || 1}</strong>
              {schoolResults?.expectedLevel && (
                <span className="ml-2 text-sm">
                  (Nivel esperado: {schoolResults.expectedLevel.label})
                </span>
              )}
            </p>
          </div>
          <button
            onClick={handleRefresh}
            disabled={refreshing}
            className="inline-flex items-center px-3 py-1.5 text-sm border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 mr-1 ${refreshing ? 'animate-spin' : ''}`} />
            Actualizar
          </button>
        </div>

        {!hasResults ? (
          <div className="bg-white shadow-md rounded-lg p-8 text-center">
            <School className="w-12 h-12 text-gray-300 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-gray-700 mb-2">
              No hay evaluaciones completadas
            </h3>
            <p className="text-gray-500">
              Cuando los docentes completen sus evaluaciones, los resultados aparecerán aquí.
            </p>
          </div>
        ) : (
          <>
            {/* Tabs */}
            <div className="border-b border-gray-200 mb-6">
              <nav className="flex space-x-8">
                <button
                  onClick={() => setActiveTab('overview')}
                  className={`py-2 px-1 border-b-2 font-medium text-sm ${
                    activeTab === 'overview'
                      ? 'border-brand_blue text-brand_blue'
                      : 'border-transparent text-gray-500 hover:text-gray-700'
                  }`}
                >
                  Vista General
                </button>
                <button
                  onClick={() => setActiveTab('courses')}
                  className={`py-2 px-1 border-b-2 font-medium text-sm ${
                    activeTab === 'courses'
                      ? 'border-brand_blue text-brand_blue'
                      : 'border-transparent text-gray-500 hover:text-gray-700'
                  }`}
                >
                  Por Curso
                </button>
              </nav>
            </div>

            {activeTab === 'overview' && (
              <>
                {/* Summary cards */}
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
                  {/* Overall score */}
                  <div className="bg-white shadow-md rounded-lg p-5">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm text-gray-500">Promedio General</span>
                      <Target className="w-5 h-5 text-brand_blue" />
                    </div>
                    <div className="text-3xl font-bold text-brand_blue">
                      {Math.round(overall?.avgScore || 0)}%
                    </div>
                    <div
                      className={`text-sm mt-1 ${
                        overall?.meetsExpectations ? 'text-green-600' : 'text-yellow-600'
                      }`}
                    >
                      {overall?.levelLabel || 'Por Comenzar'}
                    </div>
                  </div>

                  {/* Total instances */}
                  <div className="bg-white shadow-md rounded-lg p-5">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm text-gray-500">Evaluaciones</span>
                      <Users className="w-5 h-5 text-gray-500" />
                    </div>
                    <div className="text-3xl font-bold text-gray-800">
                      {overall?.totalInstances || 0}
                    </div>
                    <div className="text-sm text-gray-500">completadas</div>
                  </div>

                  {/* Areas covered */}
                  <div className="bg-white shadow-md rounded-lg p-5">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm text-gray-500">Áreas</span>
                      <BarChart3 className="w-5 h-5 text-gray-500" />
                    </div>
                    <div className="text-3xl font-bold text-gray-800">
                      {Object.keys(areas).length}
                    </div>
                    <div className="text-sm text-gray-500">evaluadas</div>
                  </div>

                  {/* Courses meeting expectations */}
                  <div className="bg-white shadow-md rounded-lg p-5">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm text-gray-500">Cumplen Expectativa</span>
                      <CheckCircle className="w-5 h-5 text-green-500" />
                    </div>
                    <div className="text-3xl font-bold text-gray-800">
                      {coursesMetExpectations}/{courses.length}
                    </div>
                    <div className="text-sm text-gray-500">cursos</div>
                  </div>
                </div>

                {/* Charts */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
                  {/* Bar chart by area */}
                  <div className="bg-white shadow-md rounded-lg p-6">
                    <h3 className="text-lg font-semibold text-gray-800 mb-4">
                      Promedio por Vía de Transformación
                    </h3>
                    <div className="h-64">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={areaChartData}>
                          <CartesianGrid strokeDasharray="3 3" />
                          <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                          <YAxis domain={[0, 100]} />
                          <Tooltip
                            formatter={(value: number, name: string, props: any) => [
                              `${value}%`,
                              `Puntuación (${props.payload.count} evaluaciones)`,
                            ]}
                          />
                          <Bar dataKey="score" radius={[4, 4, 0, 0]}>
                            {areaChartData.map((entry, index) => (
                              <Cell
                                key={`cell-${index}`}
                                fill={AREA_COLORS[entry.fullArea] || '#6b7280'}
                              />
                            ))}
                          </Bar>
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  </div>

                  {/* Radar chart */}
                  {radarData.length >= 3 && (
                    <div className="bg-white shadow-md rounded-lg p-6">
                      <h3 className="text-lg font-semibold text-gray-800 mb-4">
                        Perfil de Transformación
                      </h3>
                      <div className="h-64">
                        <ResponsiveContainer width="100%" height="100%">
                          <RadarChart data={radarData}>
                            <PolarGrid />
                            <PolarAngleAxis dataKey="subject" tick={{ fontSize: 11 }} />
                            <PolarRadiusAxis angle={30} domain={[0, 100]} />
                            <Radar
                              name="Promedio"
                              dataKey="score"
                              stroke="#2563eb"
                              fill="#2563eb"
                              fillOpacity={0.3}
                            />
                            <Legend />
                          </RadarChart>
                        </ResponsiveContainer>
                      </div>
                    </div>
                  )}
                </div>

                {/* Area detail cards */}
                <h3 className="text-lg font-semibold text-gray-800 mb-4">Detalle por Área</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {Object.values(areas).map((area) => {
                    const levelInfo = MATURITY_LEVELS.find(
                      (l) => l.value === Math.round(area.avgLevel)
                    ) || MATURITY_LEVELS[0];

                    return (
                      <div
                        key={area.area}
                        className="bg-white shadow-md rounded-lg p-5 border-l-4"
                        style={{ borderLeftColor: AREA_COLORS[area.area] }}
                      >
                        <div className="flex items-center justify-between mb-3">
                          <h4 className="font-semibold text-gray-800">{area.label}</h4>
                          <span className="text-sm text-gray-500">{area.count} eval.</span>
                        </div>
                        <div className="text-2xl font-bold text-brand_blue mb-2">
                          {Math.round(area.avgScore)}%
                        </div>
                        <div
                          className={`inline-block px-2 py-0.5 rounded text-sm ${levelInfo.bgColor} ${levelInfo.textColor}`}
                        >
                          {levelInfo.label}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </>
            )}

            {activeTab === 'courses' && (
              <>
                {/* Pie chart for course expectations */}
                {courses.length > 0 && (
                  <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
                    <div className="bg-white shadow-md rounded-lg p-6">
                      <h3 className="text-lg font-semibold text-gray-800 mb-4">
                        Cumplimiento de Expectativas
                      </h3>
                      <div className="h-48">
                        <ResponsiveContainer width="100%" height="100%">
                          <PieChart>
                            <Pie
                              data={pieData}
                              cx="50%"
                              cy="50%"
                              innerRadius={40}
                              outerRadius={70}
                              paddingAngle={5}
                              dataKey="value"
                              label={({ name, value }) => `${name}: ${value}`}
                            >
                              {pieData.map((entry, index) => (
                                <Cell key={`cell-${index}`} fill={PIE_COLORS[index]} />
                              ))}
                            </Pie>
                            <Tooltip />
                          </PieChart>
                        </ResponsiveContainer>
                      </div>
                    </div>

                    <div className="lg:col-span-2 bg-white shadow-md rounded-lg p-6">
                      <h3 className="text-lg font-semibold text-gray-800 mb-4">
                        Resumen por Curso
                      </h3>
                      <div className="space-y-3 max-h-64 overflow-y-auto">
                        {courses.map((course) => (
                          <div
                            key={course.courseId}
                            className="flex items-center justify-between p-3 bg-gray-50 rounded-lg"
                          >
                            <div className="flex items-center gap-2">
                              <span className="font-medium">{course.courseName}</span>
                              <span className="text-sm text-gray-500">
                                ({course.gradeLevelLabel})
                              </span>
                              <span
                                className={`inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium ${
                                  course.generationType === 'GT'
                                    ? 'bg-green-100 text-green-700'
                                    : 'bg-blue-100 text-blue-700'
                                }`}
                                title={course.generationType === 'GT' ? 'Generación Tractor' : 'Generación Innova'}
                              >
                                {course.generationType}
                              </span>
                            </div>
                            <div className="flex items-center gap-3">
                              <span className="text-lg font-bold text-brand_blue">
                                {Math.round(course.summary.avgScore)}%
                              </span>
                              {course.summary.meetsExpectations ? (
                                <CheckCircle className="w-5 h-5 text-green-500" />
                              ) : (
                                <AlertTriangle className="w-5 h-5 text-yellow-500" />
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                )}

                {/* Course detail cards */}
                <h3 className="text-lg font-semibold text-gray-800 mb-4">Detalle por Curso</h3>
                <div className="space-y-4">
                  {courses.map((course) => {
                    const levelInfo = MATURITY_LEVELS.find(
                      (l) => l.value === Math.round(course.summary.avgLevel)
                    ) || MATURITY_LEVELS[0];

                    return (
                      <div
                        key={course.courseId}
                        className="bg-white shadow-md rounded-lg p-5"
                      >
                        <div className="flex items-center justify-between mb-4">
                          <div>
                            <div className="flex items-center gap-2">
                              <h4 className="text-lg font-semibold text-gray-800">
                                {course.courseName}
                              </h4>
                              <span
                                className={`inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium ${
                                  course.generationType === 'GT'
                                    ? 'bg-green-100 text-green-700'
                                    : 'bg-blue-100 text-blue-700'
                                }`}
                                title={course.generationType === 'GT' ? 'Generación Tractor' : 'Generación Innova'}
                              >
                                {course.generationType}
                              </span>
                            </div>
                            <p className="text-sm text-gray-500">{course.gradeLevelLabel}</p>
                          </div>
                          <div className="text-right">
                            <div className="text-2xl font-bold text-brand_blue">
                              {Math.round(course.summary.avgScore)}%
                            </div>
                            <div
                              className={`inline-block px-2 py-0.5 rounded text-sm ${levelInfo.bgColor} ${levelInfo.textColor}`}
                            >
                              {levelInfo.label}
                            </div>
                          </div>
                        </div>

                        {/* Area breakdown */}
                        {Object.keys(course.byArea).length > 0 && (
                          <div className="border-t border-gray-200 pt-4">
                            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
                              {Object.values(course.byArea).map((areaResult) => (
                                <div
                                  key={areaResult.area}
                                  className="p-3 bg-gray-50 rounded-lg"
                                  style={{ borderLeft: `3px solid ${AREA_COLORS[areaResult.area]}` }}
                                >
                                  <div className="text-xs text-gray-500 mb-1">{areaResult.label}</div>
                                  <div className="font-bold text-brand_blue">
                                    {Math.round(areaResult.totalScore)}%
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                        {Object.keys(course.byArea).length === 0 && (
                          <p className="text-sm text-gray-500 italic">
                            Sin evaluaciones completadas
                          </p>
                        )}
                      </div>
                    );
                  })}
                </div>

                {courses.length === 0 && (
                  <div className="bg-white shadow-md rounded-lg p-8 text-center">
                    <Users className="w-12 h-12 text-gray-300 mx-auto mb-4" />
                    <h3 className="text-lg font-medium text-gray-700 mb-2">
                      No hay cursos configurados
                    </h3>
                    <p className="text-gray-500">
                      Configure los cursos en el cuestionario transversal para ver resultados por curso.
                    </p>
                  </div>
                )}
              </>
            )}
          </>
        )}
      </div>
    </MainLayout>
  );
};

export default DirectivoDashboard;
