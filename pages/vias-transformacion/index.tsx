import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import { useSupabaseClient } from '@supabase/auth-helpers-react';
import {
  Zap,
  Plus,
  Users,
  Calendar,
  CheckCircle,
  Clock,
  Archive,
  ChevronRight,
  Building2,
  GraduationCap,
  AlertCircle,
} from 'lucide-react';
import { toast } from 'react-hot-toast';

import MainLayout from '@/components/layout/MainLayout';
import { useAuth } from '@/hooks/useAuth';
import { AREA_LABELS, AREA_ICONS, type TransformationArea } from '@/types/transformation';
import { formatGradesDisplay, type ChileanGrade } from '@/types/grades';
import AssessmentSetupModal from '@/components/transformation/AssessmentSetupModal';

interface Collaborator {
  id: string;
  role: string;
  can_edit: boolean;
  full_name: string;
  avatar_url?: string;
}

interface Assessment {
  id: string;
  area: string;
  status: 'in_progress' | 'completed' | 'archived';
  grades: ChileanGrade[];
  school_id: number;
  school_name: string | null;
  created_by: string;
  creator_name: string;
  creator_avatar?: string;
  started_at: string;
  updated_at: string;
  completed_at?: string;
  collaborators: Collaborator[];
  is_user_collaborator: boolean;
  is_creator: boolean;
  can_edit: boolean;
}

