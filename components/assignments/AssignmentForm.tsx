import React, { useState, useEffect } from 'react';
import { Assignment, AssignmentType, AssignmentResource } from '../../types/assignments';
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs';
import { Plus, Trash2, Link as LinkIcon, FileText, Video } from 'lucide-react';

interface AssignmentFormProps {
  assignment?: Partial<Assignment>;
  onSubmit: (data: Partial<Assignment>) => void;
  onCancel: () => void;
  isLoading?: boolean;
}

export const AssignmentForm: React.FC<AssignmentFormProps> = ({
  assignment,
  onSubmit,
  onCancel,
  isLoading = false
}) => {
  const supabase = createClientComponentClient();
  const [formData, setFormData] = useState<Partial<Assignment>>({
    title: '',
    description: '',
    assignment_type: 'task',
    instructions: '',
    points: 0,
    due_date: '',
    allow_late_submission: true,
    max_attempts: 1,
    resources: [],
    is_published: false,
    ...assignment
  });

  const [courses, setCourses] = useState<any[]>([]);
  const [lessons, setLessons] = useState<any[]>([]);
  const [newResource, setNewResource] = useState<Partial<AssignmentResource>>({
    title: '',
    url: '',
    type: 'link'
  });

  useEffect(() => {
    fetchCourses();
  }, []);

  useEffect(() => {
    if (formData.course_id) {
      fetchLessons(formData.course_id);
    } else {
      setLessons([]);
    }
  }, [formData.course_id]);

  const fetchCourses = async () => {
    const { data, error } = await supabase
      .from('courses')
      .select('id, title')
      .order('title');
    
    if (!error && data) {
      setCourses(data);
    }
  };

  const fetchLessons = async (courseId: string) => {
    const { data, error } = await supabase
      .from('lessons')
      .select('id, title')
      .eq('course_id', courseId)
      .order('order_index');
    
    if (!error && data) {
      setLessons(data);
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value, type } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: type === 'checkbox' ? (e.target as HTMLInputElement).checked : 
               type === 'number' ? parseInt(value) || 0 : value
    }));
  };

  const handleAddResource = () => {
    if (newResource.title && newResource.url) {
      setFormData(prev => ({
        ...prev,
        resources: [...(prev.resources || []), {
          ...newResource,
          id: Date.now().toString()
        } as AssignmentResource]
      }));
      setNewResource({ title: '', url: '', type: 'link' });
    }
  };

  const handleRemoveResource = (id: string) => {
    setFormData(prev => ({
      ...prev,
      resources: prev.resources?.filter(r => r.id !== id) || []
    }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit(formData);
  };

  const assignmentTypes: { value: AssignmentType; label: string }[] = [
    { value: 'task', label: 'Tarea' },
    { value: 'quiz', label: 'Cuestionario' },
    { value: 'project', label: 'Proyecto' },
    { value: 'essay', label: 'Ensayo' },
    { value: 'presentation', label: 'Presentación' }
  ];

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* Basic Information */}
      <div className="bg-white rounded-lg shadow-md p-6">
        <h3 className="text-lg font-semibold text-brand_blue mb-4">Información básica</h3>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Título *
            </label>
            <input
              type="text"
              name="title"
              value={formData.title}
              onChange={handleChange}
              required
              className="w-full p-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-brand_blue focus:border-transparent"
              placeholder="Título de la tarea"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Tipo de tarea
            </label>
            <select
              name="assignment_type"
              value={formData.assignment_type}
              onChange={handleChange}
              className="w-full p-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-brand_blue focus:border-transparent"
            >
              {assignmentTypes.map(type => (
                <option key={type.value} value={type.value}>
                  {type.label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Curso
            </label>
            <select
              name="course_id"
              value={formData.course_id || ''}
              onChange={handleChange}
              className="w-full p-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-brand_blue focus:border-transparent"
            >
              <option value="">Sin curso específico</option>
              {courses.map(course => (
                <option key={course.id} value={course.id}>
                  {course.title}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Lección
            </label>
            <select
              name="lesson_id"
              value={formData.lesson_id || ''}
              onChange={handleChange}
              disabled={!formData.course_id}
              className="w-full p-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-brand_blue focus:border-transparent disabled:bg-gray-100"
            >
              <option value="">Sin lección específica</option>
              {lessons.map(lesson => (
                <option key={lesson.id} value={lesson.id}>
                  {lesson.title}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="mt-4">
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Descripción
          </label>
          <textarea
            name="description"
            value={formData.description}
            onChange={handleChange}
            rows={3}
            className="w-full p-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-brand_blue focus:border-transparent"
            placeholder="Descripción breve de la tarea"
          />
        </div>
      </div>

      {/* Assignment Details */}
      <div className="bg-white rounded-lg shadow-md p-6">
        <h3 className="text-lg font-semibold text-brand_blue mb-4">Detalles de la tarea</h3>
        
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Instrucciones
            </label>
            <textarea
              name="instructions"
              value={formData.instructions}
              onChange={handleChange}
              rows={5}
              className="w-full p-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-brand_blue focus:border-transparent"
              placeholder="Instrucciones detalladas para completar la tarea"
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Puntos
              </label>
              <input
                type="number"
                name="points"
                value={formData.points}
                onChange={handleChange}
                min="0"
                className="w-full p-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-brand_blue focus:border-transparent"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Fecha de entrega
              </label>
              <input
                type="datetime-local"
                name="due_date"
                value={formData.due_date}
                onChange={handleChange}
                className="w-full p-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-brand_blue focus:border-transparent"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Intentos máximos
              </label>
              <input
                type="number"
                name="max_attempts"
                value={formData.max_attempts}
                onChange={handleChange}
                min="1"
                className="w-full p-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-brand_blue focus:border-transparent"
              />
            </div>
          </div>

          <div className="flex items-center space-x-6">
            <label className="flex items-center">
              <input
                type="checkbox"
                name="allow_late_submission"
                checked={formData.allow_late_submission}
                onChange={handleChange}
                className="mr-2"
              />
              <span className="text-sm text-gray-700">Permitir entregas tardías</span>
            </label>

            <label className="flex items-center">
              <input
                type="checkbox"
                name="is_published"
                checked={formData.is_published}
                onChange={handleChange}
                className="mr-2"
              />
              <span className="text-sm text-gray-700">Publicar inmediatamente</span>
            </label>
          </div>
        </div>
      </div>

      {/* Resources */}
      <div className="bg-white rounded-lg shadow-md p-6">
        <h3 className="text-lg font-semibold text-brand_blue mb-4">Recursos</h3>
        
        <div className="space-y-4">
          {formData.resources?.map((resource) => (
            <div key={resource.id} className="flex items-center p-3 bg-gray-50 rounded-md">
              <div className="mr-3">
                {resource.type === 'file' ? <FileText size={20} className="text-gray-600" /> :
                 resource.type === 'video' ? <Video size={20} className="text-gray-600" /> :
                 <LinkIcon size={20} className="text-gray-600" />}
              </div>
              <div className="flex-1">
                <p className="font-medium text-gray-800">{resource.title}</p>
                <p className="text-sm text-gray-600">{resource.url}</p>
              </div>
              <button
                type="button"
                onClick={() => handleRemoveResource(resource.id)}
                className="ml-4 text-red-600 hover:text-red-800"
              >
                <Trash2 size={18} />
              </button>
            </div>
          ))}

          <div className="border-t pt-4">
            <h4 className="text-sm font-medium text-gray-700 mb-2">Agregar recurso</h4>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-2">
              <input
                type="text"
                value={newResource.title || ''}
                onChange={(e) => setNewResource({ ...newResource, title: e.target.value })}
                placeholder="Título del recurso"
                className="p-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-brand_blue focus:border-transparent"
              />
              <input
                type="url"
                value={newResource.url || ''}
                onChange={(e) => setNewResource({ ...newResource, url: e.target.value })}
                placeholder="URL del recurso"
                className="p-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-brand_blue focus:border-transparent"
              />
              <select
                value={newResource.type}
                onChange={(e) => setNewResource({ ...newResource, type: e.target.value as any })}
                className="p-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-brand_blue focus:border-transparent"
              >
                <option value="link">Enlace</option>
                <option value="file">Archivo</option>
                <option value="video">Video</option>
              </select>
              <button
                type="button"
                onClick={handleAddResource}
                disabled={!newResource.title || !newResource.url}
                className="flex items-center justify-center px-4 py-2 bg-brand_yellow text-brand_blue rounded hover:bg-brand_blue hover:text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Plus size={18} className="mr-1" />
                Agregar
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Form Actions */}
      <div className="flex justify-end space-x-4">
        <button
          type="button"
          onClick={onCancel}
          className="px-4 py-2 text-gray-600 hover:text-gray-800 border border-gray-300 rounded-md hover:bg-gray-50 transition"
        >
          Cancelar
        </button>
        <button
          type="submit"
          disabled={isLoading || !formData.title}
          className="px-4 py-2 bg-brand_blue text-white rounded-md hover:bg-brand_yellow hover:text-brand_blue transition disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isLoading ? 'Guardando...' : assignment?.id ? 'Actualizar tarea' : 'Crear tarea'}
        </button>
      </div>
    </form>
  );
};