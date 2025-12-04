import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import { useSupabaseClient } from '@supabase/auth-helpers-react';
import {
  Zap,
  Building2,
  CheckCircle,
  Clock,
  Archive,
  ChevronDown,
  ChevronRight,
  Eye,
  Users,
  GraduationCap,
  Filter,
  BarChart3,
  Calendar,
} from 'lucide-react';
import { toast } from 'react-hot-toast';

import MainLayout from '@/components/layout/MainLayout';
import { AREA_LABELS, AREA_ICONS, type TransformationArea } from '@/types/transformation';
import { formatGradesDisplay, type ChileanGrade } from '@/types/grades';

interface Assessment {
  id: string;
  area: string;
  status: 'in_progress' | 'completed' | 'archived';
  grades: ChileanGrade[];
  school_id: number;
  school_name: string;
  created_by: string;
  creator_name: string;
  creator_email?: string;
  started_at: string;
  updated_at: string;
  completed_at?: string;
  collaborator_count: number;
  overall_level?: number;
  questions_answered: number;
  total_questions: number;
  progress_percent: number;
}

interface SchoolGroup {
  school_id: number;
  school_name: string;
  assessments: Assessment[];
  stats: {
    total: number;
    completed: number;
    in_progress: number;
    archived: number;
  };
}

interface School {
  id: number;
  name: string;
}

type StatusFilter = 'all' | 'completed' | 'in_progress' | 'archived';

