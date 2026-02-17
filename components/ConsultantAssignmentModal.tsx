import { useSupabaseClient } from '@supabase/auth-helpers-react';
import React, { useState, useEffect } from 'react';
import { toast } from 'react-hot-toast';
import { AlertTriangle } from 'lucide-react';

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

interface School {
  id: string;
  name: string;
  has_generations?: boolean;
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
  preselectedUser?: User; // Add this for when opened from user row
}

const ConsultantAssignmentModal: React.FC<ConsultantAssignmentModalProps> = ({
  isOpen,
  onClose,
  onAssignmentCreated,
  editingAssignment
}) => {
  const supabase = useSupabaseClient();
  // Check if we're in user context (opened from user row)
  const isUserContext = editingAssignment?.student_id && editingAssignment?.student;
  const fixedUser = isUserContext ? editingAssignment.student : null;
  // Form state
  const [formData, setFormData] = useState({
    consultant_id: '',
    assignment_scope: 'individual', // 'individual', 'community', 'generation', 'school'
    student_id: '',
    school_id: '',
    generation_id: '',
    community_id: '',
    can_assign_courses: false,
    has_end_date: false,
    ends_at: ''
  });

  // Data options
  const [consultants, setConsultants] = useState<User[]>([]);
  const [students, setStudents] = useState<User[]>([]);
  const [schools, setSchools] = useState<School[]>([]);
  const [generations, setGenerations] = useState<OrganizationalUnit[]>([]);
  const [communities, setCommunities] = useState<OrganizationalUnit[]>([]);

  // UI state
  const [loading, setLoading] = useState(false);
  const [dataLoading, setDataLoading] = useState(true);

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
      // If we have a student_id, this was opened from a user row
      const isUserContext = !!editingAssignment.student_id;
      
      // Determine assignment scope based on what fields are populated
      let scope = 'individual';
      if (editingAssignment.community_id) scope = 'community';
      else if (editingAssignment.generation_id) scope = 'generation';
      else if (editingAssignment.school_id && !editingAssignment.student_id) scope = 'school';

      setFormData({
        consultant_id: editingAssignment.consultant_id || '',
        assignment_scope: scope,
        student_id: editingAssignment.student_id || editingAssignment.student?.id || '',
        school_id: editingAssignment.school_id || '',
        generation_id: editingAssignment.generation_id || '',
        community_id: editingAssignment.community_id || '',
        can_assign_courses: editingAssignment.can_assign_courses ?? false,
        has_end_date: !!editingAssignment.ends_at,
        ends_at: editingAssignment.ends_at ? (() => {
          const d = new Date(editingAssignment.ends_at);
          const year = d.getFullYear();
          const month = String(d.getMonth() + 1).padStart(2, '0');
          const day = String(d.getDate()).padStart(2, '0');
          const hours = String(d.getHours()).padStart(2, '0');
          const minutes = String(d.getMinutes()).padStart(2, '0');
          return `${year}-${month}-${day}T${hours}:${minutes}`;
        })() : ''
      });
      
      // If we have a user context, populate their school and community
      if (isUserContext && editingAssignment.student_id) {
        const student = students.find(s => s.id === editingAssignment.student_id);
        if (student) {
          handleInputChange('student_id', student.id);
        }
      }
    }
  };

  const resetForm = () => {
    setFormData({
      consultant_id: '',
      assignment_scope: 'individual',
      student_id: '',
      school_id: '',
      generation_id: '',
      community_id: '',
      can_assign_courses: false,
      has_end_date: false,
      ends_at: ''
    });
  };

  const handleInputChange = (field: string, value: any) => {
    // Handle scope changes intelligently
    if (field === 'assignment_scope') {
      // If we have a fixed user, always keep their data and populate accordingly
      if (fixedUser) {
        const student = students.find(s => s.id === fixedUser.id) || fixedUser;
        let schoolId = student.school_id || student.school?.id;
        let communityId = student.community_id || student.community?.id;
        
        // Ensure school and community exist in lists
        if (schoolId) {
          const schoolExists = schools.some(s => String(s.id) === String(schoolId));
          if (!schoolExists && student.school) {
            setSchools(prev => [...prev, {
              id: String(schoolId),
              name: student.school.name || 'Escuela del usuario',
              has_generations: false
            }]);
          }
        }
        
        if (communityId) {
          const communityExists = communities.some(c => String(c.id) === String(communityId));
          if (!communityExists) {
            console.warn('Community ID exists on fixed user but not in database:', communityId);
            // Don't set the community_id if it doesn't exist in the database
            communityId = null;
          }
        }
        
        // Update form based on scope but always keep user data
        setFormData(prev => ({
          ...prev,
          [field]: value,
          student_id: fixedUser.id,
          school_id: schoolId ? String(schoolId) : '',
          community_id: communityId ? String(communityId) : '',
          generation_id: student.generation_id ? String(student.generation_id) : ''
        }));
        return;
      }
      
      // Original logic for when there's no fixed user
      if (value === 'individual') {
        setFormData(prev => ({
          ...prev,
          [field]: value,
          school_id: '',
          generation_id: '',
          community_id: ''
        }));
      } else if (value === 'school') {
        setFormData(prev => ({
          ...prev,
          [field]: value,
          student_id: '',
          generation_id: '',
          community_id: ''
        }));
      } else if (value === 'generation') {
        setFormData(prev => ({
          ...prev,
          [field]: value,
          student_id: '',
          community_id: ''
        }));
      } else if (value === 'community') {
        setFormData(prev => ({
          ...prev,
          [field]: value,
          student_id: ''
        }));
      }
      return;
    }
    
    // When selecting a student, auto-populate their school and community
    if (field === 'student_id' && value) {
      const selectedStudent = students.find(s => s.id === value);

      if (selectedStudent) {
        // Get school_id from either direct field or from school object
        let schoolId = selectedStudent.school_id || selectedStudent.school?.id;
        let communityId = selectedStudent.community_id || selectedStudent.community?.id;

        // Check if the school exists in our schools list
        const schoolExists = schools.some(s => s.id === schoolId || s.id === String(schoolId));
        const communityExists = communities.some(c => c.id === communityId || c.id === String(communityId));

        // If school doesn't exist in the list, add it temporarily
        if (schoolId && !schoolExists && selectedStudent.school) {
          const tempSchool = {
            id: String(schoolId),
            name: selectedStudent.school.name || 'Escuela del usuario',
            has_generations: false // Los Pellines doesn't have generations
          };
          setSchools(prev => [...prev, tempSchool]);
        }

        // If community doesn't exist in the list, DO NOT add it
        // This prevents sending invalid community IDs to the API
        if (communityId && !communityExists) {
          console.warn('Community ID exists on user but not in database');
          // Don't set the community_id if it doesn't exist in the database
          communityId = null;
        }

        // Update form data with school and community
        const newFormData = {
          ...formData,
          [field]: value,
          school_id: schoolId ? String(schoolId) : '',
          community_id: communityId ? String(communityId) : ''
        };

        setFormData(newFormData);

        return;
      }
    }
    
    // Clear dependent fields when parent changes
    if (field === 'school_id') {
      setFormData(prev => ({
        ...prev,
        [field]: value,
        generation_id: '',
        community_id: ''
      }));
      
      // If the selected school doesn't have generations, clear generation_id
      const selectedSchool = schools.find(s => s.id === value);
      if (selectedSchool && selectedSchool.has_generations === false) {
        setFormData(prev => ({
          ...prev,
          generation_id: ''
        }));
      }
      return;
    } 
    
    if (field === 'generation_id') {
      setFormData(prev => ({
        ...prev,
        [field]: value,
        community_id: ''
      }));
      return;
    }
    
    // Default case - just update the field
    setFormData(prev => ({
      ...prev,
      [field]: value
    }));
  };

  const getFilteredGenerations = () => {
    if (!formData.school_id) return [];
    return generations.filter(g => 
      String(g.school_id) === String(formData.school_id)
    );
  };

  const getFilteredCommunities = () => {
    // If we have a specific community selected (from user selection), just return all communities
    // so the selected one can be displayed
    if (formData.community_id && formData.student_id) {
      return communities;
    }
    
    // Otherwise filter by school/generation
    if (!formData.school_id) return [];
    
    const selectedSchool = schools.find(s => 
      String(s.id) === String(formData.school_id)
    );
    
    if (selectedSchool && selectedSchool.has_generations !== true) {
      // School doesn't use generations, show all communities for this school
      return communities.filter(c => 
        String(c.school_id) === String(formData.school_id)
      );
    } else {
      // School uses generations, filter by generation
      if (!formData.generation_id) return [];
      return communities.filter(c => 
        String(c.generation_id) === String(formData.generation_id)
      );
    }
  };
  
  const shouldShowGenerationField = () => {
    if (!formData.school_id) return false;
    const selectedSchool = schools.find(s => 
      String(s.id) === String(formData.school_id)
    );
    return selectedSchool?.has_generations === true;
  };

  const validateForm = () => {
    if (!formData.consultant_id) {
      toast.error('Debe seleccionar un consultor');
      return false;
    }
    
    switch (formData.assignment_scope) {
      case 'individual':
        if (!formData.student_id) {
          toast.error('Debe seleccionar un usuario');
          return false;
        }
        if (formData.consultant_id === formData.student_id) {
          toast.error('El consultor no puede asignarse a sí mismo');
          return false;
        }
        break;
      case 'school':
        if (!formData.school_id) {
          toast.error('Debe seleccionar una escuela');
          return false;
        }
        break;
      case 'generation':
        if (!formData.school_id) {
          toast.error('Debe seleccionar una escuela');
          return false;
        }
        if (shouldShowGenerationField() && !formData.generation_id) {
          toast.error('Debe seleccionar una generación');
          return false;
        }
        break;
      case 'community':
        if (!formData.school_id) {
          toast.error('Debe seleccionar una escuela');
          return false;
        }
        if (shouldShowGenerationField() && !formData.generation_id) {
          toast.error('Debe seleccionar una generación');
          return false;
        }
        if (!formData.community_id) {
          toast.error('Debe seleccionar una comunidad');
          return false;
        }
        break;
    }
    
    if (formData.has_end_date && !formData.ends_at) {
      toast.error('Debe especificar una fecha de finalización');
      return false;
    }
    
    return true;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!validateForm()) return;
    
    // Variables for bulk assignment tracking
    let affectedCount = 0;
    let entityName = '';
    
    // Check for bulk assignment and show warning
    if (formData.assignment_scope !== 'individual') {
      switch (formData.assignment_scope) {
        case 'school':
          const schoolStudents = students.filter(s => 
            s.school_id?.toString() === formData.school_id?.toString()
          );
          affectedCount = schoolStudents.length;
          entityName = schools.find(s => s.id === formData.school_id)?.name || 'la escuela';
          break;
          
        case 'generation':
          const genStudents = students.filter(s => 
            s.school_id?.toString() === formData.school_id?.toString() &&
            s.generation_id === formData.generation_id
          );
          affectedCount = genStudents.length;
          entityName = generations.find(g => g.id === formData.generation_id)?.name || 'la generación';
          break;
          
        case 'community':
          const commStudents = students.filter(s => 
            s.community_id === formData.community_id
          );
          affectedCount = commStudents.length;
          entityName = communities.find(c => c.id === formData.community_id)?.name || 'la comunidad';
          break;
      }
      
      if (affectedCount > 0) {
        // Show confirmation toast with custom styling
        const confirmed = await new Promise<boolean>((resolve) => {
          const toastId = toast(
            (t) => (
              <div>
                <p className="font-medium mb-2">¿Está seguro de que desea asignar el consultor a TODOS los {affectedCount} usuarios de {entityName}?</p>
                <p className="text-sm text-gray-600 mb-4">Esta acción asignará el consultor a todos los usuarios actuales y futuros de {entityName}.</p>
                <div className="flex gap-2 justify-end">
                  <button
                    onClick={() => {
                      toast.dismiss(t.id);
                      resolve(false);
                    }}
                    className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50"
                  >
                    Cancelar
                  </button>
                  <button
                    onClick={() => {
                      toast.dismiss(t.id);
                      resolve(true);
                    }}
                    className="px-4 py-2 text-sm font-medium text-white bg-[#0a0a0a] rounded-md hover:bg-[#002a47]"
                  >
                    Confirmar
                  </button>
                </div>
              </div>
            ),
            {
              duration: Infinity,
              position: 'top-center',
              style: {
                maxWidth: '500px',
                padding: '16px',
                background: 'white',
                color: '#111827'
              }
            }
          );
        });
        
        if (!confirmed) {
          return;
        }
        
        // Don't show success here - wait until after the API call succeeds
      }
    }

    setLoading(true);
    try {
      const { data: { session }, error: sessionError } = await supabase.auth.getSession();
      
      if (sessionError || !session?.access_token) {
        toast.error('Error de autenticación');
        setLoading(false);
        return;
      }

      // Prepare payload based on assignment scope
      const payload: any = {
        consultant_id: formData.consultant_id,
        can_view_progress: true, // Always true
        can_message_student: true, // Always true
        can_assign_courses: formData.can_assign_courses,
        starts_at: new Date().toISOString(), // Always today
        ends_at: formData.has_end_date ? formData.ends_at : null,
        assignment_type: 'comprehensive' // Tipo: Completa - Todos los permisos
      };

      // Set scope-specific fields
      switch (formData.assignment_scope) {
        case 'individual':
          payload.student_id = formData.student_id;
          break;
        case 'school':
          payload.school_id = formData.school_id;
          payload.assignment_scope = 'school';
          break;
        case 'generation':
          payload.school_id = formData.school_id;
          payload.generation_id = formData.generation_id;
          payload.assignment_scope = 'generation';
          break;
        case 'community':
          payload.school_id = formData.school_id;
          payload.generation_id = formData.generation_id || null; // Send null if no generation
          payload.community_id = formData.community_id;
          payload.assignment_scope = 'community';
          // For individual assignment with community scope, include student_id
          if (formData.student_id) {
            payload.student_id = formData.student_id;
          }
          break;
      }

      // Only add ID if we're truly editing an existing assignment
      if (editingAssignment && editingAssignment.id) {
        payload.id = editingAssignment.id;
      }

      const url = '/api/admin/consultant-assignments';
      const method = (editingAssignment && editingAssignment.id) ? 'PUT' : 'POST';

      const response = await fetch(url, {
        method,
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
      });

      let result;
      try {
        const responseText = await response.text();
        result = responseText ? JSON.parse(responseText) : {};
      } catch (parseError) {
        console.error('Failed to parse response:', parseError);
        result = {};
      }

      if (!response.ok) {
        console.error('Assignment API error:', result);
        const errorMessage = result.details ? 
          `${result.error}: ${result.details}` : 
          result.error || 'Error al guardar la asignación';
        toast.error(errorMessage);
        return; // Don't throw, just return early
      }

      // Show success message based on scope
      let successMessage = 'Asignación creada exitosamente';
      if (editingAssignment && editingAssignment.id) {
        successMessage = 'Asignación actualizada exitosamente';
      } else if (formData.assignment_scope !== 'individual' && affectedCount > 0 && entityName) {
        successMessage = `Consultor asignado exitosamente a ${affectedCount} usuarios de ${entityName}`;
      }
      
      toast.success(successMessage);
      
      // Close modal first, then call the callback
      onClose();
      
      // Give modal time to close before refreshing data
      setTimeout(() => {
        try {
          onAssignmentCreated();
        } catch (callbackError) {
          console.error('Error in assignment created callback:', callbackError);
        }
      }, 500);
    } catch (error: any) {
      console.error('Full error object:', error);
      console.error('Error message:', error?.message);
      console.error('Error stack:', error?.stack);
      
      // Check if this is actually an error or just a rejected promise
      if (error instanceof Error) {
        toast.error(`Error: ${error.message}`);
      } else if (typeof error === 'string') {
        toast.error(error);
      } else {
        toast.error('Error al guardar la asignación');
      }
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg max-w-3xl w-full max-h-[90vh] overflow-y-auto">
        <div className="p-6">
          <div className="flex justify-between items-center mb-6">
            <h2 className="text-2xl font-bold text-[#0a0a0a]">
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
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#0a0a0a]"></div>
              <span className="ml-2">Cargando datos...</span>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-6">
              {/* Consultant Selection */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Consultor *
                </label>
                <select
                  value={formData.consultant_id}
                  onChange={(e) => handleInputChange('consultant_id', e.target.value)}
                  className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#fbbf24] focus:border-transparent"
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

              {/* Assignment Scope Selection */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Tipo de Asignación *
                </label>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  <label className="flex items-center p-3 border rounded-lg cursor-pointer hover:bg-gray-50">
                    <input
                      type="radio"
                      name="assignment_scope"
                      value="individual"
                      checked={formData.assignment_scope === 'individual'}
                      onChange={(e) => handleInputChange('assignment_scope', e.target.value)}
                      className="mr-2"
                    />
                    <span className="text-sm">Individual</span>
                  </label>
                  <label className="flex items-center p-3 border rounded-lg cursor-pointer hover:bg-gray-50">
                    <input
                      type="radio"
                      name="assignment_scope"
                      value="community"
                      checked={formData.assignment_scope === 'community'}
                      onChange={(e) => handleInputChange('assignment_scope', e.target.value)}
                      className="mr-2"
                    />
                    <span className="text-sm">Comunidad</span>
                  </label>
                  <label className="flex items-center p-3 border rounded-lg cursor-pointer hover:bg-gray-50">
                    <input
                      type="radio"
                      name="assignment_scope"
                      value="generation"
                      checked={formData.assignment_scope === 'generation'}
                      onChange={(e) => handleInputChange('assignment_scope', e.target.value)}
                      className="mr-2"
                    />
                    <span className="text-sm">Generación</span>
                  </label>
                  <label className="flex items-center p-3 border rounded-lg cursor-pointer hover:bg-gray-50">
                    <input
                      type="radio"
                      name="assignment_scope"
                      value="school"
                      checked={formData.assignment_scope === 'school'}
                      onChange={(e) => handleInputChange('assignment_scope', e.target.value)}
                      className="mr-2"
                    />
                    <span className="text-sm">Escuela</span>
                  </label>
                </div>
              </div>

              {/* Show fixed user when opened from user row */}
              {fixedUser && (
                <div className="bg-gray-50 p-4 rounded-lg mb-4">
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Usuario Seleccionado
                  </label>
                  <div className="text-lg font-medium">
                    {fixedUser.first_name} {fixedUser.last_name} ({fixedUser.email})
                  </div>
                  <div className="text-sm text-gray-600 mt-1">
                    La asignación se aplicará según el tipo seleccionado arriba
                  </div>
                </div>
              )}

              {/* Dynamic Selection Based on Scope - Only show if no fixed user */}
              {!fixedUser && formData.assignment_scope === 'individual' && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Usuario a Asignar *
                  </label>
                  <select
                    value={formData.student_id}
                    onChange={(e) => handleInputChange('student_id', e.target.value)}
                    className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#fbbf24] focus:border-transparent"
                    required
                  >
                    <option value="">Seleccionar usuario...</option>
                    {students.map(student => (
                      <option key={student.id} value={student.id}>
                        {student.first_name} {student.last_name} ({student.email}) - {student.role}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {(formData.assignment_scope === 'school' || 
                formData.assignment_scope === 'generation' || 
                formData.assignment_scope === 'community') && (
                <div className="space-y-4">
                  {/* Allow user selection for community assignment - only if no fixed user */}
                  {!fixedUser && formData.assignment_scope === 'community' && (
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Usuario (Opcional - para asignar a la comunidad de un usuario específico)
                      </label>
                      <select
                        value={formData.student_id}
                        onChange={(e) => handleInputChange('student_id', e.target.value)}
                        className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#fbbf24] focus:border-transparent"
                      >
                        <option value="">Seleccionar usuario...</option>
                        {students.map(student => (
                          <option key={student.id} value={student.id}>
                            {student.first_name} {student.last_name} ({student.email}) - {student.role}
                          </option>
                        ))}
                      </select>
                    </div>
                  )}
                  
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Escuela *
                    </label>
                    {formData.assignment_scope === 'community' && formData.student_id && formData.school_id ? (
                      // Show school as read-only when assigning to a specific student's community
                      <div className="w-full p-3 border border-gray-200 rounded-lg bg-gray-50">
                        {schools.find(s => s.id === formData.school_id || s.id.toString() === formData.school_id)?.name || 'Escuela del usuario'}
                      </div>
                    ) : (
                      // Show dropdown for other assignment types
                      <select
                        value={formData.school_id || ''}
                        onChange={(e) => handleInputChange('school_id', e.target.value)}
                        className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#fbbf24] focus:border-transparent"
                        required
                      >
                        <option value="">Seleccionar escuela...</option>
                        {schools.map(school => (
                          <option key={school.id} value={String(school.id)}>
                            {school.name}
                          </option>
                        ))}
                      </select>
                    )}
                  </div>

                  {(formData.assignment_scope === 'generation' || 
                    formData.assignment_scope === 'community') && shouldShowGenerationField() && (
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Generación *
                      </label>
                      <select
                        value={formData.generation_id || ''}
                        onChange={(e) => handleInputChange('generation_id', e.target.value)}
                        className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#fbbf24] focus:border-transparent"
                        required
                        disabled={!formData.school_id}
                      >
                        <option value="">Seleccionar generación...</option>
                        {getFilteredGenerations().length === 0 ? (
                          <option value="" disabled>Esta escuela no tiene generaciones</option>
                        ) : (
                          getFilteredGenerations().map(generation => (
                            <option key={generation.id} value={String(generation.id)}>
                              {generation.name}
                            </option>
                          ))
                        )}
                      </select>
                    </div>
                  )}

                  {formData.assignment_scope === 'community' && (
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Comunidad de Crecimiento *
                      </label>
                      {formData.student_id && formData.community_id ? (
                        // If we selected a user with a community, show it as read-only
                        <div className="w-full p-3 border border-gray-200 rounded-lg bg-gray-50">
                          {communities.find(c => c.id === formData.community_id)?.name || 'Comunidad del usuario'}
                        </div>
                      ) : (
                        // Otherwise show the dropdown
                        <select
                          value={formData.community_id || ''}
                          onChange={(e) => handleInputChange('community_id', e.target.value)}
                          className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#fbbf24] focus:border-transparent"
                          required
                          disabled={!formData.school_id || (shouldShowGenerationField() && !formData.generation_id)}
                        >
                          <option value="">Seleccionar comunidad...</option>
                          {getFilteredCommunities().length === 0 ? (
                            <option value="" disabled>No hay comunidades disponibles</option>
                          ) : (
                            getFilteredCommunities().map(community => (
                              <option key={community.id} value={String(community.id)}>
                                {community.name}
                              </option>
                            ))
                          )}
                        </select>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* Bulk Assignment Warning */}
              {formData.assignment_scope !== 'individual' && (
                <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mb-6">
                  <div className="flex items-start">
                    <AlertTriangle className="h-5 w-5 text-yellow-600 mt-0.5 mr-3 flex-shrink-0" />
                    <div className="text-sm">
                      <p className="font-medium text-yellow-800 mb-1">
                        Advertencia: Asignación Masiva
                      </p>
                      <p className="text-yellow-700">
                        {formData.assignment_scope === 'school' && 'Esta asignación se aplicará a TODOS los usuarios de la escuela seleccionada.'}
                        {formData.assignment_scope === 'generation' && 'Esta asignación se aplicará a TODOS los usuarios de la generación seleccionada.'}
                        {formData.assignment_scope === 'community' && 'Esta asignación se aplicará a TODOS los usuarios de la comunidad seleccionada.'}
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {/* Permission - Only Course Assignment */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-3">
                  Permisos
                </label>
                <label className="flex items-center">
                  <input
                    type="checkbox"
                    checked={formData.can_assign_courses}
                    onChange={(e) => handleInputChange('can_assign_courses', e.target.checked)}
                    className="mr-3 h-4 w-4 text-[#fbbf24] focus:ring-[#fbbf24] border-gray-300 rounded"
                  />
                  <span className="text-sm">Puede asignar cursos</span>
                </label>
              </div>

              {/* End Date */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-3">
                  Duración
                </label>
                <label className="flex items-center mb-3">
                  <input
                    type="checkbox"
                    checked={formData.has_end_date}
                    onChange={(e) => handleInputChange('has_end_date', e.target.checked)}
                    className="mr-3 h-4 w-4 text-[#fbbf24] focus:ring-[#fbbf24] border-gray-300 rounded"
                  />
                  <span className="text-sm">Establecer fecha de finalización</span>
                </label>
                {formData.has_end_date && (
                  <div>
                    <label className="block text-sm text-gray-600 mb-1">Fecha de finalización</label>
                    <input
                      type="datetime-local"
                      value={formData.ends_at}
                      onChange={(e) => handleInputChange('ends_at', e.target.value)}
                      min={(() => {
                        const d = new Date();
                        const year = d.getFullYear();
                        const month = String(d.getMonth() + 1).padStart(2, '0');
                        const day = String(d.getDate()).padStart(2, '0');
                        const hours = String(d.getHours()).padStart(2, '0');
                        const minutes = String(d.getMinutes()).padStart(2, '0');
                        return `${year}-${month}-${day}T${hours}:${minutes}`;
                      })()}
                      className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#fbbf24] focus:border-transparent"
                      required
                    />
                  </div>
                )}
                {!formData.has_end_date && (
                  <p className="text-sm text-gray-500">
                    La asignación será indefinida hasta que se elimine manualmente.
                  </p>
                )}
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
                  className="px-6 py-2 bg-[#fbbf24] text-white rounded-lg hover:bg-[#e6a42e] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
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