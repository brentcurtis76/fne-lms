import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import { useAuth } from '../../../hooks/useAuth';
import { supabase } from '../../../lib/supabase';
import MainLayout from '../../../components/layout/MainLayout';
import {
  ArrowLeftIcon,
  CalendarIcon,
  UserGroupIcon,
  UploadIcon as DocumentArrowUpIcon,
  CheckCircleIcon,
  ClockIcon,
  ChatAltIcon as ChatBubbleLeftRightIcon,
  DocumentTextIcon
} from '@heroicons/react/outline';
import {
  getAssignmentInstance,
  getUserGroupInInstance,
  submitAssignment
} from '../../../lib/services/assignmentInstances';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { toast } from 'react-hot-toast';

interface GroupMember {
  id: string;
  full_name: string;
  email: string;
}

interface Group {
  id: string;
  name: string;
  members: GroupMember[];
}

interface AssignmentDetails {
  id: string;
  title: string;
  description?: string;
  instructions?: string;
  due_date?: string;
  status: string;
  groups: Group[];
  assignment_templates: {
    title: string;
    description?: string;
    instructions?: string;
    assignment_type: string;
    lessons: {
      title: string;
      modules: {
        title: string;
        courses: {
          title: string;
        };
      };
    };
  };
}

interface Submission {
  id: string;
  content: any;
  file_url?: string;
  submission_type: string;
  status: string;
  submitted_at?: string;
  grade?: number;
  feedback?: string;
}