export default function ViasTransformacionPage() {
  const router = useRouter();
  const supabase = useSupabaseClient();
  const { user } = useAuth();

  const [assessments, setAssessments] = useState<Assessment[]>([]);
  const [userSchoolIds, setUserSchoolIds] = useState<number[]>([]);
  const [loading, setLoading] = useState(true);
  const [showSetupModal, setShowSetupModal] = useState(false);
  const [selectedSchool, setSelectedSchool] = useState<{ id: number; name: string } | null>(null);
  const [schools, setSchools] = useState<{ id: number; name: string }[]>([]);

  useEffect(() => {
    if (user?.id) {
      loadAssessments();
      loadUserSchools();
    }
  }, [user?.id]);

  const loadAssessments = async () => {
    try {
      setLoading(true);
      const response = await fetch('/api/vias-transformacion');
      const data = await response.json();

      if (response.ok) {
        setAssessments(data.assessments || []);
        setUserSchoolIds(data.userSchoolIds || []);
      } else {
        toast.error(data.error || 'Error al cargar evaluaciones');
      }
    } catch (error) {
      console.error('[ViasTransformacion] Error loading assessments:', error);
      toast.error('Error al cargar evaluaciones');
    } finally {
      setLoading(false);
    }
  };

  const loadUserSchools = async () => {
    if (!user?.id) return;

    try {
      const { data, error } = await supabase
        .from('user_roles')
        .select(`
          school_id,
          schools:school_id (
            id,
            name
          )
        `)
        .eq('user_id', user.id)
        .eq('is_active', true)
        .not('school_id', 'is', null);

      if (error) throw error;

      // Deduplicate schools
      const schoolMap = new Map<number, { id: number; name: string }>();
      data?.forEach(role => {
        const school = role.schools as any;
        if (school?.id && !schoolMap.has(school.id)) {
          schoolMap.set(school.id, { id: school.id, name: school.name });
        }
      });

      setSchools(Array.from(schoolMap.values()));
    } catch (error) {
      console.error('[ViasTransformacion] Error loading schools:', error);
    }
  };

  const handleNewAssessment = (school: { id: number; name: string }) => {
    setSelectedSchool(school);
    setShowSetupModal(true);
  };

  const handleAssessmentCreated = (assessmentId: string) => {
    setShowSetupModal(false);
    router.push(`/vias-transformacion/${assessmentId}`);
  };

  const getStatusBadge = (status: string) => {
    const badges = {
      in_progress: {
        icon: Clock,
        label: 'En Progreso',
        className: 'bg-blue-100 text-blue-700',
      },
      completed: {
        icon: CheckCircle,
        label: 'Completado',
        className: 'bg-green-100 text-green-700',
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

  // Separate assessments into "mine" and "others"
  const myAssessments = assessments.filter(a => a.is_creator || a.is_user_collaborator);
  const otherAssessments = assessments.filter(a => !a.is_creator && !a.is_user_collaborator);

  if (loading) {
    return (
      <MainLayout currentPage="vias-transformacion" pageTitle="Vías de Transformación">
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-yellow-500" />
        </div>
      </MainLayout>
    );
  }

  return (
    <MainLayout currentPage="vias-transformacion" pageTitle="Vías de Transformación">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-yellow-100 rounded-lg">
              <Zap className="h-6 w-6 text-yellow-600" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Vías de Transformación</h1>
              <p className="text-sm text-gray-500">
                Evaluaciones de transformación escolar
              </p>
            </div>
          </div>

          {/* New Assessment Button */}
          {schools.length > 0 && (
            <div className="relative">
              {schools.length === 1 ? (
                <button
                  onClick={() => handleNewAssessment(schools[0])}
                  className="flex items-center gap-2 px-4 py-2 bg-yellow-500 text-white rounded-lg hover:bg-yellow-600 font-medium"
                >
                  <Plus className="h-5 w-5" />
                  Nueva Evaluación
                </button>
              ) : (
                <div className="relative group">
                  <button className="flex items-center gap-2 px-4 py-2 bg-yellow-500 text-white rounded-lg hover:bg-yellow-600 font-medium">
                    <Plus className="h-5 w-5" />
                    Nueva Evaluación
                  </button>
                  <div className="absolute right-0 mt-1 w-64 bg-white rounded-lg shadow-lg border border-gray-200 opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-10">
                    <div className="p-2">
                      <p className="text-xs text-gray-500 px-2 py-1">Selecciona escuela:</p>
                      {schools.map(school => (
                        <button
                          key={school.id}
                          onClick={() => handleNewAssessment(school)}
                          className="w-full text-left px-3 py-2 text-sm text-gray-700 hover:bg-gray-100 rounded"
                        >
                          {school.name}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* No school warning */}
        {schools.length === 0 && (
          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mb-6">
            <div className="flex items-start gap-3">
              <AlertCircle className="h-5 w-5 text-yellow-600 mt-0.5" />
              <div>
                <h3 className="font-medium text-yellow-800">Sin escuela asignada</h3>
                <p className="text-sm text-yellow-700">
                  No tienes una escuela asignada. Contacta a un administrador para poder crear evaluaciones.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* My Assessments Section */}
        <div className="mb-8">
          <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
            <Users className="h-5 w-5 text-gray-400" />
            Mis Evaluaciones
            <span className="text-sm font-normal text-gray-500">({myAssessments.length})</span>
          </h2>

          {myAssessments.length === 0 ? (
            <div className="bg-gray-50 rounded-lg p-8 text-center">
              <Zap className="h-12 w-12 text-gray-300 mx-auto mb-3" />
              <p className="text-gray-500">No tienes evaluaciones aún</p>
              {schools.length > 0 && (
                <button
                  onClick={() => handleNewAssessment(schools[0])}
                  className="mt-3 text-yellow-600 hover:text-yellow-700 font-medium text-sm"
                >
                  Crear tu primera evaluación
                </button>
              )}
            </div>
          ) : (
            <div className="grid gap-4">
              {myAssessments.map(assessment => (
                <AssessmentCard
                  key={assessment.id}
                  assessment={assessment}
                  onOpen={() => router.push(`/vias-transformacion/${assessment.id}`)}
                  getStatusBadge={getStatusBadge}
                  getAreaInfo={getAreaInfo}
                  formatDate={formatDate}
                />
              ))}
            </div>
          )}
        </div>

        {/* School Assessments Section (View Only) */}
        {otherAssessments.length > 0 && (
          <div>
            <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
              <Building2 className="h-5 w-5 text-gray-400" />
              Evaluaciones de Mi Escuela
              <span className="text-sm font-normal text-gray-500">({otherAssessments.length})</span>
            </h2>

            <div className="grid gap-4">
              {otherAssessments.map(assessment => (
                <AssessmentCard
                  key={assessment.id}
                  assessment={assessment}
                  onOpen={() => router.push(`/vias-transformacion/${assessment.id}`)}
                  getStatusBadge={getStatusBadge}
                  getAreaInfo={getAreaInfo}
                  formatDate={formatDate}
                  viewOnly
                />
              ))}
            </div>
          </div>
        )}

        {/* Empty state when no assessments at all */}
        {assessments.length === 0 && (
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-12 text-center">
            <Zap className="h-16 w-16 text-gray-200 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-gray-900 mb-2">
              No hay evaluaciones
            </h3>
            <p className="text-gray-500 mb-4">
              Aún no hay evaluaciones de transformación en tu escuela.
            </p>
            {schools.length > 0 && (
              <button
                onClick={() => handleNewAssessment(schools[0])}
                className="inline-flex items-center gap-2 px-4 py-2 bg-yellow-500 text-white rounded-lg hover:bg-yellow-600 font-medium"
              >
                <Plus className="h-5 w-5" />
                Crear Primera Evaluación
              </button>
            )}
          </div>
        )}
      </div>

      {/* Setup Modal */}
      {showSetupModal && selectedSchool && (
        <AssessmentSetupModal
          schoolId={selectedSchool.id}
          schoolName={selectedSchool.name}
          onClose={() => setShowSetupModal(false)}
          onSuccess={handleAssessmentCreated}
        />
      )}
    </MainLayout>
  );
}

// Assessment Card Component
function AssessmentCard({
  assessment,
  onOpen,
  getStatusBadge,
  getAreaInfo,
  formatDate,
  viewOnly = false,
}: {
  assessment: Assessment;
  onOpen: () => void;
  getStatusBadge: (status: string) => React.ReactNode;
  getAreaInfo: (area: string) => { label: string; emoji: string };
  formatDate: (date: string) => string;
  viewOnly?: boolean;
}) {
  const areaInfo = getAreaInfo(assessment.area);

  return (
    <button
      onClick={onOpen}
      className={`w-full bg-white rounded-lg border p-4 text-left transition-all hover:shadow-md ${
        viewOnly ? 'border-gray-200' : 'border-gray-200 hover:border-yellow-300'
      }`}
    >
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-3 flex-1 min-w-0">
          {/* Area emoji */}
          <div className="text-2xl flex-shrink-0">{areaInfo.emoji}</div>

          <div className="flex-1 min-w-0">
            {/* Title and status */}
            <div className="flex items-center gap-2 mb-1 flex-wrap">
              <h3 className="font-medium text-gray-900">{areaInfo.label}</h3>
              {getStatusBadge(assessment.status)}
              {viewOnly && (
                <span className="text-xs text-gray-400 italic">Solo lectura</span>
              )}
            </div>

            {/* School name */}
            {assessment.school_name && (
              <p className="text-sm text-gray-500 flex items-center gap-1 mb-2">
                <Building2 className="h-3 w-3" />
                {assessment.school_name}
              </p>
            )}

            {/* Grades */}
            {assessment.grades && assessment.grades.length > 0 && (
              <p className="text-sm text-gray-500 flex items-center gap-1 mb-2">
                <GraduationCap className="h-3 w-3" />
                {formatGradesDisplay(assessment.grades)}
              </p>
            )}

            {/* Meta info */}
            <div className="flex flex-wrap items-center gap-3 text-xs text-gray-400">
              {/* Creator */}
              <span className="flex items-center gap-1">
                {assessment.creator_avatar ? (
                  <img
                    src={assessment.creator_avatar}
                    alt=""
                    className="h-4 w-4 rounded-full"
                  />
                ) : (
                  <Users className="h-3 w-3" />
                )}
                {assessment.creator_name}
                {assessment.is_creator && ' (tú)'}
              </span>

              {/* Collaborators count */}
              {assessment.collaborators.length > 1 && (
                <span className="flex items-center gap-1">
                  <Users className="h-3 w-3" />
                  {assessment.collaborators.length} colaboradores
                </span>
              )}

              {/* Date */}
              <span className="flex items-center gap-1">
                <Calendar className="h-3 w-3" />
                {formatDate(assessment.updated_at)}
              </span>
            </div>
          </div>
        </div>

        {/* Arrow */}
        <ChevronRight className="h-5 w-5 text-gray-400 flex-shrink-0" />
      </div>
    </button>
  );
}
