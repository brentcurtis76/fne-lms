import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import { useAuth } from '../../../hooks/useAuth';
import { supabase } from '../../../lib/supabase';
import MainLayout from '../../../components/layout/MainLayout';
import {
  UserGroupIcon,
  ArrowLeftIcon,
  CalendarIcon,
  UsersIcon,
  PencilIcon,
  TrashIcon,
  PlusIcon,
  CheckCircleIcon,
  ClockIcon,
  AcademicCapIcon,
  ArchiveIcon as ArchiveBoxIcon,
  DocumentTextIcon,
  ChartBarIcon,
  ChatAltIcon as ChatBubbleLeftRightIcon,
  XIcon as XMarkIcon
} from '@heroicons/react/outline';
import { 
  getAssignmentInstance, 
  updateAssignmentInstance, 
  getEnrolledStudentsForInstance,
  updateAssignmentGroups,
  activateAssignmentInstance,
  archiveAssignmentInstance
} from '../../../lib/services/assignmentInstances';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import Link from 'next/link';

interface Student {
  id: string;
  full_name: string;
  email: string;
  role: string;
}

interface Group {
  id: string;
  name: string;
  members: Student[];
}

interface AssignmentDetails {
  id: string;
  title: string;
  description?: string;
  instructions?: string;
  due_date?: string;
  start_date?: string;
  status: string;
  cohort_name?: string;
  groups: Group[];
  assignment_templates: {
    title: string;
    description?: string;
    instructions?: string;
    assignment_type: string;
    min_group_size: number;
    max_group_size: number;
    lessons: {
      id: string;
      title: string;
      modules: {
        id: string;
        title: string;
        course_id: string;
        courses: {
          id: string;
          title: string;
        };
      };
    };
  };
  profiles: {
    full_name: string;
  };
}

