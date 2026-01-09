import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/router';
import { useSession, useSupabaseClient } from '@supabase/auth-helpers-react';
import { supabase } from '../lib/supabase';
import Head from 'next/head';
import { toast } from 'react-hot-toast';
import MainLayout from '../components/layout/MainLayout';
import { ResponsiveFunctionalPageHeader } from '../components/layout/FunctionalPageHeader';
import { assignmentService } from '../lib/services/assignments';
import { useAvatar } from '../hooks/useAvatar';
import { ClipboardCheckIcon as ClipboardDocumentCheckIcon } from '@heroicons/react/outline';

import { getUserPrimaryRole } from '../utils/roleUtils';
export default function AssignmentsPage() {
  const router = useRouter();
  const session = useSession();
  const supabase = useSupabaseClient();
  const [userProfile, setUserProfile] = useState<any>(null);
  const [userRole, setUserRole] = useState('');
  const [profileName, setProfileName] = useState('');
  const [isAdmin, setIsAdmin] = useState(false);
  const [assignments, setAssignments] = useState<any[]>([]);
  const [submissions, setSubmissions] = useState<Record<string, any>>({});
  const [searchQuery, setSearchQuery] = useState('');
  const [filterType, setFilterType] = useState('all');
  const [workStats, setWorkStats] = useState({ total: 0, active: 0, drafts: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'list' | 'grid'>('list');

  // Use avatar hook for performance
  const { url: avatarUrl } = useAvatar(userProfile?.avatar_url);

  // Permission helpers
  const isTeacher = ['admin', 'consultor', 'equipo_directivo', 'lider_generacion'].includes(userRole);
  const isStudent = ['lider_comunidad', 'docente'].includes(userRole);

  const loadAssignments = useCallback(async (userId: string, role: string) => {
    if (!supabase) return;

    try {
      const isTeacherRole = ['admin', 'consultor', 'equipo_directivo', 'lider_generacion'].includes(role);
      const isStudentRole = ['lider_comunidad', 'docente'].includes(role);
      let data: any[] = [];

      if (isTeacherRole) {
        data = await assignmentService.getAll(supabase, { created_by: userId });
        const activeAssignments = data?.filter((a: any) => a.is_published) || [];
        const draftAssignments = data?.filter((a: any) => !a.is_published) || [];
        setWorkStats({
          total: data?.length || 0,
          active: activeAssignments.length,
          drafts: draftAssignments.length,
        });
      } else if (isStudentRole) {
        data = await assignmentService.getStudentAssignments(supabase, userId);
        const assignmentIds = data?.map((a: any) => a.id) || [];
        if (assignmentIds.length > 0) {
          const { data: submissionData, error: submissionError } = await supabase
            .from('lesson_assignment_submissions')
            .select('*')
            .in('assignment_id', assignmentIds)
            .eq('student_id', userId);

          if (submissionError) throw submissionError;

          const subsByAssignment = (submissionData || []).reduce((acc: any, sub: any) => {
            acc[sub.assignment_id] = sub;
            return acc;
          }, {});
          setSubmissions(subsByAssignment);
        }
      }
      setAssignments(data || []);
    } catch (err: any) {
      console.error('Error loading assignments:', err);
      setError(err.message);
      toast.error('Error al cargar las tareas: ' + err.message);
    }
  }, [supabase]);

  useEffect(() => {
    const loadData = async () => {
      if (session) {
        setLoading(true);
        try {
          const { data: profile, error: profileError } = await supabase
            .from('profiles')
            .select('avatar_url, name')
            .eq('id', session.user.id)
            .single();

          if (profileError) throw profileError;

          if (profile) {
            setUserProfile(profile);
            const role = await getUserPrimaryRole(session.user.id);
            setUserRole(role);
            setProfileName(profile.name || session.user.email?.split('@')[0] || 'Usuario');
            setIsAdmin(role === 'admin');
            await loadAssignments(session.user.id, role);
          } else {
            toast.error('No se pudo encontrar el perfil del usuario.');
            setUserRole('docente'); // default role
            setProfileName(session.user.email?.split('@')[0] || 'Usuario');
          }
        } catch (err: any) {
          console.error('Error loading data:', err);
          setError(err.message);
          toast.error('Error al cargar los datos: ' + err.message);
        } finally {
          setLoading(false);
        }
      } else if (session === null) {
        router.push('/login');
      }
    };

    loadData();
  }, [session, supabase, router, loadAssignments]);

  const handleDeleteAssignment = async (id: string) => {
    if (window.confirm('¿Estás seguro de que quieres eliminar esta tarea?')) {
      try {
        await assignmentService.delete(supabase, id);
        toast.success('Tarea eliminada con éxito');
        if (session) {
          loadAssignments(session.user.id, userRole);
        }
      } catch (error: any) {
        toast.error('Error al eliminar la tarea: ' + error.message);
      }
    }
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    router.push('/login');
  };

  const filteredAssignments = assignments.filter(assignment => {
    const matchesSearch = assignment.title.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesType = filterType === 'all' || assignment.assignment_type === filterType;
    return matchesSearch && matchesType;
  });

  if (loading) {
    return <div className="flex justify-center items-center h-screen"><p>Cargando...</p></div>;
  }

  if (error) {
    return <div className="flex justify-center items-center h-screen"><p>Error: {error}</p></div>;
  }

  return (
    <>
      <Head>
        <title>Tareas - FNE</title>
      </Head>
      <MainLayout
        user={session?.user}
        currentPage="assignments"
        pageTitle=""
        isAdmin={isAdmin}
        onLogout={handleLogout}
        avatarUrl={avatarUrl}
      >
        <ResponsiveFunctionalPageHeader
          icon={<ClipboardDocumentCheckIcon className="h-6 w-6" />}
          title="Mis Tareas"
          subtitle={`Bienvenido de vuelta, ${profileName}`}
          primaryAction={isTeacher ? {
            label: 'Nueva Tarea',
            onClick: () => router.push('/assignments/new')
          } : undefined}
        />
        <div className="p-4 md:p-8">

          {isTeacher && (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
              <div className="p-4 bg-white rounded-lg shadow">
                <h3 className="text-lg font-semibold text-gray-700">Total de Tareas</h3>
                <p className="text-3xl font-bold">{workStats.total}</p>
              </div>
              <div className="p-4 bg-white rounded-lg shadow">
                <h3 className="text-lg font-semibold text-gray-700">Activas</h3>
                <p className="text-3xl font-bold">{workStats.active}</p>
              </div>
              <div className="p-4 bg-white rounded-lg shadow">
                <h3 className="text-lg font-semibold text-gray-700">Borradores</h3>
                <p className="text-3xl font-bold">{workStats.drafts}</p>
              </div>
            </div>
          )}

          <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
            <input
              type="text"
              placeholder="Buscar tareas..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="px-4 py-2 border rounded-lg w-full md:w-auto"
            />
            <div className="flex items-center gap-4">
              <select 
                value={filterType} 
                onChange={(e) => setFilterType(e.target.value)}
                className="px-4 py-2 border rounded-lg"
              >
                <option value="all">Todos los tipos</option>
                <option value="task">Tarea</option>
                <option value="quiz">Cuestionario</option>
                <option value="project">Proyecto</option>
              </select>
              <div className="flex items-center border rounded-lg p-1">
                <button onClick={() => setActiveTab('list')} className={`px-3 py-1 rounded ${activeTab === 'list' ? 'bg-blue-500 text-white' : ''}`}>Lista</button>
                <button onClick={() => setActiveTab('grid')} className={`px-3 py-1 rounded ${activeTab === 'grid' ? 'bg-blue-500 text-white' : ''}`}>Cuadrícula</button>
              </div>
            </div>
          </div>

          {activeTab === 'list' && (
            <div className="space-y-4">
              {filteredAssignments.length === 0 ? (
                <p>No se encontraron tareas.</p>
              ) : (
                filteredAssignments.map(assignment => {
                  const submission = submissions[assignment.id];
                  const isSubmitted = submission?.status === 'submitted' || submission?.status === 'graded';
                  const isOverdue = new Date(assignment.due_date) < new Date();
                  return (
                    <div key={assignment.id} className="p-4 bg-white rounded-lg shadow flex items-center justify-between">
                      <div className="flex items-center gap-4">
                        <ClipboardDocumentCheckIcon className="w-8 h-8 text-blue-500" />
                        <div>
                          <h4 className="font-bold text-lg text-gray-800 hover:text-blue-600 cursor-pointer" onClick={() => router.push(`/assignments/${assignment.id}`)}>{assignment.title}</h4>
                          <p className="text-sm text-gray-500">{assignment.courses.title}</p>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className={`font-semibold ${isOverdue && !isSubmitted ? 'text-red-600' : 'text-gray-700'}`}>
                          Vence: {new Date(assignment.due_date).toLocaleDateString()}
                        </p>
                        <p className={`text-sm ${submission ? 'text-green-600' : 'text-yellow-600'}`}>
                          {submission ? `Entregado (${submission.status})` : 'Pendiente'}
                        </p>
                      </div>
                      {isTeacher && (
                        <div className="flex gap-2">
                          <button onClick={() => router.push(`/assignments/${assignment.id}/edit`)} className="text-blue-600 hover:underline">Editar</button>
                          <button onClick={() => handleDeleteAssignment(assignment.id)} className="text-red-600 hover:underline">Eliminar</button>
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          )}

          {activeTab === 'grid' && (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {filteredAssignments.length === 0 ? (
                <p>No se encontraron tareas.</p>
              ) : (
                filteredAssignments.map(assignment => {
                  const submission = submissions[assignment.id];
                  const isSubmitted = submission?.status === 'submitted' || submission?.status === 'graded';
                  const isOverdue = new Date(assignment.due_date) < new Date();
                  return (
                    <div key={assignment.id} className="bg-white rounded-xl shadow-lg overflow-hidden flex flex-col justify-between p-5 relative">
                      <div className="mb-4">
                        <div className="flex justify-between items-start">
                          <h3 
                            className="font-bold text-lg text-gray-800 hover:text-blue-700 cursor-pointer transition-colors duration-200"
                            onClick={() => router.push(`/assignments/${assignment.id}`)}
                          >
                            {assignment.title}
                          </h3>
                          <span className={`px-2 py-1 text-xs font-semibold rounded-full ${assignment.is_published ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'}`}>
                            {assignment.is_published ? 'Publicado' : 'Borrador'}
                          </span>
                        </div>
                        <p className="text-sm text-gray-500 mt-1">{assignment.courses.title}</p>
                      </div>
                      
                      {assignment.assignment_type === 'group' && assignment.student_group && isStudent && (
                        <div className="mb-4 p-3 bg-blue-50 rounded-lg border border-blue-200">
                          <p className="text-xs font-medium text-blue-800 mb-2">Trabajo en grupo: {assignment.student_group.name}</p>
                          <div className="flex flex-wrap gap-2">
                            {assignment.student_group.members.map(member => (
                              <span key={member.user_id} className="text-xs px-2 py-1 bg-white rounded border border-gray-200">
                                {member.full_name}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}
                      
                      {assignment.assignment_type === 'group' && !assignment.student_group && isStudent && (
                        <div className="mb-4 p-3 bg-yellow-50 rounded-lg border border-yellow-200">
                          <p className="text-xs text-yellow-800">
                            ⚠️ No estás asignado a ningún grupo para esta tarea. Contacta a tu profesor.
                          </p>
                        </div>
                      )}
                      
                      <div className="flex flex-col gap-2">
                        <div className="flex justify-between items-center text-sm">
                          <span className="text-gray-500">{assignment.points || 0} puntos</span>
                          {assignment.due_date && (
                            <span className={`${isOverdue && !isSubmitted ? 'text-red-600 font-medium' : 'text-gray-500'}`}>
                              {isOverdue ? 'Venció: ' : 'Vence: '}
                              {new Date(assignment.due_date).toLocaleDateString('es-ES', {
                                day: 'numeric',
                                month: 'short',
                                year: 'numeric'
                              })}
                            </span>
                          )}
                        </div>
                        
                        {isStudent && submission && (
                          <div className="pt-2 border-t">
                            <div className="flex justify-between items-center">
                              <span className={`text-sm ${
                                submission.status === 'graded' ? 'text-green-600' : 
                                submission.status === 'submitted' ? 'text-blue-600' : 
                                'text-gray-500'
                              }`}>
                                {submission.submitted_at && 
                                  `Enviado: ${new Date(submission.submitted_at).toLocaleDateString('es-ES')}`
                                }
                              </span>
                              {submission.score !== null && (
                                <span className="text-sm font-medium">
                                  Nota: {submission.score}/{assignment.points}
                                </span>
                              )}
                            </div>
                          </div>
                        )}
                      </div>
                      
                      {/* Visual indicator for overdue assignments */}
                      {isOverdue && !isSubmitted && isStudent && (
                        <div className="absolute top-0 right-0 w-2 h-full bg-red-500"></div>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          )}

        </div>
      </MainLayout>
    </>
  );
}