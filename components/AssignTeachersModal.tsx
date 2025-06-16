import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { toast } from 'react-hot-toast';
import { X, Search, User } from 'lucide-react';

interface User {
  id: string;
  email: string;
  first_name: string;
  last_name: string;
  school: string;
  approval_status: string;
  role?: string;
}

interface AssignTeachersModalProps {
  isOpen: boolean;
  onClose: () => void;
  courseId: string;
  courseTitle: string;
}

export default function AssignTeachersModal({ isOpen, onClose, courseId, courseTitle }: AssignTeachersModalProps) {
  const [teachers, setTeachers] = useState<User[]>([]);
  const [assignedUsers, setAssignedUsers] = useState<Set<string>>(new Set());
  const [selectedUsers, setSelectedUsers] = useState<Set<string>>(new Set());
  const [searchTerm, setSearchTerm] = useState('');
  const [loading, setLoading] = useState(true);
  const [assigning, setAssigning] = useState(false);

  // Fetch all approved teachers
  useEffect(() => {
    if (isOpen) {
      fetchTeachers();
      fetchAssignedTeachers();
    }
  }, [isOpen, courseId]);

  const fetchTeachers = async () => {
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('id, email, first_name, last_name, school, approval_status, role')
        .eq('approval_status', 'approved')
        .order('first_name');

      if (error) throw error;
      setTeachers(data || []);
    } catch (error) {
      console.error('Error fetching teachers:', error);
      toast.error('Error al cargar usuarios');
    } finally {
      setLoading(false);
    }
  };

  const fetchAssignedTeachers = async () => {
    try {
      // Get current user's session token
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) {
        throw new Error('No authentication token available');
      }

      const response = await fetch(`/api/admin/course-assignments?courseId=${courseId}`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${session.access_token}`
        }
      });

      const result = await response.json();
      if (!response.ok) {
        throw new Error(result.error || 'Failed to fetch assignments');
      }

      const assignedIds = new Set<string>(result.assignments?.map((a: any) => a.teacher_id as string) || []);
      setAssignedUsers(assignedIds);
    } catch (error) {
      console.error('Error fetching assigned teachers:', error);
    }
  };

  const handleTeacherToggle = (userId: string) => {
    const newSelected = new Set(selectedUsers);
    if (newSelected.has(userId)) {
      newSelected.delete(userId);
    } else {
      newSelected.add(userId);
    }
    setSelectedUsers(newSelected);
  };

  const handleAssignTeachers = async () => {
    if (selectedUsers.size === 0) {
      toast.error('Selecciona al menos un usuario');
      return;
    }

    setAssigning(true);
    try {
      // Get current user session token
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) {
        throw new Error('No authentication token available');
      }

      // Call admin API to assign teachers
      const response = await fetch('/api/admin/course-assignments', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`
        },
        body: JSON.stringify({
          courseId: courseId,
          teacherIds: Array.from(selectedUsers)
        })
      });

      const result = await response.json();
      if (!response.ok) {
        throw new Error(result.error || 'Failed to assign teachers');
      }

      toast.success(`Curso asignado a ${selectedUsers.size} usuario(s)`);
      
      // Update assigned users and clear selection
      const newAssigned = new Set(assignedUsers);
      selectedUsers.forEach(userId => newAssigned.add(userId));
      setAssignedUsers(newAssigned);
      setSelectedUsers(new Set());
      
    } catch (error: any) {
      console.error('Error assigning teachers:', error);
      toast.error('Error al asignar docentes: ' + error.message);
    } finally {
      setAssigning(false);
    }
  };

  const handleUnassignTeacher = async (teacherId: string) => {
    try {
      // Get current user session token
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) {
        throw new Error('No authentication token available');
      }

      // Call admin API to unassign teacher
      const response = await fetch('/api/admin/course-assignments', {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`
        },
        body: JSON.stringify({
          courseId: courseId,
          teacherId: teacherId
        })
      });

      const result = await response.json();
      if (!response.ok) {
        throw new Error(result.error || 'Failed to unassign teacher');
      }

      toast.success('Usuario desasignado del curso');
      
      // Update assigned users
      const newAssigned = new Set(assignedUsers);
      newAssigned.delete(teacherId);
      setAssignedUsers(newAssigned);
      
    } catch (error: any) {
      console.error('Error unassigning teacher:', error);
      toast.error('Error al desasignar usuario: ' + error.message);
    }
  };

  const filteredTeachers = teachers.filter(teacher => {
    const searchText = searchTerm.toLowerCase();
    return (
      teacher.first_name?.toLowerCase().includes(searchText) ||
      teacher.last_name?.toLowerCase().includes(searchText) ||
      teacher.email.toLowerCase().includes(searchText) ||
      teacher.school?.toLowerCase().includes(searchText)
    );
  });

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg max-w-2xl w-full max-h-[90vh] overflow-hidden">
        {/* Header */}
        <div className="p-6 border-b border-gray-200">
          <div className="flex justify-between items-center">
            <div>
              <h2 className="text-xl font-semibold text-gray-900">Asignar Usuarios</h2>
              <p className="text-sm text-gray-600 mt-1">Curso: {courseTitle}</p>
            </div>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600 transition-colors"
            >
              <X size={24} />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="p-6 max-h-[60vh] overflow-y-auto">
          {/* Search */}
          <div className="relative mb-4">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" size={20} />
            <input
              type="text"
              placeholder="Buscar usuarios..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>

          {loading ? (
            <div className="text-center py-8">
              <p className="text-gray-500">Cargando usuarios...</p>
            </div>
          ) : filteredTeachers.length === 0 ? (
            <div className="text-center py-8">
              <p className="text-gray-500">No se encontraron usuarios</p>
            </div>
          ) : (
            <div className="space-y-2">
              {filteredTeachers.map((teacher) => {
                const isAssigned = assignedUsers.has(teacher.id);
                const isSelected = selectedUsers.has(teacher.id);
                
                return (
                  <div key={teacher.id} className={`p-3 border rounded-lg ${isAssigned ? 'bg-green-50 border-green-200' : 'border-gray-200'}`}>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center space-x-3">
                        <div className="p-2 bg-gray-100 rounded-full">
                          <User size={16} className="text-gray-600" />
                        </div>
                        <div>
                          <p className="font-medium text-gray-900">
                            {teacher.first_name} {teacher.last_name}
                          </p>
                          <p className="text-sm text-gray-600">{teacher.email}</p>
                          <p className="text-xs text-gray-500">
                            {teacher.school} • {teacher.role === 'admin' ? 'Administrador' : 
                             teacher.role === 'consultor' ? 'Consultor' :
                             teacher.role === 'docente' ? 'Docente' :
                             teacher.role === 'equipo_directivo' ? 'Equipo Directivo' :
                             teacher.role === 'lider_generacion' ? 'Líder Generación' :
                             teacher.role === 'lider_comunidad' ? 'Líder Comunidad' : teacher.role}
                          </p>
                        </div>
                      </div>
                      
                      <div className="flex items-center space-x-2">
                        {isAssigned ? (
                          <div className="flex items-center space-x-2">
                            <span className="text-sm text-green-600 font-medium">Asignado</span>
                            <button
                              onClick={() => handleUnassignTeacher(teacher.id)}
                              className="px-3 py-1 text-xs text-red-600 border border-red-300 rounded hover:bg-red-50 transition-colors"
                            >
                              Desasignar
                            </button>
                          </div>
                        ) : (
                          <label className="flex items-center">
                            <input
                              type="checkbox"
                              checked={isSelected}
                              onChange={() => handleTeacherToggle(teacher.id)}
                              className="mr-2 h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                            />
                            <span className="text-sm text-gray-600">Seleccionar</span>
                          </label>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-6 border-t border-gray-200 bg-gray-50">
          <div className="flex justify-between items-center">
            <p className="text-sm text-gray-600">
              {selectedUsers.size} usuario(s) seleccionado(s)
            </p>
            <div className="flex space-x-3">
              <button
                onClick={onClose}
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
              >
                Cancelar
              </button>
              <button
                onClick={handleAssignTeachers}
                disabled={selectedUsers.size === 0 || assigning}
                className="px-4 py-2 text-sm font-medium text-white bg-blue-600 border border-transparent rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {assigning ? 'Asignando...' : `Asignar (${selectedUsers.size})`}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}