import { useSupabaseClient } from '@supabase/auth-helpers-react';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';

import Head from 'next/head';
import Link from 'next/link';
import { toast } from 'react-hot-toast';
import MainLayout from '../../../components/layout/MainLayout';
import { ResponsiveFunctionalPageHeader } from '../../../components/layout/FunctionalPageHeader';
import { SubmissionList } from '../../../components/assignments/SubmissionList';
import { assignmentService, submissionService } from '../../../lib/services/assignments';
import { Assignment, AssignmentSubmission } from '../../../types/assignments';
import { ArrowLeft, Download, FileSpreadsheet } from 'lucide-react';
import { ClipboardCheckIcon } from '@heroicons/react/outline';

interface GradeModalProps {
  submission: AssignmentSubmission;
  assignment: Assignment;
  onClose: () => void;
  onSubmit: (score: number, feedback: string) => void;
}

const GradeModal: React.FC<GradeModalProps> = ({ submission, assignment, onClose, onSubmit }) => {
  const supabase = useSupabaseClient();
  const [score, setScore] = useState(submission.score || 0);
  const [feedback, setFeedback] = useState(submission.feedback || '');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit(score, feedback);
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4 shadow-xl">
        <h3 className="text-lg font-semibold text-brand_blue mb-4">
          Calificar entrega de {submission.student?.name}
        </h3>
        
        <form onSubmit={handleSubmit}>
          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Puntaje (máximo: {assignment.points})
            </label>
            <input
              type="number"
              value={score}
              onChange={(e) => setScore(Number(e.target.value))}
              min="0"
              max={assignment.points}
              step="0.5"
              required
              className="w-full p-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-brand_blue focus:border-transparent"
            />
          </div>
          
          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Retroalimentación
            </label>
            <textarea
              value={feedback}
              onChange={(e) => setFeedback(e.target.value)}
              rows={4}
              className="w-full p-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-brand_blue focus:border-transparent"
              placeholder="Escribe comentarios para el estudiante..."
            />
          </div>
          
          <div className="flex justify-end space-x-3">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-gray-600 hover:text-gray-800 border border-gray-300 rounded-md hover:bg-gray-50 transition"
            >
              Cancelar
            </button>
            <button
              type="submit"
              className="px-4 py-2 bg-brand_blue text-white rounded-md hover:bg-brand_yellow hover:text-brand_blue transition"
            >
              Guardar calificación
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

interface ReturnModalProps {
  submission: AssignmentSubmission;
  onClose: () => void;
  onSubmit: (feedback: string) => void;
}

const ReturnModal: React.FC<ReturnModalProps> = ({ submission, onClose, onSubmit }) => {
  const [feedback, setFeedback] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!feedback.trim()) {
      toast.error('Por favor proporciona retroalimentación');
      return;
    }
    onSubmit(feedback);
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4 shadow-xl">
        <h3 className="text-lg font-semibold text-brand_blue mb-4">
          Devolver tarea a {submission.student?.name}
        </h3>
        
        <form onSubmit={handleSubmit}>
          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Retroalimentación para revisión *
            </label>
            <textarea
              value={feedback}
              onChange={(e) => setFeedback(e.target.value)}
              rows={4}
              required
              className="w-full p-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-brand_blue focus:border-transparent"
              placeholder="Explica qué debe mejorar el estudiante..."
            />
          </div>
          
          <div className="flex justify-end space-x-3">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-gray-600 hover:text-gray-800 border border-gray-300 rounded-md hover:bg-gray-50 transition"
            >
              Cancelar
            </button>
            <button
              type="submit"
              className="px-4 py-2 bg-orange-600 text-white rounded-md hover:bg-orange-700 transition"
            >
              Devolver para revisión
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default function SubmissionsPage() {
  const router = useRouter();
  const { id } = router.query;
  const [loading, setLoading] = useState(true);
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [userRole, setUserRole] = useState<string>('');
  const [avatarUrl, setAvatarUrl] = useState('');
  
  const [assignment, setAssignment] = useState<Assignment | null>(null);
  const [submissions, setSubmissions] = useState<AssignmentSubmission[]>([]);
  const [gradeModal, setGradeModal] = useState<AssignmentSubmission | null>(null);
  const [returnModal, setReturnModal] = useState<AssignmentSubmission | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    if (!id) return;
    
    const checkSessionAndLoadData = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session?.user) {
          router.push('/login');
          return;
        }
        
        setCurrentUser(session.user);
        
        // Get user profile
        const { data: profile } = await supabase
          .from('profiles')
          .select('role, avatar_url')
          .eq('id', session.user.id)
          .single();

        if (profile) {
          setUserRole(profile.role);
          setAvatarUrl(profile.avatar_url || '');
          
          // Check if user is a teacher
          if (!['admin', 'consultor', 'equipo_directivo', 'lider_generacion'].includes(profile.role)) {
            toast.error('No tienes permisos para ver esta página');
            router.push('/assignments');
            return;
          }
        }

        await loadAssignmentAndSubmissions(id as string, session.user.id);
        setLoading(false);
      } catch (error) {
        console.error('Error:', error);
        toast.error('Error al cargar los datos');
        router.push('/assignments');
      }
    };

    checkSessionAndLoadData();
  }, [id, router]);

  const loadAssignmentAndSubmissions = async (assignmentId: string, userId: string) => {
    try {
      // Load assignment
      const assignmentData = await assignmentService.getById(assignmentId);
      if (!assignmentData) {
        toast.error('Tarea no encontrada');
        router.push('/assignments');
        return;
      }
      
      // Verify ownership
      if (assignmentData.created_by !== userId && userRole !== 'admin') {
        toast.error('No tienes permisos para ver estas entregas');
        router.push('/assignments');
        return;
      }
      
      setAssignment(assignmentData);

      // Load submissions
      const submissionsData = await submissionService.getAll({ 
        assignment_id: assignmentId 
      });
      setSubmissions(submissionsData || []);
    } catch (error) {
      console.error('Error loading data:', error);
      toast.error('Error al cargar las entregas');
    }
  };

  const handleGradeSubmission = async (submissionId: string, score: number, feedback: string) => {
    if (!currentUser) return;

    try {
      await submissionService.grade(submissionId, score, feedback, currentUser.id);
      toast.success('Calificación guardada exitosamente');
      setGradeModal(null);
      
      // Reload submissions
      if (id) {
        await loadAssignmentAndSubmissions(id as string, currentUser.id);
      }
    } catch (error) {
      console.error('Error grading submission:', error);
      toast.error('Error al guardar la calificación');
    }
  };

  const handleReturnSubmission = async (submissionId: string, feedback: string) => {
    if (!currentUser) return;

    try {
      await submissionService.returnForRevision(submissionId, feedback, currentUser.id);
      toast.success('Tarea devuelta para revisión');
      setReturnModal(null);
      
      // Reload submissions
      if (id) {
        await loadAssignmentAndSubmissions(id as string, currentUser.id);
      }
    } catch (error) {
      console.error('Error returning submission:', error);
      toast.error('Error al devolver la tarea');
    }
  };

  const handleExportSubmissions = () => {
    // TODO: Implement CSV/Excel export functionality
    toast.success('Función de exportación próximamente');
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    router.push('/login');
  };

  const filteredSubmissions = submissions.filter(submission => {
    if (!searchQuery) return true;
    
    const studentName = submission.student?.name?.toLowerCase() || '';
    const studentEmail = submission.student?.email?.toLowerCase() || '';
    const query = searchQuery.toLowerCase();
    
    return studentName.includes(query) || studentEmail.includes(query);
  });

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-brand_blue"></div>
      </div>
    );
  }

  if (!assignment) {
    return null;
  }

  return (
    <>
      <Head>
        <title>Entregas - {assignment.title} - FNE LMS</title>
      </Head>

      <MainLayout 
        user={currentUser} 
        currentPage="assignments"
        pageTitle="Entregas"
        isAdmin={userRole === 'admin'}
        avatarUrl={avatarUrl}
        onLogout={handleLogout}
      >
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          {/* Back link */}
          <Link 
            href="/assignments"
            className="inline-flex items-center text-sm text-gray-600 hover:text-gray-800 mb-4"
          >
            <ArrowLeft size={16} className="mr-1" />
            Volver a Mis Tareas
          </Link>

          {/* Page Header */}
          <ResponsiveFunctionalPageHeader
            icon={<ClipboardCheckIcon className="w-7 h-7" />}
            title={`Entregas: ${assignment.title}`}
            subtitle={`${submissions.length} entrega(s) recibida(s)`}
            searchValue={searchQuery}
            onSearchChange={setSearchQuery}
            searchPlaceholder="Buscar por estudiante..."
            primaryAction={{
              label: "Exportar",
              onClick: handleExportSubmissions,
              icon: <FileSpreadsheet size={20} />
            }}
          />

          {/* Assignment Summary */}
          <div className="bg-white rounded-lg shadow-md p-4 mb-6">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 text-sm">
              <div>
                <span className="text-gray-600">Fecha límite:</span>
                <p className="font-medium">
                  {assignment.due_date 
                    ? new Date(assignment.due_date).toLocaleDateString('es-ES')
                    : 'Sin fecha límite'
                  }
                </p>
              </div>
              <div>
                <span className="text-gray-600">Puntos:</span>
                <p className="font-medium">{assignment.points}</p>
              </div>
              <div>
                <span className="text-gray-600">Enviadas:</span>
                <p className="font-medium">
                  {submissions.filter(s => s.status !== 'draft').length}
                </p>
              </div>
              <div>
                <span className="text-gray-600">Calificadas:</span>
                <p className="font-medium">
                  {submissions.filter(s => s.status === 'graded').length}
                </p>
              </div>
            </div>
          </div>

          {/* Submissions List */}
          <SubmissionList
            submissions={filteredSubmissions}
            assignment={assignment}
            onGrade={(submissionId) => {
              const submission = submissions.find(s => s.id === submissionId);
              if (submission) setGradeModal(submission);
            }}
            onReturn={(submissionId) => {
              const submission = submissions.find(s => s.id === submissionId);
              if (submission) setReturnModal(submission);
            }}
          />

          {/* Grade Modal */}
          {gradeModal && (
            <GradeModal
              submission={gradeModal}
              assignment={assignment}
              onClose={() => setGradeModal(null)}
              onSubmit={(score, feedback) => 
                handleGradeSubmission(gradeModal.id, score, feedback)
              }
            />
          )}

          {/* Return Modal */}
          {returnModal && (
            <ReturnModal
              submission={returnModal}
              onClose={() => setReturnModal(null)}
              onSubmit={(feedback) => 
                handleReturnSubmission(returnModal.id, feedback)
              }
            />
          )}
        </div>
      </MainLayout>
    </>
  );
}