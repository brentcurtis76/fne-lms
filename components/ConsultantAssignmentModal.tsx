import React, { useState, useEffect } from 'react';
import { toast } from 'react-hot-toast';
import { supabase } from '../lib/supabase';

interface User {
  id: string;
  first_name: string;
  last_name: string;
  email: string;
  role: string;
  school_id?: string;
  generation_id?: string;
  community_id?: string;
  school?: { id: string; name: string };
  generation?: { id: string; name: string };
  community?: { id: string; name: string };
}

interface OrganizationalUnit {
  id: string;
  name: string;
  school_id?: string;
  generation_id?: string;
  school?: { id: string; name: string };
  generation?: { id: string; name: string };
}

interface ConsultantAssignmentModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAssignmentCreated: () => void;
  editingAssignment?: any;
}

const ConsultantAssignmentModal: React.FC<ConsultantAssignmentModalProps> = ({
  isOpen,
  onClose,
  onAssignmentCreated,
  editingAssignment
}) => {
  // Form state
  const [formData, setFormData] = useState({
    consultant_id: '',
    student_id: '',
    assignment_type: 'monitoring',
    can_view_progress: true,
    can_assign_courses: false,
    can_message_student: true,
    school_id: '',
    generation_id: '',
    community_id: '',
    starts_at: '',
    ends_at: '',
    assignment_data: {}
  });

  // Data options
  const [consultants, setConsultants] = useState<User[]>([]);
  const [students, setStudents] = useState<User[]>([]);
  const [schools, setSchools] = useState<OrganizationalUnit[]>([]);
  const [generations, setGenerations] = useState<OrganizationalUnit[]>([]);
  const [communities, setCommunities] = useState<OrganizationalUnit[]>([]);

  // UI state
  const [loading, setLoading] = useState(false);
  const [dataLoading, setDataLoading] = useState(true);

  // Assignment type descriptions
  const assignmentTypes = [
    {
      value: 'monitoring',
      label: 'Monitoreo',
      description: 'Seguimiento regular del progreso del estudiante'
    },
    {
      value: 'mentoring',
      label: 'Mentoría',
      description: 'Relación directa de mentoría y guía personalizada'
    },
    {
      value: 'evaluation',
      label: 'Evaluación',
      description: 'Supervisión y evaluación del rendimiento'
    },
    {
      value: 'support',
      label: 'Apoyo',
      description: 'Soporte académico y profesional específico'
    }
  ];

  useEffect(() => {
    if (isOpen) {
      fetchData();
      if (editingAssignment) {
        populateFormForEditing();
      } else {
        resetForm();
      }
    }
  }, [isOpen, editingAssignment]);

  const fetchData = async () => {
    setDataLoading(true);
    try {
      const { data: { session }, error: sessionError } = await supabase.auth.getSession();
      
      if (sessionError || !session?.access_token) {
        toast.error('Error de autenticación');
        setDataLoading(false);
        return;
      }

      const response = await fetch('/api/admin/consultant-assignment-users', {
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
          'Content-Type': 'application/json'
        }
      });

      if (!response.ok) {
        throw new Error('Failed to fetch assignment data');
      }

      const data = await response.json();
      setConsultants(data.consultants || []);
      setStudents(data.students || []);
      setSchools(data.schools || []);
      setGenerations(data.generations || []);
      setCommunities(data.communities || []);
    } catch (error) {
      console.error('Error fetching assignment data:', error);
      toast.error('Error al cargar datos de asignación');
    } finally {
      setDataLoading(false);
    }
  };

  const populateFormForEditing = () => {
    if (editingAssignment) {
      setFormData({
        consultant_id: editingAssignment.consultant_id || '',
        student_id: editingAssignment.student_id || '',
        assignment_type: editingAssignment.assignment_type || 'monitoring',
        can_view_progress: editingAssignment.can_view_progress ?? true,
        can_assign_courses: editingAssignment.can_assign_courses ?? false,
        can_message_student: editingAssignment.can_message_student ?? true,
        school_id: editingAssignment.school_id || '',
        generation_id: editingAssignment.generation_id || '',
        community_id: editingAssignment.community_id || '',
        starts_at: editingAssignment.starts_at ? 
          new Date(editingAssignment.starts_at).toISOString().slice(0, 16) : '',
        ends_at: editingAssignment.ends_at ? 
          new Date(editingAssignment.ends_at).toISOString().slice(0, 16) : '',
        assignment_data: editingAssignment.assignment_data || {}
      });
    }
  };

  const resetForm = () => {
    setFormData({
      consultant_id: '',
      student_id: '',
      assignment_type: 'monitoring',
      can_view_progress: true,
      can_assign_courses: false,
      can_message_student: true,
      school_id: '',
      generation_id: '',
      community_id: '',
      starts_at: new Date().toISOString().slice(0, 16),
      ends_at: '',
      assignment_data: {}
    });
  };

  const handleInputChange = (field: string, value: any) => {
    setFormData(prev => ({
      ...prev,
      [field]: value
    }));

    // Clear dependent fields when parent changes
    if (field === 'school_id') {
      setFormData(prev => ({
        ...prev,
        generation_id: '',
        community_id: ''
      }));
    } else if (field === 'generation_id') {
      setFormData(prev => ({
        ...prev,
        community_id: ''
      }));
    }
  };

  const getFilteredGenerations = () => {
    if (!formData.school_id) return generations;
    return generations.filter(g => g.school_id?.toString() === formData.school_id);
  };

  const getFilteredCommunities = () => {
    if (!formData.generation_id) return communities;
    return communities.filter(c => c.generation_id === formData.generation_id);
  };

  const validateForm = () => {
    if (!formData.consultant_id) {
      toast.error('Debe seleccionar un consultor');
      return false;
    }
    if (!formData.student_id) {
      toast.error('Debe seleccionar un estudiante');
      return false;
    }
    if (formData.consultant_id === formData.student_id) {
      toast.error('El consultor no puede asignarse a sí mismo');
      return false;
    }
    if (formData.ends_at && formData.starts_at && formData.ends_at <= formData.starts_at) {
      toast.error('La fecha de finalización debe ser posterior a la fecha de inicio');
      return false;
    }
    return true;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!validateForm()) return;

    setLoading(true);
    try {
      const { data: { session }, error: sessionError } = await supabase.auth.getSession();
      
      if (sessionError || !session?.access_token) {
        toast.error('Error de autenticación');
        setLoading(false);
        return;
      }

      const url = editingAssignment 
        ? '/api/admin/consultant-assignments'
        : '/api/admin/consultant-assignments';
      
      const method = editingAssignment ? 'PUT' : 'POST';
      const payload = editingAssignment 
        ? { ...formData, id: editingAssignment.id }
        : formData;

      const response = await fetch(url, {
        method,
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          ...payload,
          starts_at: payload.starts_at || null,
          ends_at: payload.ends_at || null,
          school_id: payload.school_id || null,
          generation_id: payload.generation_id || null,
          community_id: payload.community_id || null,
        })
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || 'Failed to save assignment');
      }

      toast.success(editingAssignment ? 'Asignación actualizada exitosamente' : 'Asignación creada exitosamente');
      onAssignmentCreated();
      onClose();
    } catch (error) {
      console.error('Error saving assignment:', error);
      toast.error('Error al guardar la asignación');
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg max-w-4xl w-full max-h-[90vh] overflow-y-auto">
        <div className="p-6">
          <div className="flex justify-between items-center mb-6">
            <h2 className="text-2xl font-bold text-[#00365b]">
              {editingAssignment ? 'Editar Asignación de Consultor' : 'Nueva Asignación de Consultor'}
            </h2>
            <button
              onClick={onClose}
              className="text-gray-500 hover:text-gray-700"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {dataLoading ? (
            <div className="flex justify-center items-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#00365b]"></div>
              <span className="ml-2">Cargando datos...</span>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-6">
              {/* Consultant and Student Selection */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Consultor *
                  </label>
                  <select
                    value={formData.consultant_id}
                    onChange={(e) => handleInputChange('consultant_id', e.target.value)}
                    className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#fdb933] focus:border-transparent"
                    required
                  >
                    <option value="">Seleccionar consultor...</option>
                    {consultants.map(consultant => (
                      <option key={consultant.id} value={consultant.id}>
                        {consultant.first_name} {consultant.last_name} ({consultant.email})
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Estudiante/Docente *
                  </label>
                  <select
                    value={formData.student_id}
                    onChange={(e) => handleInputChange('student_id', e.target.value)}
                    className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#fdb933] focus:border-transparent"
                    required
                  >
                    <option value="">Seleccionar estudiante...</option>
                    {students.map(student => (
                      <option key={student.id} value={student.id}>
                        {student.first_name} {student.last_name} ({student.email})
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Assignment Type */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Tipo de Asignación *
                </label>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {assignmentTypes.map(type => (
                    <div
                      key={type.value}
                      className={`p-4 border rounded-lg cursor-pointer transition-colors ${
                        formData.assignment_type === type.value
                          ? 'border-[#fdb933] bg-[#fdb933]/10'
                          : 'border-gray-300 hover:border-[#fdb933]/50'
                      }`}
                      onClick={() => handleInputChange('assignment_type', type.value)}
                    >
                      <div className="flex items-center mb-2">
                        <input
                          type="radio"
                          name="assignment_type"
                          value={type.value}
                          checked={formData.assignment_type === type.value}
                          onChange={() => handleInputChange('assignment_type', type.value)}
                          className="mr-2"
                        />
                        <span className="font-medium">{type.label}</span>
                      </div>
                      <p className="text-sm text-gray-600">{type.description}</p>
                    </div>
                  ))}
                </div>
              </div>

              {/* Permissions */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-3">
                  Permisos de Asignación
                </label>
                <div className="space-y-3">
                  <label className="flex items-center">
                    <input
                      type="checkbox"
                      checked={formData.can_view_progress}
                      onChange={(e) => handleInputChange('can_view_progress', e.target.checked)}
                      className="mr-3 h-4 w-4 text-[#fdb933] focus:ring-[#fdb933] border-gray-300 rounded"
                    />
                    <span className="text-sm">Puede ver progreso del estudiante</span>
                  </label>
                  <label className="flex items-center">
                    <input
                      type="checkbox"
                      checked={formData.can_assign_courses}
                      onChange={(e) => handleInputChange('can_assign_courses', e.target.checked)}
                      className="mr-3 h-4 w-4 text-[#fdb933] focus:ring-[#fdb933] border-gray-300 rounded"
                    />
                    <span className="text-sm">Puede asignar cursos al estudiante</span>
                  </label>
                  <label className="flex items-center">
                    <input
                      type="checkbox"
                      checked={formData.can_message_student}
                      onChange={(e) => handleInputChange('can_message_student', e.target.checked)}
                      className="mr-3 h-4 w-4 text-[#fdb933] focus:ring-[#fdb933] border-gray-300 rounded"
                    />
                    <span className="text-sm">Puede enviar mensajes al estudiante</span>
                  </label>
                </div>
              </div>

              {/* Time Bounds */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-3">
                  Duración de la Asignación
                </label>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm text-gray-600 mb-1">Fecha de inicio</label>
                    <input
                      type="datetime-local"
                      value={formData.starts_at}
                      onChange={(e) => handleInputChange('starts_at', e.target.value)}
                      className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#fdb933] focus:border-transparent"
                    />
                  </div>
                  <div>
                    <label className="block text-sm text-gray-600 mb-1">Fecha de finalización (opcional)</label>
                    <input
                      type="datetime-local"
                      value={formData.ends_at}
                      onChange={(e) => handleInputChange('ends_at', e.target.value)}
                      className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#fdb933] focus:border-transparent"
                    />
                  </div>
                </div>
              </div>

              {/* Organizational Scope */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-3">
                  Alcance Organizacional (Opcional)
                </label>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div>
                    <label className="block text-sm text-gray-600 mb-1">Escuela</label>
                    <select
                      value={formData.school_id}
                      onChange={(e) => handleInputChange('school_id', e.target.value)}
                      className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#fdb933] focus:border-transparent"
                    >
                      <option value="">Todas las escuelas</option>
                      {schools.map(school => (
                        <option key={school.id} value={school.id}>
                          {school.name}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm text-gray-600 mb-1">Generación</label>
                    <select
                      value={formData.generation_id}
                      onChange={(e) => handleInputChange('generation_id', e.target.value)}
                      className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#fdb933] focus:border-transparent"
                      disabled={!formData.school_id}
                    >
                      <option value="">Todas las generaciones</option>
                      {getFilteredGenerations().map(generation => (
                        <option key={generation.id} value={generation.id}>
                          {generation.name}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm text-gray-600 mb-1">Comunidad</label>
                    <select
                      value={formData.community_id}
                      onChange={(e) => handleInputChange('community_id', e.target.value)}
                      className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#fdb933] focus:border-transparent"
                      disabled={!formData.generation_id}
                    >
                      <option value="">Todas las comunidades</option>
                      {getFilteredCommunities().map(community => (
                        <option key={community.id} value={community.id}>
                          {community.name}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
                <p className="text-sm text-gray-500 mt-2">
                  El alcance organizacional limita qué datos puede ver el consultor para este estudiante específico.
                </p>
              </div>

              {/* Submit Buttons */}
              <div className="flex justify-end space-x-4 pt-6 border-t">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-6 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 transition-colors"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className="px-6 py-2 bg-[#fdb933] text-white rounded-lg hover:bg-[#e6a42e] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {loading ? 'Guardando...' : editingAssignment ? 'Actualizar Asignación' : 'Crear Asignación'}
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
};

export default ConsultantAssignmentModal;