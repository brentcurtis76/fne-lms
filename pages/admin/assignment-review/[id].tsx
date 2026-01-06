import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import { useAuth } from '../../../hooks/useAuth';
import { supabase } from '../../../lib/supabase';
import { toast } from 'react-hot-toast';
import MainLayout from '../../../components/layout/MainLayout';
import { getUserPrimaryRole } from '../../../utils/roleUtils';
import { 
  ArrowLeft, 
  Users, 
  FileText, 
  CheckCircle, 
  Clock, 
  AlertCircle,
  Download,
  MessageSquare,
  ChevronDown,
  ChevronUp
} from 'lucide-react';

interface GroupSubmission {
  id: string;
  group_id: string;
  group_name: string;
  members: Array<{
    user_id: string;
    name: string;
    email: string;
    role: string;
  }>;
  status: 'pending' | 'submitted' | 'reviewed' | 'returned';
  submitted_at: string | null;
  submission_content: string;
  file_urls: string[];
  grade: number | null;
  feedback: string | null;
  reviewed_at: string | null;
  reviewed_by: string | null;
}

interface AssignmentDetails {
  id: string;
  title: string;
  description: string;
  instructions: string;
  course_title: string;
  lesson_title: string;
  community_name: string;
  school_name: string;
  created_at: string;
  total_groups: number;
  submitted_groups: number;
  pending_groups: number;
  reviewed_groups: number;
}

