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
    icon: <Clock className="w-3.5 h-3.5" />,
    bgColor: 'bg-amber-50',
    textColor: 'text-amber-700',
  },
  in_progress: {
    label: 'En Progreso',
    icon: <AlertCircle className="w-3.5 h-3.5" />,
    bgColor: 'bg-sky-50',
    textColor: 'text-sky-700',
  },
  completed: {
    label: 'Completado',
    icon: <CheckCircle className="w-3.5 h-3.5" />,
    bgColor: 'bg-emerald-50',
    textColor: 'text-emerald-700',
  },
  archived: {
    label: 'Archivado',
    icon: <Clock className="w-3.5 h-3.5" />,
    bgColor: 'bg-gray-50',
    textColor: 'text-gray-600',
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
      <div className="min-h-screen bg-brand_light flex justify-center items-center">
        <p className="text-xl text-brand_primary">Cargando...</p>
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

      <div className="max-w-4xl mx-auto px-6 sm:px-8 lg:px-10 py-10">
        {/* Filters */}
        <div className="flex items-center gap-3 mb-10">
          <Filter className="w-4 h-4 text-brand_primary/30" />
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="px-4 py-2.5 border border-brand_primary/10 rounded-lg text-sm text-brand_primary bg-white focus:outline-none focus:ring-2 focus:ring-brand_accent/40 focus:border-brand_accent"
          >
            <option value="">Todos los estados</option>
            <option value="pending">Pendiente</option>
            <option value="in_progress">En Progreso</option>
            <option value="completed">Completado</option>
          </select>
        </div>

        {loading ? (
          <div className="text-center py-20">
            <p className="text-brand_primary/40">Cargando evaluaciones...</p>
          </div>
        ) : assessments.length === 0 ? (
          <div className="text-center py-24">
            <ClipboardCheck className="mx-auto h-16 w-16 text-brand_primary/15" />
            <h3 className="mt-6 text-xl font-semibold text-brand_primary">
              No hay evaluaciones asignadas
            </h3>
            <p className="mt-3 text-sm text-brand_primary/45 max-w-sm mx-auto leading-relaxed">
              Cuando te asignen evaluaciones, aparecerán aquí.
            </p>
          </div>
        ) : (
          <div className="space-y-14">
            {/* Pending/In Progress Section */}
            {pendingAssessments.length > 0 && (
              <section>
                <h2 className="text-xs font-bold text-brand_primary/50 uppercase tracking-[0.15em] mb-6">
                  Por Completar ({pendingAssessments.length})
                </h2>
                <div className="space-y-5">
                  {pendingAssessments.map((assessment) => (
                    <AssessmentCard
                      key={assessment.id}
                      assessment={assessment}
                      allAssessments={assessments}
                    />
                  ))}
                </div>
              </section>
            )}

            {/* Completed Section */}
            {completedAssessments.length > 0 && (
              <section>
                <h2 className="text-xs font-bold text-brand_primary/35 uppercase tracking-[0.15em] mb-6">
                  Completadas ({completedAssessments.length})
                </h2>
                <div className="space-y-5">
                  {completedAssessments.map((assessment) => (
                    <AssessmentCard
                      key={assessment.id}
                      assessment={assessment}
                      allAssessments={assessments}
                    />
                  ))}
                </div>
              </section>
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

  // Check if this is a newer version
  const isNewerVersion = hasMultipleVersions &&
    (assessment.status === 'pending' || assessment.status === 'in_progress') &&
    relatedVersions.some(r => r.status === 'completed');

  return (
    <div className="bg-white rounded-xl border border-brand_primary/[0.08] p-6 hover:border-brand_primary/[0.15] transition-all">
      <div className="flex items-start justify-between gap-6">
        <div className="flex-1 min-w-0">
          {/* Title */}
          <h3 className="text-lg font-semibold text-brand_primary leading-snug">
            {assessment.templateName}
          </h3>

          {/* Badges row */}
          <div className="flex flex-wrap items-center gap-2 mt-3">
            <span className="text-xs font-medium text-brand_primary/40">
              v{assessment.templateVersion}
            </span>
            <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${statusConfig.bgColor} ${statusConfig.textColor}`}>
              {statusConfig.icon}
              {statusConfig.label}
            </span>
            {assessment.generationType && (
              <span
                className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium ${
                  assessment.generationType === 'GT'
                    ? 'bg-brand_accent/15 text-brand_primary/70'
                    : 'bg-sky-50 text-sky-700'
                }`}
                title={assessment.generationType === 'GT' ? 'Generación Tractor' : 'Generación Innova'}
              >
                {assessment.generationType}
              </span>
            )}
            {isNewerVersion && (
              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-amber-50 text-amber-700">
                <RefreshCw className="w-3 h-3" />
                Actualizado
              </span>
            )}
          </div>

          {/* Version update note */}
          {isNewerVersion && (
            <p className="text-xs text-amber-600 mt-3 flex items-center gap-1.5">
              <RefreshCw className="w-3 h-3 flex-shrink-0" />
              Nueva versión — el instrumento fue actualizado desde tu última evaluación
            </p>
          )}

          {/* Metadata */}
          <div className="flex flex-wrap items-center gap-x-5 gap-y-1.5 mt-4 text-sm text-brand_primary/40">
            <span className="font-medium text-brand_primary/60">
              {AREA_LABELS[assessment.templateArea]}
            </span>
            {assessment.courseName && (
              <span>{assessment.courseName}</span>
            )}
            <span>Año {assessment.transformationYear}</span>
            <span>
              Asignado: {new Date(assessment.assignedAt).toLocaleDateString('es-CL')}
            </span>
            {assessment.completedAt && (
              <span className="text-emerald-600">
                Completado: {new Date(assessment.completedAt).toLocaleDateString('es-CL')}
              </span>
            )}
          </div>
        </div>

        {/* Action button */}
        <div className="flex-shrink-0 pt-1">
          {isCompleted ? (
            <Link href={`/docente/assessments/${assessment.id}/results`} legacyBehavior>
              <a className="inline-flex items-center gap-2 px-5 py-2.5 text-sm font-medium border border-brand_primary/15 text-brand_primary/70 rounded-lg hover:bg-brand_primary/[0.03] transition-colors">
                <BarChart3 className="w-4 h-4" />
                Ver Resultados
              </a>
            </Link>
          ) : (
            <Link href={`/docente/assessments/${assessment.id}`} legacyBehavior>
              <a className="inline-flex items-center gap-2 px-5 py-2.5 text-sm font-semibold bg-brand_accent text-brand_primary rounded-lg hover:bg-brand_accent_hover transition-colors shadow-sm">
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
