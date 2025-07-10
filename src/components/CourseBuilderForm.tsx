import React, { useState, useEffect } from 'react';
import { createClient } from '@supabase/supabase-js';
import 'dotenv/config';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const supabase = createClient(supabaseUrl, anonKey);

interface Instructor {
  id: string;
  full_name: string;
}

interface CourseBuilderFormProps {
  instructorId?: string;
  createdBy?: string;
  onSuccess?: () => void;
}

const CourseBuilderForm: React.FC<CourseBuilderFormProps> = ({
  instructorId,
  createdBy,
  onSuccess,
}) => {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [selectedInstructorId, setSelectedInstructorId] = useState(instructorId || '');
  const [instructors, setInstructors] = useState<Instructor[]>([]);
  const [loading, setLoading] = useState(false);
  const [successMessage, setSuccessMessage] = useState('');
  const [errorMessage, setErrorMessage] = useState('');

  useEffect(() => {
    fetchInstructors();
  }, []);

  const fetchInstructors = async () => {
    try {
      // Use API endpoint to fetch instructors (bypasses RLS issues)
      const response = await fetch('/api/admin/get-instructors');
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const instructors = await response.json();
      
      console.log(`Successfully loaded ${instructors.length} instructors`);
      setInstructors(instructors);
    } catch (error) {
      console.error('Error fetching instructors:', error);
      setInstructors([]);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setSuccessMessage('');
    setErrorMessage('');

    if (!selectedInstructorId) {
      setErrorMessage('Por favor selecciona un instructor');
      setLoading(false);
      return;
    }

    const { error } = await supabase.from('courses').insert([
      {
        title,
        description,
        instructor_id: selectedInstructorId,
        created_by: createdBy,
        thumbnail_url: null, // Set to null instead of placeholder URL
        status: 'draft',
      },
    ]);

    if (error) {
      setErrorMessage('Error al crear el curso: ' + error.message);
    } else {
      setSuccessMessage('✅ ¡Curso creado exitosamente!');
      setTitle('');
      setDescription('');
      setSelectedInstructorId('');
      
      // Call the onSuccess callback if provided
      if (onSuccess) {
        onSuccess();
      }
    }

    setLoading(false);
  };

  return (
    <div className="w-full max-w-2xl mx-auto">

      {successMessage && (
        <div className="mb-4 text-green-700 bg-green-100 p-3 rounded">
          {successMessage}
        </div>
      )}
      {errorMessage && (
        <div className="mb-4 text-red-700 bg-red-100 p-3 rounded">
          {errorMessage}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label htmlFor="courseTitle" className="block text-sm font-medium text-gray-700 mb-1">
            Título del Curso
          </label>
          <input
            id="courseTitle"
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="w-full px-4 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-brand_blue"
            placeholder="Ingresa el título del curso"
            required
          />
        </div>

        <div>
          <label htmlFor="courseDescription" className="block text-sm font-medium text-gray-700 mb-1">
            Descripción del Curso
          </label>
          <textarea
            id="courseDescription"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={3}
            className="w-full px-4 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-brand_blue"
            placeholder="Ingresa la descripción del curso"
            required
          />
        </div>

        <div>
          <label htmlFor="instructorSelect" className="block text-sm font-medium text-gray-700 mb-1">
            Instructor
          </label>
          <select
            id="instructorSelect"
            value={selectedInstructorId}
            onChange={(e) => setSelectedInstructorId(e.target.value)}
            className="w-full px-4 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-brand_blue"
            required
          >
            <option value="">Selecciona un instructor...</option>
            {instructors.map((instructor) => (
              <option key={instructor.id} value={instructor.id}>
                {instructor.full_name}
              </option>
            ))}
          </select>
        </div>

        <div className="pt-4">
          <button
            type="submit"
            disabled={loading}
            className={`px-6 py-2 font-medium rounded-md transition ${
              loading
                ? 'bg-gray-400 text-white cursor-not-allowed'
                : 'bg-brand_blue text-white hover:bg-brand_yellow hover:text-brand_blue'
            }`}
          >
            {loading ? 'Guardando...' : 'Crear Curso'}
          </button>
        </div>
      </form>
    </div>
  );
};

export default CourseBuilderForm;

