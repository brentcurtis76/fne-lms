import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import { useAuth } from '../../hooks/useAuth';
import { supabase } from '../../lib/supabase';
import MainLayout from '../../components/layout/MainLayout';
import {
  UserGroupIcon,
  BookOpenIcon,
  ArrowLeftIcon,
  CalendarIcon,
  UsersIcon,
  ClockIcon,
  DocumentTextIcon,
  AcademicCapIcon,
  ExclamationIcon as ExclamationTriangleIcon
} from '@heroicons/react/outline';
import { getAssignmentTemplates, createAssignmentInstance } from '../../lib/services/assignmentInstances';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';

interface Course {
  id: string;
  title: string;
}

interface School {
  id: number;
  name: string;
}

interface AssignmentTemplate {
  template_id: string;
  lesson_id: string;
  lesson_title: string;
  module_title: string;
  template_title: string;
  assignment_type: string;
  created_at: string;
}

export default function NewGroupAssignment() {
  const router = useRouter();
  const { user, isAdmin } = useAuth();
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [courses, setCourses] = useState<Course[]>([]);
  const [schools, setSchools] = useState<School[]>([]);
  const [templates, setTemplates] = useState<AssignmentTemplate[]>([]);
  
  // Form state
  const [selectedCourse, setSelectedCourse] = useState<string>('');
  const [selectedTemplate, setSelectedTemplate] = useState<string>('');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [instructions, setInstructions] = useState('');
  const [selectedSchool, setSelectedSchool] = useState<string>('');
  const [cohortName, setCohortName] = useState('');
  const [startDate, setStartDate] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [activateNow, setActivateNow] = useState(false);

  useEffect(() => {
    if (user) {
      fetchInitialData();
    }
  }, [user]);

  useEffect(() => {
    if (selectedCourse) {
      fetchTemplates();
    }
  }, [selectedCourse]);

  useEffect(() => {
    if (selectedTemplate) {
      const template = templates.find(t => t.template_id === selectedTemplate);
      if (template) {
        setTitle(template.template_title);
      }
    }
  }, [selectedTemplate, templates]);

  const fetchInitialData = async () => {
    try {
      setLoading(true);
      
      // Fetch courses
      let coursesList: { id: string; title: string }[] = [];
      
      if (!isAdmin) {
        const { data: assignedCourses, error: assignedError } = await supabase
          .from('course_assignments')
          .select(`
            course_id,
            courses!inner (
              id,
              title
            )
          `)
          .eq('teacher_id', user?.id);
          
        if (assignedError) throw assignedError;
        coursesList = assignedCourses?.map((ca: any) => ({ 
          id: ca.courses.id, 
          title: ca.courses.title 
        })) || [];
      } else {
        const { data: allCourses, error: coursesError } = await supabase
          .from('courses')
          .select('id, title')
          .order('title');
          
        if (coursesError) throw coursesError;
        coursesList = allCourses || [];
      }
      
      setCourses(coursesList);
      
      // Fetch schools
      const { data: schoolsData, error: schoolsError } = await supabase
        .from('schools')
        .select('id, name')
        .order('name');
      
      if (schoolsError) throw schoolsError;
      setSchools(schoolsData || []);
      
    } catch (error) {
      console.error('Error fetching initial data:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchTemplates = async () => {
    try {
      const { data, error } = await getAssignmentTemplates(selectedCourse);
      if (error) throw error;
      
      // Filter only group assignment templates
      const groupTemplates = data?.filter(t => t.assignment_type === 'group') || [];
      setTemplates(groupTemplates);
    } catch (error) {
      console.error('Error fetching templates:', error);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCourse || !selectedTemplate || !title) return;
    
    setCreating(true);
    try {
      const { data, error } = await createAssignmentInstance({
        templateId: selectedTemplate,
        courseId: selectedCourse,
        title,
        description,
        instructions,
        schoolId: selectedSchool || null,
        communityId: null,
        cohortName: cohortName || null,
        startDate: startDate || null,
        dueDate: dueDate || null,
        status: activateNow ? 'active' : 'draft',
        createdBy: user?.id
      });
      
      if (error) throw error;
      
      // Redirect to the assignment detail page
      router.push(`/group-assignments/${data.id}`);
    } catch (error) {
      console.error('Error creating assignment instance:', error);
      alert('Error al crear la tarea grupal');
    } finally {
      setCreating(false);
    }
  };

  if (loading) {
    return (
      <MainLayout user={user} currentPage="group-assignments">
        <div className="max-w-4xl mx-auto px-4 py-8">
          <div className="text-center py-12">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[#00365b] mx-auto"></div>
            <p className="mt-4 text-gray-600">Cargando...</p>
          </div>
        </div>
      </MainLayout>
    );
  }

  return (
    <MainLayout user={user} currentPage="group-assignments">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="mb-8">
          <button
            onClick={() => router.back()}
            className="mb-4 text-gray-600 hover:text-gray-900 flex items-center"
          >
            <ArrowLeftIcon className="h-5 w-5 mr-2" />
            Volver
          </button>
          
          <div className="flex items-center">
            <UserGroupIcon className="h-8 w-8 mr-3 text-[#00365b]" />
            <h1 className="text-3xl font-bold text-gray-900">
              Nueva Tarea Grupal
            </h1>
          </div>
          <p className="mt-2 text-gray-600">
            Crea una nueva instancia de tarea grupal basada en una plantilla existente
          </p>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-8">
          {/* Course and Template Selection */}
          <div className="bg-white rounded-lg shadow p-6 space-y-6">
            <h2 className="text-lg font-semibold text-gray-900 flex items-center">
              <BookOpenIcon className="h-5 w-5 mr-2 text-[#00365b]" />
              Selección de Plantilla
            </h2>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Curso <span className="text-red-500">*</span>
              </label>
              <select
                value={selectedCourse}
                onChange={(e) => {
                  setSelectedCourse(e.target.value);
                  setSelectedTemplate('');
                }}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#00365b] focus:border-transparent"
                required
              >
                <option value="">Selecciona un curso</option>
                {courses.map((course) => (
                  <option key={course.id} value={course.id}>
                    {course.title}
                  </option>
                ))}
              </select>
            </div>
            
            {selectedCourse && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Plantilla de Tarea Grupal <span className="text-red-500">*</span>
                </label>
                {templates.length > 0 ? (
                  <select
                    value={selectedTemplate}
                    onChange={(e) => setSelectedTemplate(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#00365b] focus:border-transparent"
                    required
                  >
                    <option value="">Selecciona una plantilla</option>
                    {templates.map((template) => (
                      <option key={template.template_id} value={template.template_id}>
                        {template.module_title} → {template.lesson_title} → {template.template_title}
                      </option>
                    ))}
                  </select>
                ) : (
                  <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
                    <div className="flex">
                      <ExclamationTriangleIcon className="h-5 w-5 text-yellow-400 mr-2" />
                      <p className="text-sm text-yellow-800">
                        No hay plantillas de tareas grupales en este curso. 
                        Las plantillas se crean al agregar bloques de "Tarea Grupal" en las lecciones.
                      </p>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Assignment Details */}
          {selectedTemplate && (
            <div className="bg-white rounded-lg shadow p-6 space-y-6">
              <h2 className="text-lg font-semibold text-gray-900 flex items-center">
                <DocumentTextIcon className="h-5 w-5 mr-2 text-[#00365b]" />
                Detalles de la Instancia
              </h2>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Título <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#00365b] focus:border-transparent"
                  required
                />
                <p className="mt-1 text-sm text-gray-500">
                  Puedes personalizar el título para esta instancia específica
                </p>
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Descripción
                </label>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={3}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#00365b] focus:border-transparent"
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Instrucciones Adicionales
                </label>
                <textarea
                  value={instructions}
                  onChange={(e) => setInstructions(e.target.value)}
                  rows={4}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#00365b] focus:border-transparent"
                  placeholder="Instrucciones específicas para esta instancia..."
                />
              </div>
            </div>
          )}

          {/* Target Audience */}
          {selectedTemplate && (
            <div className="bg-white rounded-lg shadow p-6 space-y-6">
              <h2 className="text-lg font-semibold text-gray-900 flex items-center">
                <UsersIcon className="h-5 w-5 mr-2 text-[#00365b]" />
                Audiencia Objetivo
              </h2>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Escuela
                </label>
                <select
                  value={selectedSchool}
                  onChange={(e) => setSelectedSchool(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#00365b] focus:border-transparent"
                >
                  <option value="">Todas las escuelas</option>
                  {schools.map((school) => (
                    <option key={school.id} value={school.id}>
                      {school.name}
                    </option>
                  ))}
                </select>
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Nombre del Cohorte
                </label>
                <input
                  type="text"
                  value={cohortName}
                  onChange={(e) => setCohortName(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#00365b] focus:border-transparent"
                  placeholder="Ej: Generación 2024-A"
                />
              </div>
            </div>
          )}

          {/* Schedule */}
          {selectedTemplate && (
            <div className="bg-white rounded-lg shadow p-6 space-y-6">
              <h2 className="text-lg font-semibold text-gray-900 flex items-center">
                <CalendarIcon className="h-5 w-5 mr-2 text-[#00365b]" />
                Calendario
              </h2>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Fecha de Inicio
                  </label>
                  <input
                    type="datetime-local"
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#00365b] focus:border-transparent"
                  />
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Fecha de Entrega
                  </label>
                  <input
                    type="datetime-local"
                    value={dueDate}
                    onChange={(e) => setDueDate(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#00365b] focus:border-transparent"
                  />
                </div>
              </div>
              
              <div className="flex items-center">
                <input
                  type="checkbox"
                  id="activateNow"
                  checked={activateNow}
                  onChange={(e) => setActivateNow(e.target.checked)}
                  className="h-4 w-4 text-[#00365b] focus:ring-[#00365b] border-gray-300 rounded"
                />
                <label htmlFor="activateNow" className="ml-2 text-sm text-gray-700">
                  Activar inmediatamente (los estudiantes podrán ver y trabajar en la tarea)
                </label>
              </div>
            </div>
          )}

          {/* Actions */}
          {selectedTemplate && (
            <div className="flex justify-end space-x-4">
              <button
                type="button"
                onClick={() => router.back()}
                className="px-6 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 transition-colors"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={creating || !selectedCourse || !selectedTemplate || !title}
                className="px-6 py-2 bg-[#00365b] text-white rounded-lg hover:bg-[#004a7a] transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center"
              >
                {creating ? (
                  <>
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                    Creando...
                  </>
                ) : (
                  <>
                    {activateNow ? 'Crear y Activar' : 'Crear Borrador'}
                  </>
                )}
              </button>
            </div>
          )}
        </form>
      </div>
    </MainLayout>
  );
}