export default function GroupAssignmentDetail() {
  const router = useRouter();
  const { id } = router.query;
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [assignment, setAssignment] = useState<AssignmentDetails | null>(null);
  const [enrolledStudents, setEnrolledStudents] = useState<Student[]>([]);
  const [groups, setGroups] = useState<Group[]>([]);
  const [isEditingGroups, setIsEditingGroups] = useState(false);
  const [newGroupName, setNewGroupName] = useState('');
  const [saving, setSaving] = useState(false);

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
      
      setAssignment(assignmentData);
      setGroups(assignmentData.groups || []);
      
      // Fetch enrolled students
      const { data: studentsData, error: studentsError } = await getEnrolledStudentsForInstance(id as string);
      if (studentsError) throw studentsError;
      
      setEnrolledStudents(studentsData || []);
    } catch (error) {
      console.error('Error fetching assignment details:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleAddGroup = () => {
    if (!newGroupName.trim()) return;
    
    const newGroup: Group = {
      id: `group-${Date.now()}`,
      name: newGroupName.trim(),
      members: []
    };
    
    setGroups([...groups, newGroup]);
    setNewGroupName('');
  };

  const handleRemoveGroup = (groupId: string) => {
    const group = groups.find(g => g.id === groupId);
    if (group && group.members.length === 0) {
      setGroups(groups.filter(g => g.id !== groupId));
    }
  };

  const handleAddStudentToGroup = (groupId: string, studentId: string) => {
    const student = enrolledStudents.find(s => s.id === studentId);
    if (!student) return;
    
    // Remove student from any existing group
    const updatedGroups = groups.map(group => ({
      ...group,
      members: group.members.filter(m => m.id !== studentId)
    }));
    
    // Add student to new group
    const targetGroupIndex = updatedGroups.findIndex(g => g.id === groupId);
    if (targetGroupIndex !== -1) {
      updatedGroups[targetGroupIndex].members.push(student);
    }
    
    setGroups(updatedGroups);
  };

  const handleRemoveStudentFromGroup = (groupId: string, studentId: string) => {
    setGroups(groups.map(group => {
      if (group.id === groupId) {
        return {
          ...group,
          members: group.members.filter(m => m.id !== studentId)
        };
      }
      return group;
    }));
  };

  const handleSaveGroups = async () => {
    setSaving(true);
    try {
      const { error } = await updateAssignmentGroups(id as string, groups);
      if (error) throw error;
      
      await fetchAssignmentDetails();
      setIsEditingGroups(false);
    } catch (error) {
      console.error('Error saving groups:', error);
      alert('Error al guardar los grupos');
    } finally {
      setSaving(false);
    }
  };

  const handleActivate = async () => {
    if (!confirm('¿Estás seguro de activar esta tarea? Los estudiantes podrán verla y trabajar en ella.')) {
      return;
    }
    
    try {
      const { error } = await activateAssignmentInstance(id as string);
      if (error) throw error;
      
      await fetchAssignmentDetails();
    } catch (error) {
      console.error('Error activating assignment:', error);
      alert('Error al activar la tarea');
    }
  };

  const handleArchive = async () => {
    if (!confirm('¿Estás seguro de archivar esta tarea? Ya no estará visible para los estudiantes.')) {
      return;
    }
    
    try {
      const { error } = await archiveAssignmentInstance(id as string);
      if (error) throw error;
      
      await fetchAssignmentDetails();
    } catch (error) {
      console.error('Error archiving assignment:', error);
      alert('Error al archivar la tarea');
    }
  };

  const getUnassignedStudents = () => {
    const assignedStudentIds = new Set(
      groups.flatMap(g => g.members.map(m => m.id))
    );
    
    return enrolledStudents.filter(s => !assignedStudentIds.has(s.id));
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'draft':
        return <ClockIcon className="h-5 w-5 text-gray-400" />;
      case 'active':
        return <CheckCircleIcon className="h-5 w-5 text-green-500" />;
      case 'completed':
        return <AcademicCapIcon className="h-5 w-5 text-blue-500" />;
      case 'archived':
        return <ArchiveBoxIcon className="h-5 w-5 text-gray-400" />;
      default:
        return <ClockIcon className="h-5 w-5 text-gray-400" />;
    }
  };

  const getStatusLabel = (status: string) => {
    switch (status) {
      case 'draft':
        return 'Borrador';
      case 'active':
        return 'Activa';
      case 'completed':
        return 'Completada';
      case 'archived':
        return 'Archivada';
      default:
        return status;
    }
  };

  if (loading) {
    return (
      <MainLayout user={user} currentPage="group-assignments">
        <div className="max-w-6xl mx-auto px-4 py-8">
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
      <MainLayout user={user} currentPage="group-assignments">
        <div className="max-w-6xl mx-auto px-4 py-8">
          <div className="text-center py-12">
            <p className="text-gray-600">Tarea no encontrada</p>
          </div>
        </div>
      </MainLayout>
    );
  }

  return (
    <MainLayout user={user} currentPage="group-assignments">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="mb-8">
          <button
            onClick={() => router.push('/group-assignments')}
            className="mb-4 text-gray-600 hover:text-gray-900 flex items-center"
          >
            <ArrowLeftIcon className="h-5 w-5 mr-2" />
            Volver a tareas grupales
          </button>
          
          <div className="flex items-start justify-between">
            <div>
              <div className="flex items-center mb-2">
                <UserGroupIcon className="h-8 w-8 mr-3 text-[#00365b]" />
                <h1 className="text-3xl font-bold text-gray-900">
                  {assignment.title}
                </h1>
                <div className="ml-4 flex items-center space-x-2">
                  {getStatusIcon(assignment.status)}
                  <span className="text-sm font-medium text-gray-600">
                    {getStatusLabel(assignment.status)}
                  </span>
                </div>
              </div>
              <div className="text-sm text-gray-600 space-y-1">
                <p>{assignment.assignment_templates.lessons.modules.courses.title} → {assignment.assignment_templates.lessons.modules.title} → {assignment.assignment_templates.lessons.title}</p>
                <p>Creado por: {assignment.profiles.full_name}</p>
              </div>
            </div>
            
            <div className="flex space-x-2">
              {assignment.status === 'draft' && (
                <button
                  onClick={handleActivate}
                  className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors flex items-center"
                >
                  <CheckCircleIcon className="h-5 w-5 mr-2" />
                  Activar
                </button>
              )}
              {assignment.status === 'active' && (
                <button
                  onClick={handleArchive}
                  className="px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 transition-colors flex items-center"
                >
                  <ArchiveBoxIcon className="h-5 w-5 mr-2" />
                  Archivar
                </button>
              )}
              <Link
                href={`/group-assignments/${id}/edit`}
                className="px-4 py-2 bg-[#00365b] text-white rounded-lg hover:bg-[#004a7a] transition-colors flex items-center"
              >
                <PencilIcon className="h-5 w-5 mr-2" />
                Editar
              </Link>
            </div>
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

            {/* Groups Management */}
            <div className="bg-white rounded-lg shadow p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-semibold text-gray-900 flex items-center">
                  <UsersIcon className="h-5 w-5 mr-2 text-[#00365b]" />
                  Grupos ({groups.length})
                </h2>
                {!isEditingGroups ? (
                  <button
                    onClick={() => setIsEditingGroups(true)}
                    className="text-sm text-[#00365b] hover:text-[#004a7a] font-medium"
                  >
                    Editar Grupos
                  </button>
                ) : (
                  <div className="flex space-x-2">
                    <button
                      onClick={() => {
                        setGroups(assignment.groups || []);
                        setIsEditingGroups(false);
                      }}
                      className="text-sm text-gray-600 hover:text-gray-800"
                    >
                      Cancelar
                    </button>
                    <button
                      onClick={handleSaveGroups}
                      disabled={saving}
                      className="text-sm bg-[#00365b] text-white px-3 py-1 rounded hover:bg-[#004a7a] disabled:opacity-50"
                    >
                      {saving ? 'Guardando...' : 'Guardar Cambios'}
                    </button>
                  </div>
                )}
              </div>

              {isEditingGroups && (
                <div className="mb-4">
                  <div className="flex space-x-2">
                    <input
                      type="text"
                      value={newGroupName}
                      onChange={(e) => setNewGroupName(e.target.value)}
                      placeholder="Nombre del nuevo grupo"
                      className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#00365b] focus:border-transparent"
                      onKeyPress={(e) => e.key === 'Enter' && handleAddGroup()}
                    />
                    <button
                      onClick={handleAddGroup}
                      className="px-4 py-2 bg-[#00365b] text-white rounded-lg hover:bg-[#004a7a] transition-colors"
                    >
                      <PlusIcon className="h-5 w-5" />
                    </button>
                  </div>
                </div>
              )}

              {groups.length === 0 ? (
                <div className="text-center py-8 text-gray-500">
                  <UsersIcon className="h-12 w-12 mx-auto mb-2 text-gray-300" />
                  <p>No hay grupos creados aún</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {groups.map((group) => (
                    <div key={group.id} className="border border-gray-200 rounded-lg p-4">
                      <div className="flex items-center justify-between mb-3">
                        <h3 className="font-medium text-gray-900">{group.name}</h3>
                        <div className="flex items-center space-x-2">
                          <span className="text-sm text-gray-500">
                            {group.members.length} miembros
                          </span>
                          {isEditingGroups && group.members.length === 0 && (
                            <button
                              onClick={() => handleRemoveGroup(group.id)}
                              className="text-red-600 hover:text-red-800"
                            >
                              <TrashIcon className="h-4 w-4" />
                            </button>
                          )}
                        </div>
                      </div>
                      
                      <div className="space-y-2">
                        {group.members.map((member) => (
                          <div key={member.id} className="flex items-center justify-between py-1">
                            <div className="text-sm">
                              <p className="font-medium text-gray-900">{member.full_name}</p>
                              <p className="text-gray-500">{member.email}</p>
                            </div>
                            {isEditingGroups && (
                              <button
                                onClick={() => handleRemoveStudentFromGroup(group.id, member.id)}
                                className="text-red-600 hover:text-red-800"
                              >
                                <XMarkIcon className="h-4 w-4" />
                              </button>
                            )}
                          </div>
                        ))}
                      </div>
                      
                      {isEditingGroups && (
                        <div className="mt-3">
                          <select
                            onChange={(e) => {
                              if (e.target.value) {
                                handleAddStudentToGroup(group.id, e.target.value);
                                e.target.value = '';
                              }
                            }}
                            className="w-full text-sm px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#00365b] focus:border-transparent"
                          >
                            <option value="">Agregar estudiante al grupo...</option>
                            {getUnassignedStudents().map((student) => (
                              <option key={student.id} value={student.id}>
                                {student.full_name} ({student.email})
                              </option>
                            ))}
                          </select>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {isEditingGroups && getUnassignedStudents().length > 0 && (
                <div className="mt-4 p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
                  <p className="text-sm text-yellow-800">
                    <strong>{getUnassignedStudents().length} estudiantes</strong> no están asignados a ningún grupo
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* Sidebar */}
          <div className="space-y-6">
            {/* Details Card */}
            <div className="bg-white rounded-lg shadow p-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">Detalles</h2>
              
              <div className="space-y-3">
                {assignment.cohort_name && (
                  <div>
                    <p className="text-sm text-gray-500">Cohorte</p>
                    <p className="font-medium">{assignment.cohort_name}</p>
                  </div>
                )}
                
                {assignment.start_date && (
                  <div>
                    <p className="text-sm text-gray-500">Fecha de inicio</p>
                    <p className="font-medium">
                      {format(new Date(assignment.start_date), "d 'de' MMMM, yyyy 'a las' HH:mm", { locale: es })}
                    </p>
                  </div>
                )}
                
                {assignment.due_date && (
                  <div>
                    <p className="text-sm text-gray-500">Fecha de entrega</p>
                    <p className="font-medium">
                      {format(new Date(assignment.due_date), "d 'de' MMMM, yyyy 'a las' HH:mm", { locale: es })}
                    </p>
                  </div>
                )}
                
                <div>
                  <p className="text-sm text-gray-500">Tamaño de grupo</p>
                  <p className="font-medium">
                    {assignment.assignment_templates.min_group_size} - {assignment.assignment_templates.max_group_size} miembros
                  </p>
                </div>
              </div>
            </div>

            {/* Quick Actions */}
            <div className="bg-white rounded-lg shadow p-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">Acciones Rápidas</h2>
              
              <div className="space-y-2">
                <Link
                  href={`/group-assignments/${id}/submissions`}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors flex items-center justify-center"
                >
                  <DocumentTextIcon className="h-5 w-5 mr-2" />
                  Ver Entregas
                </Link>
                
                <Link
                  href={`/group-assignments/${id}/statistics`}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors flex items-center justify-center"
                >
                  <ChartBarIcon className="h-5 w-5 mr-2" />
                  Ver Estadísticas
                </Link>
                
                <button
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors flex items-center justify-center text-gray-400 cursor-not-allowed"
                  disabled
                >
                  <ChatBubbleLeftRightIcon className="h-5 w-5 mr-2" />
                  Mensajes (Próximamente)
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </MainLayout>
  );
}