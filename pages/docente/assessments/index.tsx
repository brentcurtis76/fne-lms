import { useSupabaseClient } from '@supabase/auth-helpers-react';
import React, { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { toast } from 'react-hot-toast';
import MainLayout from '@/components/layout/MainLayout';
import { ResponsiveFunctionalPageHeader } from '@/components/layout/FunctionalPageHeader';
import {
  ClipboardCheck,
  Clock,
  CheckCircle,
  AlertCircle,
  ChevronRight,
  Filter,
  BarChart3,
  RefreshCw,
} from 'lucide-react';
import { AREA_LABELS, TransformationArea, GenerationType } from '@/types/assessment-builder';

interface AssessmentListItem {
  id: string;
  assigneeId: string;
  templateId: string;
  templateName: string;
  templateArea: TransformationArea;
  templateVersion: string;
  transformationYear: number;
  generationType?: GenerationType; // GT or GI
  status: 'pending' | 'in_progress' | 'completed' | 'archived';
  courseName?: string;
  gradeLevel?: string;
  canEdit: boolean;
  canSubmit: boolean;
  hasStarted: boolean;
  hasSubmitted: boolean;
  assignedAt: string;
  startedAt?: string;
  completedAt?: string;
}

const STATUS_CONFIG: Record<string, { label: string; icon: React.ReactNode; bgColor: string; textColor: string }> = {
  pending: {
    label: 'Pendiente',
    icon: <Clock className="w-4 h-4" />,
    bgColor: 'bg-yellow-100',
    textColor: 'text-yellow-800',
  },
  in_progress: {
    label: 'En Progreso',
    icon: <AlertCircle className="w-4 h-4" />,
    bgColor: 'bg-blue-100',
    textColor: 'text-blue-800',
  },
  completed: {
    label: 'Completado',
    icon: <CheckCircle className="w-4 h-4" />,
    bgColor: 'bg-green-100',
    textColor: 'text-green-800',
  },
  archived: {
    label: 'Archivado',
    icon: <Clock className="w-4 h-4" />,
    bgColor: 'bg-gray-100',
    textColor: 'text-gray-800',
  },
};

const DocenteAssessmentsPage: React.FC = () => {
  const router = useRouter();
  const supabase = useSupabaseClient();
  const [user, setUser] = useState<any>(null);
  const [assessments, setAssessments] = useState<AssessmentListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [avatarUrl, setAvatarUrl] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<string>('');

  // Check auth
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
    };

    checkAuth();
  }, [supabase, router]);

  // Fetch assessments
  const fetchAssessments = useCallback(async () => {
    if (!user) return;

    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (statusFilter) params.append('status', statusFilter);

      const response = await fetch(`/api/docente/assessments?${params.toString()}`);
      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Error al cargar evaluaciones');
      }

      const data = await response.json();
      setAssessments(data.assessments || []);
    } catch (error: any) {
      console.error('Error fetching assessments:', error);
      toast.error(error.message || 'Error al cargar evaluaciones');
    } finally {
      setLoading(false);
    }
  }, [user, statusFilter]);

  useEffect(() => {
    if (user) {
      fetchAssessments();
    }
  }, [user, fetchAssessments]);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    router.push('/login');
  };

  // Group assessments by status
  const pendingAssessments = assessments.filter(a => a.status === 'pending' || a.status === 'in_progress');
  const completedAssessments = assessments.filter(a => a.status === 'completed');

  // Loading state
  if (!user) {
    return (
      <div className="min-h-screen bg-brand_beige flex justify-center items-center">
        <p className="text-xl text-brand_blue">Cargando...</p>
      </div>
    );
  }

  return (
    <MainLayout
      user={user}
      currentPage="assessments"
      pageTitle=""
      breadcrumbs={[]}
      isAdmin={false}
      onLogout={handleLogout}
      avatarUrl={avatarUrl}
    >
      <ResponsiveFunctionalPageHeader
        icon={<ClipboardCheck />}
        title="Mis Evaluaciones"
        subtitle={`${assessments.length} evaluación${assessments.length !== 1 ? 'es' : ''} asignada${assessments.length !== 1 ? 's' : ''}`}
      />

      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {/* Filters */}
        <div className="flex items-center gap-3 mb-6">
          <Filter className="w-4 h-4 text-gray-500" />
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="px-3 py-2 border border-gray-300 rounded-md text-sm bg-white focus:outline-none focus:ring-1 focus:ring-brand_blue"
          >
            <option value="">Todos los estados</option>
            <option value="pending">Pendiente</option>
            <option value="in_progress">En Progreso</option>
            <option value="completed">Completado</option>
          </select>
        </div>

        {loading ? (
          <div className="text-center py-12">
            <p className="text-gray-500">Cargando evaluaciones...</p>
          </div>
        ) : assessments.length === 0 ? (
          <div className="text-center bg-white p-12 rounded-xl shadow-lg">
            <ClipboardCheck className="mx-auto h-16 w-16 text-brand_blue/30" />
            <h3 className="mt-4 text-xl font-semibold text-brand_blue">
              No hay evaluaciones asignadas
            </h3>
            <p className="mt-2 text-sm text-gray-600">
              Cuando te asignen evaluaciones, aparecerán aquí.
            </p>
          </div>
        ) : (
          <div className="space-y-8">
            {/* Pending/In Progress Section */}
            {pendingAssessments.length > 0 && (
              <div>
                <h2 className="text-lg font-semibold text-brand_blue mb-4">
                  Por Completar ({pendingAssessments.length})
                </h2>
                <div className="space-y-3">
                  {pendingAssessments.map((assessment) => (
                    <AssessmentCard
                      key={assessment.id}
                      assessment={assessment}
                      allAssessments={assessments}
                    />
                  ))}
                </div>
              </div>
            )}

            {/* Completed Section */}
            {completedAssessments.length > 0 && (
              <div>
                <h2 className="text-lg font-semibold text-gray-600 mb-4">
                  Completadas ({completedAssessments.length})
                </h2>
                <div className="space-y-3">
                  {completedAssessments.map((assessment) => (
                    <AssessmentCard
                      key={assessment.id}
                      assessment={assessment}
                      allAssessments={assessments}
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
};

interface AssessmentCardProps {
  assessment: AssessmentListItem;
  allAssessments: AssessmentListItem[];
}

const AssessmentCard: React.FC<AssessmentCardProps> = ({ assessment, allAssessments }) => {
  const statusConfig = STATUS_CONFIG[assessment.status];
  const isCompleted = assessment.status === 'completed';

  // Check if there are other versions of the same template
  const relatedVersions = allAssessments.filter(
    a => a.templateId === assessment.templateId && a.id !== assessment.id
  );
  const hasMultipleVersions = relatedVersions.length > 0;

  // Check if this is a newer version (has a pending/in_progress while others are completed)
  const isNewerVersion = hasMultipleVersions &&
    (assessment.status === 'pending' || assessment.status === 'in_progress') &&
    relatedVersions.some(r => r.status === 'completed');

  return (
    <div className="bg-white shadow-md rounded-lg p-4 hover:shadow-lg transition-shadow">
      <div className="flex items-center justify-between">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-3 mb-2">
            <h3 className="text-lg font-medium text-gray-900 truncate">
              {assessment.templateName}
              <span className="ml-2 text-sm font-normal text-gray-500">
                (v{assessment.templateVersion})
              </span>
            </h3>
            <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${statusConfig.bgColor} ${statusConfig.textColor}`}>
              {statusConfig.icon}
              {statusConfig.label}
            </span>
            {/* Generation Type Badge (GT/GI) */}
            {assessment.generationType && (
              <span
                className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                  assessment.generationType === 'GT'
                    ? 'bg-green-100 text-green-700'
                    : 'bg-blue-100 text-blue-700'
                }`}
                title={assessment.generationType === 'GT' ? 'Generación Tractor' : 'Generación Innova'}
              >
                {assessment.generationType}
              </span>
            )}
            {isNewerVersion && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-800">
                <RefreshCw className="w-3 h-3" />
                Actualizado
              </span>
            )}
          </div>

          {/* Note about version update */}
          {isNewerVersion && (
            <p className="text-xs text-amber-600 mb-2 flex items-center gap-1">
              <RefreshCw className="w-3 h-3" />
              Nueva versión - el instrumento fue actualizado desde tu última evaluación
            </p>
          )}

          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-gray-500">
            <span className="font-medium text-brand_blue">
              {AREA_LABELS[assessment.templateArea]}
            </span>
            {assessment.courseName && (
              <span>
                Curso: {assessment.courseName}
              </span>
            )}
            <span>
              Año {assessment.transformationYear}
            </span>
            <span>
              Asignado: {new Date(assessment.assignedAt).toLocaleDateString('es-CL')}
            </span>
            {assessment.completedAt && (
              <span className="text-green-600">
                Completado: {new Date(assessment.completedAt).toLocaleDateString('es-CL')}
              </span>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2 flex-shrink-0 ml-4">
          {isCompleted ? (
            <Link href={`/docente/assessments/${assessment.id}/results`} legacyBehavior>
              <a className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-brand_blue text-white text-sm font-medium rounded-lg hover:bg-brand_blue/90 transition-colors">
                <BarChart3 className="w-4 h-4" />
                Ver Resultados
              </a>
            </Link>
          ) : (
            <Link href={`/docente/assessments/${assessment.id}`} legacyBehavior>
              <a className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-brand_blue text-white text-sm font-medium rounded-lg hover:bg-brand_blue/90 transition-colors">
                Continuar
                <ChevronRight className="w-4 h-4" />
              </a>
            </Link>
          )}
        </div>
      </div>
    </div>
  );
};

export default DocenteAssessmentsPage;
