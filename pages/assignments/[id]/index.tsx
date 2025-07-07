import { useSupabaseClient } from '@supabase/auth-helpers-react';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';

import Head from 'next/head';
import Link from 'next/link';
import { toast } from 'react-hot-toast';
import MainLayout from '../../../components/layout/MainLayout';
import { ResponsiveFunctionalPageHeader } from '../../../components/layout/FunctionalPageHeader';
import { SubmissionForm } from '../../../components/assignments/SubmissionForm';
import { assignmentService, submissionService, assignmentUtils } from '../../../lib/services/assignments';
import { Assignment, AssignmentSubmission } from '../../../types/assignments';
import { ArrowLeft, Calendar, FileText, Link as LinkIcon } from 'lucide-react';
import { ClipboardCheckIcon } from '@heroicons/react/outline';

export default function AssignmentDetailPage() {
  const supabase = useSupabaseClient();
  const router = useRouter();
  const { id } = router.query;
  const [loading, setLoading] = useState(true);
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [userRole, setUserRole] = useState<string>('');
  const [avatarUrl, setAvatarUrl] = useState('');
  
  const [assignment, setAssignment] = useState<Assignment | null>(null);
  const [submission, setSubmission] = useState<AssignmentSubmission | null>(null);
  const [isEditing, setIsEditing] = useState(false);

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
          
          // Check if user is a student
          if (!['lider_comunidad', 'docente'].includes(profile.role)) {
            toast.error('No tienes permisos para ver esta página');
            router.push('/assignments');
            return;
          }
        }

        await loadAssignmentAndSubmission(id as string, session.user.id);
        setLoading(false);
      } catch (error) {
        console.error('Error:', error);
        toast.error('Error al cargar los datos');
        router.push('/assignments');
      }
    };

    checkSessionAndLoadData();
  }, [id, router]);

  const loadAssignmentAndSubmission = async (assignmentId: string, userId: string) => {
    try {
      // Load assignment
      const assignmentData = await assignmentService.getById(assignmentId);
      if (!assignmentData || !assignmentData.is_published) {
        toast.error('Tarea no encontrada');
        router.push('/assignments');
        return;
      }
      setAssignment(assignmentData);

      // Load submission
      const submissionData = await submissionService.getByAssignmentAndStudent(
        assignmentId,
        userId
      );
      setSubmission(submissionData);
      
      // If no submission exists and we're not editing, start editing
      if (!submissionData) {
        setIsEditing(true);
      }
    } catch (error) {
      console.error('Error loading data:', error);
      toast.error('Error al cargar la tarea');
    }
  };

  const handleSubmitAssignment = async (data: Partial<AssignmentSubmission>, isDraft: boolean) => {
    if (!assignment || !currentUser) return;

    try {
      if (submission) {
        // Update existing submission
        await submissionService.update(submission.id, {
          ...data,
          status: isDraft ? 'draft' : 'submitted',
          submitted_at: isDraft ? undefined : new Date().toISOString()
        });
      } else {
        // Create new submission
        await submissionService.create({
          ...data,
          assignment_id: assignment.id,
          student_id: currentUser.id,
          status: isDraft ? 'draft' : 'submitted',
          submitted_at: isDraft ? undefined : new Date().toISOString(),
          attempt_number: 1
        });
      }

      toast.success(isDraft ? 'Borrador guardado' : 'Tarea enviada exitosamente');
      await loadAssignmentAndSubmission(assignment.id, currentUser.id);
      setIsEditing(false);
    } catch (error) {
      console.error('Error submitting:', error);
      toast.error('Error al enviar la tarea');
    }
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    router.push('/login');
  };

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
        <title>{assignment.title} - FNE LMS</title>
      </Head>

      <MainLayout 
        user={currentUser} 
        currentPage="assignments"
        pageTitle={assignment.title}
        isAdmin={userRole === 'admin'}
        avatarUrl={avatarUrl}
        onLogout={handleLogout}
      >
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
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
            title={assignment.title}
            subtitle={`${assignmentUtils.getTypeLabel(assignment.assignment_type)} - ${assignment.course?.title || 'Sin curso'}`}
          />

          {/* Assignment Details */}
          {!isEditing && (
            <div className="mb-6 space-y-4">
              {/* Status and metadata */}
              <div className="bg-white rounded-lg shadow-md p-6">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="flex items-center">
                    <Calendar size={20} className="text-gray-400 mr-2" />
                    <div>
                      <p className="text-sm text-gray-600">Fecha límite</p>
                      <p className="font-medium">
                        {assignment.due_date 
                          ? assignmentUtils.formatDueDate(assignment.due_date)
                          : 'Sin fecha límite'
                        }
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center">
                    <FileText size={20} className="text-gray-400 mr-2" />
                    <div>
                      <p className="text-sm text-gray-600">Puntos</p>
                      <p className="font-medium">{assignment.points} puntos</p>
                    </div>
                  </div>
                  <div className="flex items-center">
                    <div className={`w-3 h-3 rounded-full mr-2 ${
                      submission?.status === 'graded' ? 'bg-green-500' :
                      submission?.status === 'submitted' ? 'bg-yellow-500' :
                      submission?.status === 'returned' ? 'bg-orange-500' :
                      'bg-gray-300'
                    }`} />
                    <div>
                      <p className="text-sm text-gray-600">Estado</p>
                      <p className="font-medium">
                        {!submission ? 'Sin entregar' :
                         submission.status === 'draft' ? 'Borrador' :
                         submission.status === 'submitted' ? 'Enviado' :
                         submission.status === 'graded' ? `Calificado: ${submission.score}/${assignment.points}` :
                         submission.status === 'returned' ? 'Devuelto para revisión' :
                         'Desconocido'}
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Description and instructions */}
              {(assignment.description || assignment.instructions) && (
                <div className="bg-white rounded-lg shadow-md p-6">
                  {assignment.description && (
                    <div className="mb-4">
                      <h3 className="font-semibold text-gray-800 mb-2">Descripción</h3>
                      <p className="text-gray-700">{assignment.description}</p>
                    </div>
                  )}
                  {assignment.instructions && (
                    <div>
                      <h3 className="font-semibold text-gray-800 mb-2">Instrucciones</h3>
                      <div className="text-gray-700 whitespace-pre-wrap">
                        {assignment.instructions}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Resources */}
              {assignment.resources && assignment.resources.length > 0 && (
                <div className="bg-white rounded-lg shadow-md p-6">
                  <h3 className="font-semibold text-gray-800 mb-3">Recursos</h3>
                  <div className="space-y-2">
                    {assignment.resources.map((resource) => (
                      <a
                        key={resource.id}
                        href={resource.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center p-3 bg-gray-50 rounded-md hover:bg-gray-100 transition"
                      >
                        <LinkIcon size={18} className="text-brand_blue mr-3" />
                        <span className="text-brand_blue hover:underline">
                          {resource.title}
                        </span>
                      </a>
                    ))}
                  </div>
                </div>
              )}

              {/* Current submission display */}
              {submission && (
                <div className="bg-white rounded-lg shadow-md p-6">
                  <h3 className="font-semibold text-gray-800 mb-3">Tu entrega</h3>
                  
                  {submission.content && (
                    <div className="mb-4">
                      <p className="text-sm text-gray-600 mb-2">Respuesta:</p>
                      <div className="p-3 bg-gray-50 rounded-md">
                        <p className="text-gray-700 whitespace-pre-wrap">{submission.content}</p>
                      </div>
                    </div>
                  )}
                  
                  {submission.attachment_urls && submission.attachment_urls.length > 0 && (
                    <div className="mb-4">
                      <p className="text-sm text-gray-600 mb-2">Archivos adjuntos:</p>
                      <div className="space-y-2">
                        {submission.attachment_urls.map((url, index) => (
                          <a
                            key={index}
                            href={url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="block p-2 bg-gray-50 rounded-md hover:bg-gray-100 text-blue-600 hover:underline"
                          >
                            Archivo {index + 1}
                          </a>
                        ))}
                      </div>
                    </div>
                  )}
                  
                  {submission.feedback && (
                    <div className="border-t pt-4">
                      <p className="text-sm font-medium text-gray-700 mb-2">
                        Retroalimentación del profesor:
                      </p>
                      <div className="p-3 bg-blue-50 rounded-md">
                        <p className="text-gray-700 whitespace-pre-wrap">{submission.feedback}</p>
                      </div>
                    </div>
                  )}
                  
                  {/* Edit button for draft or returned submissions */}
                  {(submission.status === 'draft' || submission.status === 'returned') && (
                    <div className="mt-4">
                      <button
                        onClick={() => setIsEditing(true)}
                        className="px-4 py-2 bg-brand_blue text-white rounded-md hover:bg-brand_yellow hover:text-brand_blue transition"
                      >
                        Editar entrega
                      </button>
                    </div>
                  )}
                </div>
              )}

              {/* Start submission button */}
              {!submission && !isEditing && (
                <div className="text-center">
                  <button
                    onClick={() => setIsEditing(true)}
                    className="px-6 py-3 bg-brand_blue text-white rounded-md hover:bg-brand_yellow hover:text-brand_blue transition"
                  >
                    Comenzar tarea
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Submission Form */}
          {isEditing && (
            <SubmissionForm
              submission={submission}
              assignment={assignment}
              onSubmit={handleSubmitAssignment}
              onCancel={() => setIsEditing(false)}
            />
          )}
        </div>
      </MainLayout>
    </>
  );
}