export default function GroupAssignmentInstanceDetail() {
  const router = useRouter();
  const { id } = router.query;
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [assignment, setAssignment] = useState<AssignmentDetails | null>(null);
  const [userGroup, setUserGroup] = useState<Group | null>(null);
  const [submission, setSubmission] = useState<Submission | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [content, setContent] = useState('');

  useEffect(() => {
    if (id && user) {
      fetchAssignmentDetails();
    }
  }, [id, user]);

  const fetchAssignmentDetails = async () => {
    try {
      setLoading(true);
      
      // Fetch assignment details
      const { data: assignmentData, error: assignmentError } = await getAssignmentInstance(id as string);
      if (assignmentError) throw assignmentError;
      
      if (assignmentData.status !== 'active') {
        toast.error('Esta tarea no está disponible');
        router.push('/assignments');
        return;
      }
      
      setAssignment(assignmentData);
      
      // Check user's group
      const { data: groupData, error: groupError } = await getUserGroupInInstance(id as string, user?.id);
      if (groupError) throw groupError;
      
      setUserGroup(groupData);
      
      // Fetch existing submission
      const { data: submissionData, error: submissionError } = await supabase
        .from('assignment_submissions')
        .select('*')
        .eq('instance_id', id)
        .eq('user_id', user?.id)
        .maybeSingle();
      
      if (submissionError && submissionError.code !== 'PGRST116') throw submissionError;
      setSubmission(submissionData);
      
    } catch (error) {
      console.error('Error fetching assignment details:', error);
      toast.error('Error al cargar los detalles de la tarea');
    } finally {
      setLoading(false);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const selectedFile = e.target.files[0];
      
      // Validate file size (10MB max)
      if (selectedFile.size > 10 * 1024 * 1024) {
        toast.error('El archivo no debe superar 10MB');
        return;
      }
      
      setFile(selectedFile);
    }
  };

  const handleSubmit = async () => {
    if (!userGroup) {
      toast.error('No estás asignado a ningún grupo para esta tarea');
      return;
    }
    
    setSubmitting(true);
    try {
      let fileUrl = null;
      
      // Upload file if provided
      if (file) {
        const fileExt = file.name.split('.').pop();
        const fileName = `${id}/${userGroup.id}/${user?.id}_${Date.now()}.${fileExt}`;
        
        const { data: uploadData, error: uploadError } = await supabase.storage
          .from('assignment-submissions')
          .upload(fileName, file);
        
        if (uploadError) throw uploadError;
        
        const { data: { publicUrl } } = supabase.storage
          .from('assignment-submissions')
          .getPublicUrl(fileName);
        
        fileUrl = publicUrl;
      }
      
      // Submit assignment
      const { error } = await submitAssignment({
        instanceId: id as string,
        userId: user?.id,
        groupId: userGroup.id,
        content: { text: content },
        fileUrl,
        submissionType: file ? 'file' : 'text',
        status: 'submitted'
      });
      
      if (error) throw error;
      
      toast.success('Tarea enviada exitosamente');
      await fetchAssignmentDetails();
      
    } catch (error) {
      console.error('Error submitting assignment:', error);
      toast.error('Error al enviar la tarea');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <MainLayout user={user} currentPage="assignments">
        <div className="max-w-4xl mx-auto px-4 py-8">
          <div className="text-center py-12">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[#00365b] mx-auto"></div>
            <p className="mt-4 text-gray-600">Cargando detalles...</p>
          </div>
        </div>
      </MainLayout>
    );
  }

  if (!assignment) {
    return (
      <MainLayout user={user} currentPage="assignments">
        <div className="max-w-4xl mx-auto px-4 py-8">
          <div className="text-center py-12">
            <p className="text-gray-600">Tarea no encontrada</p>
          </div>
        </div>
      </MainLayout>
    );
  }

  const isOverdue = assignment.due_date && new Date(assignment.due_date) < new Date();
  const canSubmit = userGroup && !isOverdue && (!submission || submission.status === 'draft');

  return (
    <MainLayout user={user} currentPage="assignments">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="mb-8">
          <button
            onClick={() => router.push('/assignments')}
            className="mb-4 text-gray-600 hover:text-gray-900 flex items-center"
          >
            <ArrowLeftIcon className="h-5 w-5 mr-2" />
            Volver a mis tareas
          </button>
          
          <div className="flex items-start justify-between">
            <div>
              <div className="flex items-center mb-2">
                <UserGroupIcon className="h-8 w-8 mr-3 text-[#00365b]" />
                <h1 className="text-3xl font-bold text-gray-900">
                  {assignment.title}
                </h1>
              </div>
              <div className="text-sm text-gray-600">
                <p>{assignment.assignment_templates.lessons.modules.courses.title} → {assignment.assignment_templates.lessons.modules.title} → {assignment.assignment_templates.lessons.title}</p>
              </div>
            </div>
            
            {submission?.status === 'submitted' && (
              <div className="flex items-center text-green-600">
                <CheckCircleIcon className="h-5 w-5 mr-2" />
                <span className="font-medium">Enviado</span>
              </div>
            )}
            {submission?.status === 'graded' && (
              <div className="flex items-center text-blue-600">
                <CheckCircleIcon className="h-5 w-5 mr-2" />
                <span className="font-medium">Calificado: {submission.grade}/100</span>
              </div>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Main Content */}
          <div className="lg:col-span-2 space-y-6">
            {/* Description and Instructions */}
            <div className="bg-white rounded-lg shadow p-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center">
                <DocumentTextIcon className="h-5 w-5 mr-2 text-[#00365b]" />
                Descripción e Instrucciones
              </h2>
              
              {(assignment.description || assignment.assignment_templates.description) && (
                <div className="mb-4">
                  <h3 className="text-sm font-medium text-gray-700 mb-2">Descripción</h3>
                  <p className="text-gray-600 whitespace-pre-wrap">
                    {assignment.description || assignment.assignment_templates.description}
                  </p>
                </div>
              )}
              
              {(assignment.instructions || assignment.assignment_templates.instructions) && (
                <div>
                  <h3 className="text-sm font-medium text-gray-700 mb-2">Instrucciones</h3>
                  <div className="text-gray-600 whitespace-pre-wrap bg-gray-50 p-4 rounded-lg">
                    {assignment.instructions || assignment.assignment_templates.instructions}
                  </div>
                </div>
              )}
            </div>

            {/* Submission Form */}
            {canSubmit && (
              <div className="bg-white rounded-lg shadow p-6">
                <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center">
                  <DocumentArrowUpIcon className="h-5 w-5 mr-2 text-[#00365b]" />
                  Enviar Tarea
                </h2>
                
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Comentarios o respuesta
                    </label>
                    <textarea
                      value={content}
                      onChange={(e) => setContent(e.target.value)}
                      rows={4}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#00365b] focus:border-transparent"
                      placeholder="Escribe tu respuesta o comentarios aquí..."
                    />
                  </div>
                  
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Archivo adjunto (opcional)
                    </label>
                    <input
                      type="file"
                      onChange={handleFileChange}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#00365b] focus:border-transparent"
                      accept=".pdf,.doc,.docx,.txt,.jpg,.jpeg,.png"
                    />
                    <p className="mt-1 text-xs text-gray-500">
                      Formatos aceptados: PDF, DOC, DOCX, TXT, JPG, PNG (máx. 10MB)
                    </p>
                  </div>
                  
                  <button
                    onClick={handleSubmit}
                    disabled={submitting || (!content && !file)}
                    className="w-full px-4 py-2 bg-[#00365b] text-white rounded-lg hover:bg-[#004a7a] transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center"
                  >
                    {submitting ? (
                      <>
                        <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                        Enviando...
                      </>
                    ) : (
                      <>
                        <DocumentArrowUpIcon className="h-5 w-5 mr-2" />
                        Enviar Tarea
                      </>
                    )}
                  </button>
                </div>
              </div>
            )}

            {/* Submission Details */}
            {submission && (submission.status === 'submitted' || submission.status === 'graded') && (
              <div className="bg-white rounded-lg shadow p-6">
                <h2 className="text-lg font-semibold text-gray-900 mb-4">Tu Entrega</h2>
                
                <div className="space-y-3">
                  <div>
                    <p className="text-sm text-gray-500">Fecha de entrega</p>
                    <p className="font-medium">
                      {submission.submitted_at && format(new Date(submission.submitted_at), "d 'de' MMMM, yyyy 'a las' HH:mm", { locale: es })}
                    </p>
                  </div>
                  
                  {submission.content?.text && (
                    <div>
                      <p className="text-sm text-gray-500">Tu respuesta</p>
                      <p className="mt-1 text-gray-700 whitespace-pre-wrap bg-gray-50 p-3 rounded">
                        {submission.content.text}
                      </p>
                    </div>
                  )}
                  
                  {submission.file_url && (
                    <div>
                      <p className="text-sm text-gray-500">Archivo adjunto</p>
                      <a
                        href={submission.file_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="mt-1 text-[#00365b] hover:text-[#004a7a] underline"
                      >
                        Ver archivo
                      </a>
                    </div>
                  )}
                  
                  {submission.status === 'graded' && (
                    <>
                      <div>
                        <p className="text-sm text-gray-500">Calificación</p>
                        <p className="text-2xl font-bold text-[#00365b]">{submission.grade}/100</p>
                      </div>
                      
                      {submission.feedback && (
                        <div>
                          <p className="text-sm text-gray-500">Retroalimentación</p>
                          <p className="mt-1 text-gray-700 whitespace-pre-wrap bg-blue-50 p-3 rounded">
                            {submission.feedback}
                          </p>
                        </div>
                      )}
                    </>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Sidebar */}
          <div className="space-y-6">
            {/* Group Info */}
            <div className="bg-white rounded-lg shadow p-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center">
                <UserGroupIcon className="h-5 w-5 mr-2 text-[#00365b]" />
                Tu Grupo
              </h2>
              
              {userGroup ? (
                <div>
                  <p className="font-medium text-gray-900 mb-3">{userGroup.name}</p>
                  <div className="space-y-2">
                    {userGroup.members.map((member) => (
                      <div key={member.id} className="text-sm">
                        <p className="font-medium text-gray-700">{member.full_name}</p>
                        <p className="text-gray-500">{member.email}</p>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="text-center py-4">
                  <p className="text-gray-500 text-sm">
                    No estás asignado a ningún grupo para esta tarea
                  </p>
                  <p className="text-xs text-gray-400 mt-2">
                    Contacta a tu profesor para ser asignado a un grupo
                  </p>
                </div>
              )}
            </div>

            {/* Assignment Details */}
            <div className="bg-white rounded-lg shadow p-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">Detalles</h2>
              
              <div className="space-y-3">
                {assignment.due_date && (
                  <div>
                    <p className="text-sm text-gray-500 flex items-center">
                      <CalendarIcon className="h-4 w-4 mr-1" />
                      Fecha de entrega
                    </p>
                    <p className={`font-medium ${isOverdue ? 'text-red-600' : 'text-gray-900'}`}>
                      {format(new Date(assignment.due_date), "d 'de' MMMM, yyyy 'a las' HH:mm", { locale: es })}
                    </p>
                    {isOverdue && (
                      <p className="text-xs text-red-600 mt-1">
                        Esta tarea está vencida
                      </p>
                    )}
                  </div>
                )}
                
                <div>
                  <p className="text-sm text-gray-500">Estado</p>
                  <p className="font-medium">
                    {submission?.status === 'graded' ? 'Calificado' :
                     submission?.status === 'submitted' ? 'Enviado' :
                     isOverdue ? 'Vencido' : 'Pendiente'}
                  </p>
                </div>
              </div>
            </div>

            {/* Group Discussion */}
            <div className="bg-white rounded-lg shadow p-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center">
                <ChatBubbleLeftRightIcon className="h-5 w-5 mr-2 text-[#00365b]" />
                Discusión Grupal
              </h2>
              
              <div className="text-center py-4">
                <p className="text-gray-500 text-sm">
                  Próximamente podrás chatear con tu grupo aquí
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </MainLayout>
  );
}