export default function AdminTransformationAssessments() {
  const router = useRouter();
  const supabase = useSupabaseClient();

  const [loading, setLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [schoolGroups, setSchoolGroups] = useState<SchoolGroup[]>([]);
  const [noSchoolAssessments, setNoSchoolAssessments] = useState<Assessment[]>([]);
  const [schools, setSchools] = useState<School[]>([]);
  const [stats, setStats] = useState({
    total: 0,
    completed: 0,
    in_progress: 0,
    archived: 0,
    schools_with_assessments: 0,
  });

  // Filters
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [schoolFilter, setSchoolFilter] = useState<number | null>(null);

  // Expanded schools
  const [expandedSchools, setExpandedSchools] = useState<Set<number>>(new Set());

  useEffect(() => {
    checkAuthAndLoad();
  }, []);

  useEffect(() => {
    if (isAdmin) {
      loadAssessments();
    }
  }, [isAdmin, statusFilter, schoolFilter]);

  const checkAuthAndLoad = async () => {
    const { data: { session } } = await supabase.auth.getSession();

    if (!session) {
      router.push('/login');
      return;
    }

    const { data: userRoles } = await supabase
      .from('user_roles')
      .select('role_type')
      .eq('user_id', session.user.id)
      .eq('is_active', true);

    const hasAdminRole = userRoles?.some(r =>
      ['admin', 'consultor'].includes(r.role_type)
    );

    if (!hasAdminRole) {
      toast.error('No tienes permisos para acceder a esta página');
      router.push('/');
      return;
    }

    setIsAdmin(true);
  };

  const loadAssessments = async () => {
    try {
      setLoading(true);

      let url = '/api/admin/transformation-assessments?';
      if (statusFilter !== 'all') {
        url += `status=${statusFilter}&`;
      }
      if (schoolFilter) {
        url += `schoolId=${schoolFilter}&`;
      }

      const response = await fetch(url);
      const data = await response.json();

      if (response.ok) {
        setSchoolGroups(data.schoolGroups || []);
        setNoSchoolAssessments(data.noSchoolAssessments || []);
        setSchools(data.schools || []);
        setStats(data.stats || {
          total: 0,
          completed: 0,
          in_progress: 0,
          archived: 0,
          schools_with_assessments: 0,
        });

        // Auto-expand schools with assessments
        const schoolsWithAssessments = new Set<number>(
          data.schoolGroups?.map((g: SchoolGroup) => g.school_id) || []
        );
        setExpandedSchools(schoolsWithAssessments);
      } else {
        toast.error(data.error || 'Error al cargar evaluaciones');
      }
    } catch (error) {
      console.error('[AdminAssessments] Error:', error);
      toast.error('Error al cargar evaluaciones');
    } finally {
      setLoading(false);
    }
  };

  const toggleSchool = (schoolId: number) => {
    setExpandedSchools(prev => {
      const next = new Set(prev);
      if (next.has(schoolId)) {
        next.delete(schoolId);
      } else {
        next.add(schoolId);
      }
      return next;
    });
  };

  const getStatusBadge = (status: string) => {
    const badges = {
      in_progress: {
        icon: Clock,
        label: 'En Progreso',
        className: 'bg-yellow-100 text-yellow-700',
      },
      completed: {
        icon: CheckCircle,
        label: 'Completado',
        className: 'bg-yellow-100 text-yellow-700',
      },
      archived: {
        icon: Archive,
        label: 'Archivado',
        className: 'bg-gray-100 text-gray-600',
      },
    };
    const badge = badges[status as keyof typeof badges] || badges.in_progress;
    const Icon = badge.icon;

    return (
      <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium ${badge.className}`}>
        <Icon className="h-3 w-3" />
        {badge.label}
      </span>
    );
  };

  const getAreaInfo = (area: string) => {
    const areaKey = area as TransformationArea;
    return {
      label: AREA_LABELS[areaKey] || area,
      emoji: AREA_ICONS[areaKey] || '📋',
    };
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('es-CL', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });
  };

  const getLevelBadge = (level?: number) => {
    if (!level) return null;

    const levelInfo = {
      1: { label: 'Incipiente', className: 'bg-gray-100 text-gray-700' },
      2: { label: 'En Desarrollo', className: 'bg-yellow-50 text-yellow-600' },
      3: { label: 'Avanzado', className: 'bg-yellow-100 text-yellow-700' },
      4: { label: 'Consolidado', className: 'bg-yellow-200 text-yellow-800' },
    };

    const info = levelInfo[level as keyof typeof levelInfo] || levelInfo[1];

    return (
      <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${info.className}`}>
        Nivel {level}: {info.label}
      </span>
    );
  };

  if (loading && !isAdmin) {
    return (
      <MainLayout currentPage="admin" pageTitle="Evaluaciones de Transformación">
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-yellow-500" />
        </div>
      </MainLayout>
    );
  }

  return (
    <MainLayout currentPage="admin" pageTitle="Evaluaciones de Transformación">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6">
        {/* Stats Cards */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-6">
          <div className="bg-white rounded-lg border border-gray-200 p-4">
            <div className="flex items-center gap-2 text-gray-500 text-sm mb-1">
              <BarChart3 className="h-4 w-4" />
              Total
            </div>
            <div className="text-2xl font-bold text-gray-900">{stats.total}</div>
          </div>
          <div className="bg-white rounded-lg border border-gray-200 p-4">
            <div className="flex items-center gap-2 text-yellow-600 text-sm mb-1">
              <CheckCircle className="h-4 w-4" />
              Completadas
            </div>
            <div className="text-2xl font-bold text-yellow-600">{stats.completed}</div>
          </div>
          <div className="bg-white rounded-lg border border-gray-200 p-4">
            <div className="flex items-center gap-2 text-yellow-500 text-sm mb-1">
              <Clock className="h-4 w-4" />
              En Progreso
            </div>
            <div className="text-2xl font-bold text-yellow-500">{stats.in_progress}</div>
          </div>
          <div className="bg-white rounded-lg border border-gray-200 p-4">
            <div className="flex items-center gap-2 text-gray-500 text-sm mb-1">
              <Archive className="h-4 w-4" />
              Archivadas
            </div>
            <div className="text-2xl font-bold text-gray-500">{stats.archived}</div>
          </div>
          <div className="bg-white rounded-lg border border-gray-200 p-4">
            <div className="flex items-center gap-2 text-yellow-600 text-sm mb-1">
              <Building2 className="h-4 w-4" />
              Escuelas
            </div>
            <div className="text-2xl font-bold text-yellow-600">{stats.schools_with_assessments}</div>
          </div>
        </div>

        {/* Filters */}
        <div className="bg-white rounded-lg border border-gray-200 p-4 mb-6">
          <div className="flex items-center gap-2 mb-3">
            <Filter className="h-4 w-4 text-gray-500" />
            <span className="text-sm font-medium text-gray-700">Filtros</span>
          </div>
          <div className="flex flex-wrap gap-4">
            {/* Status filter */}
            <div>
              <label className="block text-xs text-gray-500 mb-1">Estado</label>
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
                className="text-sm border border-gray-200 rounded-md px-3 py-1.5 focus:ring-2 focus:ring-yellow-500 focus:border-yellow-500"
              >
                <option value="all">Todos</option>
                <option value="completed">Completadas</option>
                <option value="in_progress">En Progreso</option>
                <option value="archived">Archivadas</option>
              </select>
            </div>

            {/* School filter */}
            <div>
              <label className="block text-xs text-gray-500 mb-1">Escuela</label>
              <select
                value={schoolFilter || ''}
                onChange={(e) => setSchoolFilter(e.target.value ? Number(e.target.value) : null)}
                className="text-sm border border-gray-200 rounded-md px-3 py-1.5 focus:ring-2 focus:ring-yellow-500 focus:border-yellow-500 max-w-xs"
              >
                <option value="">Todas las escuelas</option>
                {schools.map(school => (
                  <option key={school.id} value={school.id}>
                    {school.name}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {/* Loading indicator */}
        {loading && (
          <div className="flex items-center justify-center py-8">
            <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-yellow-500" />
          </div>
        )}

        {/* School Groups */}
        {!loading && schoolGroups.length === 0 && noSchoolAssessments.length === 0 && (
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-12 text-center">
            <Zap className="h-16 w-16 text-gray-200 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-gray-900 mb-2">
              No hay evaluaciones
            </h3>
            <p className="text-gray-500">
              {statusFilter !== 'all'
                ? `No hay evaluaciones con estado "${statusFilter === 'completed' ? 'completadas' : statusFilter === 'in_progress' ? 'en progreso' : 'archivadas'}"`
                : 'Aún no hay evaluaciones de transformación registradas'
              }
            </p>
          </div>
        )}

        {!loading && (schoolGroups.length > 0 || noSchoolAssessments.length > 0) && (
          <div className="space-y-4">
            {schoolGroups.map(group => (
              <div
                key={group.school_id}
                className="bg-white rounded-lg border border-gray-200 overflow-hidden"
              >
                {/* School Header */}
                <button
                  onClick={() => toggleSchool(group.school_id)}
                  className="w-full flex items-center justify-between p-4 hover:bg-gray-50 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    {expandedSchools.has(group.school_id) ? (
                      <ChevronDown className="h-5 w-5 text-gray-400" />
                    ) : (
                      <ChevronRight className="h-5 w-5 text-gray-400" />
                    )}
                    <Building2 className="h-5 w-5 text-gray-400" />
                    <span className="font-medium text-gray-900">{group.school_name}</span>
                  </div>
                  <div className="flex items-center gap-4 text-sm">
                    <span className="text-gray-500">
                      {group.stats.total} evaluación{group.stats.total !== 1 ? 'es' : ''}
                    </span>
                    {group.stats.completed > 0 && (
                      <span className="text-yellow-600">
                        {group.stats.completed} completada{group.stats.completed !== 1 ? 's' : ''}
                      </span>
                    )}
                    {group.stats.in_progress > 0 && (
                      <span className="text-yellow-500">
                        {group.stats.in_progress} en progreso
                      </span>
                    )}
                  </div>
                </button>

                {/* Assessments List */}
                {expandedSchools.has(group.school_id) && (
                  <div className="border-t border-gray-200 divide-y divide-gray-100">
                    {group.assessments.map(assessment => (
                      <AssessmentRow
                        key={assessment.id}
                        assessment={assessment}
                        getStatusBadge={getStatusBadge}
                        getAreaInfo={getAreaInfo}
                        getLevelBadge={getLevelBadge}
                        formatDate={formatDate}
                        onView={() => router.push(`/vias-transformacion/${assessment.id}`)}
                      />
                    ))}
                  </div>
                )}
              </div>
            ))}

            {/* Legacy assessments without school */}
            {noSchoolAssessments.length > 0 && (
              <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
                <div className="p-4 bg-gray-50 border-b border-gray-200">
                  <div className="flex items-center gap-2 text-gray-600">
                    <Archive className="h-5 w-5" />
                    <span className="font-medium">Evaluaciones sin escuela asignada (legado)</span>
                    <span className="text-sm text-gray-400">({noSchoolAssessments.length})</span>
                  </div>
                </div>
                <div className="divide-y divide-gray-100">
                  {noSchoolAssessments.map(assessment => (
                    <AssessmentRow
                      key={assessment.id}
                      assessment={assessment}
                      getStatusBadge={getStatusBadge}
                      getAreaInfo={getAreaInfo}
                      getLevelBadge={getLevelBadge}
                      formatDate={formatDate}
                      onView={() => router.push(`/vias-transformacion/${assessment.id}`)}
                    />
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </MainLayout>
  );
}

// Assessment Row Component
function AssessmentRow({
  assessment,
  getStatusBadge,
  getAreaInfo,
  getLevelBadge,
  formatDate,
  onView,
}: {
  assessment: Assessment;
  getStatusBadge: (status: string) => React.ReactNode;
  getAreaInfo: (area: string) => { label: string; emoji: string };
  getLevelBadge: (level?: number) => React.ReactNode;
  formatDate: (date: string) => string;
  onView: () => void;
}) {
  const areaInfo = getAreaInfo(assessment.area);

  return (
    <div className="p-4 hover:bg-gray-50 transition-colors">
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-3 flex-1 min-w-0">
          {/* Area emoji */}
          <div className="text-2xl flex-shrink-0">{areaInfo.emoji}</div>

          <div className="flex-1 min-w-0">
            {/* Title and status */}
            <div className="flex items-center gap-2 mb-1 flex-wrap">
              <h3 className="font-medium text-gray-900">{areaInfo.label}</h3>
              {getStatusBadge(assessment.status)}
              {assessment.status === 'completed' && getLevelBadge(assessment.overall_level)}
            </div>

            {/* Grades */}
            {assessment.grades && assessment.grades.length > 0 && (
              <p className="text-sm text-gray-500 flex items-center gap-1 mb-1">
                <GraduationCap className="h-3 w-3" />
                {formatGradesDisplay(assessment.grades)}
              </p>
            )}

            {/* Progress bar for in-progress assessments */}
            {assessment.status === 'in_progress' && assessment.total_questions > 0 && (
              <div className="mb-2">
                <div className="flex items-center justify-between text-xs text-gray-500 mb-1">
                  <span>Progreso</span>
                  <span>{assessment.progress_percent}% ({assessment.questions_answered}/{assessment.total_questions})</span>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-2">
                  <div
                    className="bg-yellow-500 h-2 rounded-full transition-all"
                    style={{ width: `${assessment.progress_percent}%` }}
                  />
                </div>
              </div>
            )}

            {/* Meta info */}
            <div className="flex flex-wrap items-center gap-3 text-xs text-gray-400">
              {/* Creator */}
              <span className="flex items-center gap-1">
                <Users className="h-3 w-3" />
                {assessment.creator_name}
                {assessment.collaborator_count > 1 && (
                  <span className="text-gray-300">
                    +{assessment.collaborator_count - 1} colaborador{assessment.collaborator_count > 2 ? 'es' : ''}
                  </span>
                )}
              </span>

              {/* Date */}
              <span className="flex items-center gap-1">
                <Calendar className="h-3 w-3" />
                {assessment.completed_at
                  ? `Completada: ${formatDate(assessment.completed_at)}`
                  : `Actualizada: ${formatDate(assessment.updated_at)}`
                }
              </span>

              {/* Questions answered for completed */}
              {assessment.status === 'completed' && assessment.total_questions > 0 && (
                <span className="text-gray-400">
                  {assessment.questions_answered}/{assessment.total_questions} respuestas
                </span>
              )}
            </div>
          </div>
        </div>

        {/* View button */}
        <button
          onClick={onView}
          className="flex items-center gap-1 px-3 py-1.5 text-sm text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-md transition-colors"
        >
          <Eye className="h-4 w-4" />
          Ver
        </button>
      </div>
    </div>
  );
}