export default function AssignmentReviewPage() {
  const router = useRouter();
  const { id: assignmentId } = router.query;
  const { user, loading: authLoading } = useAuth();
  
  const [loading, setLoading] = useState(true);
  const [assignment, setAssignment] = useState<AssignmentDetails | null>(null);
  const [submissions, setSubmissions] = useState<GroupSubmission[]>([]);
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [userRole, setUserRole] = useState<string>('');

  useEffect(() => {
    if (!authLoading && user && assignmentId) {
      checkAuth();
    } else if (!authLoading && !user) {
      router.push('/login');
    }
  }, [user, authLoading, assignmentId]);

  const checkAuth = async () => {
    try {
      const role = await getUserPrimaryRole(user!.id);
      if (role !== 'admin' && role !== 'consultor') {
        toast.error('No tienes permisos para acceder a esta página');
        router.push('/dashboard');
        return;
      }
      setUserRole(role);
      await loadAssignmentData();
    } catch (error) {
      console.error('Error checking auth:', error);
      router.push('/login');
    }
  };

  const loadAssignmentData = async () => {
    if (!assignmentId || !user) return;
    
    try {
      setLoading(true);
      
      // Load assignment details from blocks
      const { data: blockData, error: blockError } = await supabase
        .from('blocks')
        .select(`
          *,
          lesson:lessons!lesson_id (
            id,
            title,
            course:courses!course_id (
              id,
              title
            )
          )
        `)
        .eq('id', assignmentId)
        .single();

      if (blockError) throw blockError;

      // Load all groups for this assignment
      const { data: groups, error: groupsError } = await supabase
        .from('group_assignment_groups')
        .select(`
          *,
          community:growth_communities!community_id (
            id,
            name,
            school:schools!school_id (
              id,
              name
            )
          )
        `)
        .eq('assignment_id', assignmentId);

      if (groupsError) throw groupsError;

      // Load all submissions for these groups
      const groupIds = groups?.map(g => g.id) || [];
      
      let submissionsData = [];
      if (groupIds.length > 0) {
        const { data, error: submissionsError } = await supabase
          .from('group_assignment_submissions')
          .select('*')
          .in('group_id', groupIds);
        
        if (submissionsError) throw submissionsError;
        submissionsData = data || [];
      }

      // Load group members
      let members = [];
      if (groupIds.length > 0) {
        const { data, error: membersError } = await supabase
          .from('group_assignment_members')
          .select('*')
          .in('group_id', groupIds);
        
        if (membersError) throw membersError;
        members = data || [];
      }
      
      // Get user profiles separately
      let memberProfiles = {};
      if (members && members.length > 0) {
        const userIds = [...new Set(members.map(m => m.user_id))];
        const { data: profiles } = await supabase
          .from('profiles')
          .select('id, first_name, last_name, email')
          .in('id', userIds);
        
        if (profiles) {
          memberProfiles = profiles.reduce((acc, profile) => {
            acc[profile.id] = profile;
            return acc;
          }, {});
        }
      }

      // Construct assignment details
      const assignmentDetails: AssignmentDetails = {
        id: blockData.id,
        title: blockData.payload?.title || 'Tarea Grupal',
        description: blockData.payload?.description || '',
        instructions: blockData.payload?.instructions || '',
        course_title: blockData.lesson?.course?.title || '',
        lesson_title: blockData.lesson?.title || '',
        community_name: groups[0]?.community?.name || '',
        school_name: groups[0]?.community?.school?.name || '',
        created_at: blockData.created_at,
        total_groups: groups?.length || 0,
        submitted_groups: submissionsData?.filter(s => s.status === 'submitted' || s.status === 'reviewed').length || 0,
        pending_groups: groups?.length - (submissionsData?.length || 0) || 0,
        reviewed_groups: submissionsData?.filter(s => s.status === 'reviewed').length || 0
      };

      setAssignment(assignmentDetails);

      // Construct group submissions
      const groupSubmissions: GroupSubmission[] = groups?.map(group => {
        const submission = submissionsData?.find(s => s.group_id === group.id);
        const groupMembers = members?.filter(m => m.group_id === group.id) || [];
        
        return {
          id: group.id,
          group_id: group.id,
          group_name: group.name,
          members: groupMembers.map(m => {
            const profile = memberProfiles[m.user_id] || {};
            return {
              user_id: m.user_id,
              name: `${profile.first_name || ''} ${profile.last_name || ''}`.trim() || profile.email || 'Sin nombre',
              email: profile.email || '',
              role: m.role
            };
          }),
          status: submission?.status || 'pending',
          submitted_at: submission?.submitted_at,
          submission_content: submission?.submission_content || '',
          file_urls: submission?.file_urls || [],
          grade: submission?.grade,
          feedback: submission?.feedback,
          reviewed_at: submission?.reviewed_at,
          reviewed_by: submission?.reviewed_by
        };
      }) || [];

      setSubmissions(groupSubmissions);

    } catch (error) {
      console.error('Error loading assignment data:', error);
      toast.error('Error al cargar los datos de la tarea');
    } finally {
      setLoading(false);
    }
  };

  const toggleGroupExpanded = (groupId: string) => {
    const newExpanded = new Set(expandedGroups);
    if (newExpanded.has(groupId)) {
      newExpanded.delete(groupId);
    } else {
      newExpanded.add(groupId);
    }
    setExpandedGroups(newExpanded);
  };

  const handleGradeSubmission = async (groupId: string, grade: number, feedback: string) => {
    try {
      const { error } = await supabase
        .from('group_assignment_submissions')
        .update({
          grade,
          feedback,
          status: 'reviewed',
          reviewed_at: new Date().toISOString(),
          reviewed_by: user?.id
        })
        .eq('group_id', groupId);

      if (error) throw error;

      toast.success('Calificación guardada exitosamente');
      await loadAssignmentData();
    } catch (error) {
      console.error('Error saving grade:', error);
      toast.error('Error al guardar la calificación');
    }
  };

  const filteredSubmissions = submissions.filter(sub => {
    if (filterStatus === 'all') return true;
    return sub.status === filterStatus;
  });

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'submitted':
        return 'text-blue-600 bg-blue-50';
      case 'reviewed':
        return 'text-green-600 bg-green-50';
      case 'returned':
        return 'text-orange-600 bg-orange-50';
      default:
        return 'text-gray-600 bg-gray-50';
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'submitted':
        return <FileText className="w-4 h-4" />;
      case 'reviewed':
        return <CheckCircle className="w-4 h-4" />;
      case 'returned':
        return <AlertCircle className="w-4 h-4" />;
      default:
        return <Clock className="w-4 h-4" />;
    }
  };

  const getStatusLabel = (status: string) => {
    switch (status) {
      case 'submitted':
        return 'Entregado';
      case 'reviewed':
        return 'Revisado';
      case 'returned':
        return 'Devuelto';
      default:
        return 'Pendiente';
    }
  };

  if (authLoading || loading) {
    return (
      <MainLayout user={user} currentPage="assignment-review">
        <div className="flex items-center justify-center min-h-[50vh]">
          <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-[#0a0a0a]"></div>
        </div>
      </MainLayout>
    );
  }

  if (!assignment) {
    return null;
  }

  return (
    <MainLayout user={user} currentPage="assignment-review">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="mb-8">
          <button
            onClick={() => router.push('/admin/assignment-overview')}
            className="inline-flex items-center text-sm text-gray-600 hover:text-gray-800 mb-4"
          >
            <ArrowLeft className="w-4 h-4 mr-1" />
            Volver a Vista de Tareas
          </button>

          <div className="bg-white rounded-lg shadow-md p-6">
            <h1 className="text-2xl font-bold text-[#0a0a0a] mb-2">{assignment.title}</h1>
            <p className="text-gray-600 mb-4">
              {assignment.course_title} - {assignment.lesson_title}
            </p>
            
            {assignment.description && (
              <p className="text-gray-700 mb-4">{assignment.description}</p>
            )}

            <div className="bg-gray-50 rounded-lg p-4 mb-4">
              <h3 className="font-medium text-gray-700 mb-2">Instrucciones:</h3>
              <p className="text-gray-600 whitespace-pre-wrap">{assignment.instructions}</p>
            </div>

            {/* Stats */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="text-center p-4 bg-gray-50 rounded-lg">
                <p className="text-3xl font-bold text-[#0a0a0a]">{assignment.total_groups}</p>
                <p className="text-sm text-gray-600">Grupos totales</p>
              </div>
              <div className="text-center p-4 bg-blue-50 rounded-lg">
                <p className="text-3xl font-bold text-blue-600">{assignment.submitted_groups}</p>
                <p className="text-sm text-gray-600">Entregados</p>
              </div>
              <div className="text-center p-4 bg-yellow-50 rounded-lg">
                <p className="text-3xl font-bold text-yellow-600">{assignment.pending_groups}</p>
                <p className="text-sm text-gray-600">Pendientes</p>
              </div>
              <div className="text-center p-4 bg-green-50 rounded-lg">
                <p className="text-3xl font-bold text-green-600">{assignment.reviewed_groups}</p>
                <p className="text-sm text-gray-600">Revisados</p>
              </div>
            </div>
          </div>
        </div>

        {/* Filter */}
        <div className="mb-6">
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Filtrar por estado:
          </label>
          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
            className="w-full md:w-auto px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#fbbf24] focus:border-transparent"
          >
            <option value="all">Todos los grupos</option>
            <option value="pending">Pendientes</option>
            <option value="submitted">Entregados</option>
            <option value="reviewed">Revisados</option>
            <option value="returned">Devueltos</option>
          </select>
        </div>

        {/* Submissions List */}
        <div className="space-y-4">
          {filteredSubmissions.length === 0 ? (
            <div className="bg-white rounded-lg shadow p-12 text-center">
              <Users className="h-16 w-16 text-gray-300 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-gray-900 mb-2">
                No hay grupos que mostrar
              </h3>
              <p className="text-gray-600">
                No se encontraron grupos con el estado seleccionado.
              </p>
            </div>
          ) : (
            filteredSubmissions.map((submission) => (
              <div
                key={submission.id}
                className="bg-white rounded-lg shadow hover:shadow-lg transition-shadow"
              >
                {/* Group Header */}
                <div
                  className="p-6 cursor-pointer"
                  onClick={() => toggleGroupExpanded(submission.id)}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-4">
                      <Users className="h-6 w-6 text-gray-400" />
                      <div>
                        <h3 className="text-lg font-semibold text-[#0a0a0a]">
                          {submission.group_name}
                        </h3>
                        <p className="text-sm text-gray-600">
                          {submission.members.length} miembros
                        </p>
                      </div>
                    </div>
                    
                    <div className="flex items-center space-x-4">
                      <span className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-medium ${getStatusColor(submission.status)}`}>
                        {getStatusIcon(submission.status)}
                        <span className="ml-2">{getStatusLabel(submission.status)}</span>
                      </span>
                      {expandedGroups.has(submission.id) ? (
                        <ChevronUp className="h-5 w-5 text-gray-400" />
                      ) : (
                        <ChevronDown className="h-5 w-5 text-gray-400" />
                      )}
                    </div>
                  </div>
                </div>

                {/* Expanded Content */}
                {expandedGroups.has(submission.id) && (
                  <div className="border-t border-gray-200 p-6">
                    {/* Members */}
                    <div className="mb-6">
                      <h4 className="text-sm font-medium text-gray-700 mb-3">Miembros del grupo:</h4>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                        {submission.members.map((member) => (
                          <div key={member.user_id} className="flex items-center space-x-2 text-sm">
                            <div className="w-2 h-2 bg-gray-400 rounded-full"></div>
                            <span className="text-gray-700">{member.name}</span>
                            {member.role === 'leader' && (
                              <span className="text-xs text-[#fbbf24] font-medium">(Líder)</span>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Submission Content */}
                    {submission.status !== 'pending' && (
                      <>
                        <div className="mb-6">
                          <h4 className="text-sm font-medium text-gray-700 mb-3">Contenido de la entrega:</h4>
                          <div className="bg-gray-50 rounded-lg p-4">
                            <p className="text-gray-700 whitespace-pre-wrap">
                              {submission.submission_content || 'Sin contenido de texto'}
                            </p>
                          </div>
                        </div>

                        {/* Files */}
                        {submission.file_urls.length > 0 && (
                          <div className="mb-6">
                            <h4 className="text-sm font-medium text-gray-700 mb-3">Archivos adjuntos:</h4>
                            <div className="space-y-2">
                              {submission.file_urls.map((url, index) => (
                                <a
                                  key={index}
                                  href={url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="inline-flex items-center text-[#0a0a0a] hover:text-[#0a0a0a]/80"
                                >
                                  <Download className="w-4 h-4 mr-2" />
                                  Archivo {index + 1}
                                </a>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* Grade Section */}
                        <div className="border-t pt-6">
                          <h4 className="text-sm font-medium text-gray-700 mb-3">Calificación y retroalimentación:</h4>
                          
                          {submission.status === 'reviewed' ? (
                            <div className="bg-green-50 rounded-lg p-4">
                              <p className="text-sm text-gray-600 mb-2">
                                Calificado por: {submission.reviewed_by} el {new Date(submission.reviewed_at!).toLocaleDateString('es-ES')}
                              </p>
                              <p className="text-lg font-semibold text-green-700 mb-2">
                                Nota: {submission.grade}/100
                              </p>
                              {submission.feedback && (
                                <p className="text-gray-700">{submission.feedback}</p>
                              )}
                            </div>
                          ) : (
                            <GradeForm
                              groupId={submission.group_id}
                              onSubmit={handleGradeSubmission}
                            />
                          )}
                        </div>
                      </>
                    )}

                    {submission.status === 'pending' && (
                      <div className="text-center py-8 text-gray-500">
                        <Clock className="h-12 w-12 mx-auto mb-3 text-gray-300" />
                        <p>Este grupo aún no ha entregado su trabajo</p>
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      </div>
    </MainLayout>
  );
}

interface GradeFormProps {
  groupId: string;
  onSubmit: (groupId: string, grade: number, feedback: string) => void;
}

const GradeForm: React.FC<GradeFormProps> = ({ groupId, onSubmit }) => {
  const [grade, setGrade] = useState<number>(0);
  const [feedback, setFeedback] = useState<string>('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit(groupId, grade, feedback);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Calificación (0-100)
        </label>
        <input
          type="number"
          value={grade}
          onChange={(e) => setGrade(Number(e.target.value))}
          min="0"
          max="100"
          required
          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#fbbf24] focus:border-transparent"
        />
      </div>
      
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Retroalimentación
        </label>
        <textarea
          value={feedback}
          onChange={(e) => setFeedback(e.target.value)}
          rows={4}
          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#fbbf24] focus:border-transparent"
          placeholder="Escribe comentarios para el grupo..."
        />
      </div>
      
      <button
        type="submit"
        className="w-full px-4 py-2 bg-[#0a0a0a] text-white rounded-lg hover:bg-[#0a0a0a]/90 transition-colors"
      >
        Guardar calificación
      </button>
    </form>
  );
};