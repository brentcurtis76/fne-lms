import React, { useState } from 'react';
import { useRouter } from 'next/router';
import Link from 'next/link';
import { useSupabaseClient } from '@supabase/auth-helpers-react';
import { toast } from 'react-hot-toast';
import Header from '../../components/layout/Header';

const CreateCoursePage = () => {
  const router = useRouter();
  const supabase = useSupabaseClient();

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [status, setStatus] = useState<'draft' | 'published'>('draft');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsSubmitting(true);
    setError(null);

    if (!title.trim() || !description.trim()) {
      setError('El título y la descripción son obligatorios.');
      setIsSubmitting(false);
      return;
    }

    const newCourseId = crypto.randomUUID();

    try {
      // 1. Create the course
      const { data: courseData, error: courseError } = await supabase
        .from('courses')
        .insert([
          {
            id: newCourseId,
            title: title.trim(),
            description: description.trim(),
            status: status,
            // user_id: session?.user?.id, // Assuming you might want to link to a user
          },
        ])
        .select()
        .single(); // Use .single() if you expect one row back and want the object directly

      if (courseError) {
        throw courseError;
      }

      if (!courseData) {
        throw new Error('No se pudo crear el curso.');
      }

      // 2. Create 2 default modules for the course
      const modulesToCreate = [
        {
          course_id: newCourseId,
          title: 'Módulo 1: Introducción',
          description: 'Descripción inicial del Módulo 1.',
          order_number: 1,
        },
        {
          course_id: newCourseId,
          title: 'Módulo 2: Contenido Principal',
          description: 'Descripción inicial del Módulo 2.',
          order_number: 2,
        },
      ];

      const { error: modulesError } = await supabase
        .from('modules')
        .insert(modulesToCreate);

      if (modulesError) {
        // Optionally, attempt to delete the course if modules fail, or handle differently
        console.error('Error creating modules, but course was created:', modulesError);
        toast.error(`Curso creado, pero falló la creación de módulos: ${modulesError.message}`);
        // Still redirect to the course page, user can add modules manually
      } else {
        toast.success('¡Curso y módulos iniciales creados exitosamente!');
      }

      // 3. Redirect to the new course's detail page
      router.push(`/admin/course-builder/${newCourseId}`);

    } catch (err: any) {
      console.error('Error creating course:', err);
      setError(err.message || 'Ocurrió un error al crear el curso.');
      toast.error(err.message || 'Ocurrió un error al crear el curso.');
    }

    setIsSubmitting(false);
  };

  return (
    <>
      <Header />
      <div className="min-h-screen bg-gray-100 px-4 sm:px-6 lg:px-8 py-4 sm:py-6 lg:py-8 flex justify-center items-center pt-40">
      <div className="max-w-2xl w-full bg-white shadow-lg rounded-lg p-6 sm:p-8">
        <h1 className="text-2xl sm:text-3xl font-bold text-gray-800 mb-6 sm:mb-8 text-center">Crear Nuevo Curso</h1>
        
        <form onSubmit={handleSubmit} className="space-y-6">
          <div>
            <label htmlFor="title" className="block text-sm font-medium text-gray-700 mb-1">
              Título del Curso <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              name="title"
              id="title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              required
              className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-slate-500 focus:border-slate-500 sm:text-sm"
            />
          </div>

          <div>
            <label htmlFor="description" className="block text-sm font-medium text-gray-700 mb-1">
              Descripción del Curso <span className="text-red-500">*</span>
            </label>
            <textarea
              name="description"
              id="description"
              rows={4}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              required
              className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-slate-500 focus:border-slate-500 sm:text-sm"
            />
          </div>

          <div>
            <label htmlFor="status" className="block text-sm font-medium text-gray-700 mb-1">
              Estado
            </label>
            <select
              name="status"
              id="status"
              value={status}
              onChange={(e) => setStatus(e.target.value as 'draft' | 'published')}
              className="mt-1 block w-full px-3 py-2 border border-gray-300 bg-white rounded-md shadow-sm focus:outline-none focus:ring-slate-500 focus:border-slate-500 sm:text-sm"
            >
              <option value="draft">Borrador (Draft)</option>
              <option value="published">Publicado (Published)</option>
            </select>
          </div>

          {error && (
            <p className="text-sm text-red-600 bg-red-100 p-3 rounded-md">{error}</p>
          )}

          <div className="flex flex-col sm:flex-row sm:justify-end sm:space-x-4 space-y-3 sm:space-y-0 pt-4">
            <Link href="/admin/course-builder" legacyBehavior>
              <a className="w-full sm:w-auto px-4 py-2 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 text-center">
                Cancelar
              </a>
            </Link>
            <button
              type="submit"
              disabled={isSubmitting}
              className={`w-full sm:w-auto px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white ${isSubmitting ? 'bg-slate-400 cursor-not-allowed' : 'bg-slate-600 hover:bg-slate-700'} focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-slate-500`}
            >
              {isSubmitting ? 'Creando Curso...' : 'Crear Curso'}
            </button>
          </div>
        </form>
      </div>
    </div>
    </>
  );
};

export default CreateCoursePage;
