import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import Head from 'next/head';
import Link from 'next/link';
import { supabase } from '../../../../lib/supabase';
import MainLayout from '../../../../components/layout/MainLayout';
import { toast } from 'react-hot-toast';

interface Course {
  id: string;
  title: string;
  description: string;
  thumbnail_url: string | null;
  instructor_id: string | null;
}

export default function EditCourse() {
  const router = useRouter();
  const { courseId } = router.query;
  
  const [user, setUser] = useState<any>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [avatarUrl, setAvatarUrl] = useState<string>('');
  
  // Course data
  const [course, setCourse] = useState<Course | null>(null);
  
  // Form state
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [instructor, setInstructor] = useState('');
  const [thumbnail, setThumbnail] = useState<File | null>(null);
  const [currentThumbnailUrl, setCurrentThumbnailUrl] = useState<string | null>(null);
  
  // Instructors data
  const [instructors, setInstructors] = useState<any[]>([]);
  const [loadingInstructors, setLoadingInstructors] = useState(false);

  useEffect(() => {
    const checkAuthAndLoadCourse = async () => {
      try {
        // Check authentication
        const { data: { session } } = await supabase.auth.getSession();
        if (!session?.user) {
          router.push('/login');
          return;
        }
        
        setUser(session.user);
        
        // Check admin status
        const { data: profileData } = await supabase
          .from('profiles')
          .select('role, avatar_url')
          .eq('id', session.user.id)
          .single();
          
        const adminFromMetadata = session.user.user_metadata?.role === 'admin';
        const adminFromProfile = profileData?.role === 'admin';
        const isAdminUser = adminFromMetadata || adminFromProfile;
        setIsAdmin(isAdminUser);
        
        // Set avatar URL
        if (profileData?.avatar_url) {
          setAvatarUrl(profileData.avatar_url);
        }
        
        if (!isAdminUser) {
          router.push('/dashboard');
          return;
        }
        
        // Load course data
        if (courseId) {
          const { data: courseData, error } = await supabase
            .from('courses')
            .select('*')
            .eq('id', courseId as string)
            .single();
            
          if (error) {
            console.error('Error loading course:', error);
            toast.error('Error al cargar el curso');
            return;
          }
          
          setCourse(courseData);
          setTitle(courseData.title);
          setDescription(courseData.description);
          setInstructor(courseData.instructor_id || '');
          setCurrentThumbnailUrl(courseData.thumbnail_url);
          
          // Fetch instructors
          fetchInstructors();
        }
        
      } catch (error) {
        console.error('Error in auth check:', error);
        router.push('/login');
      } finally {
        setLoading(false);
      }
    };
    
    checkAuthAndLoadCourse();
  }, [router, courseId]);
  
  // Function to fetch instructors from Supabase
  const fetchInstructors = async () => {
    try {
      setLoadingInstructors(true);
      const { data, error } = await supabase
        .from('instructors')
        .select('id, full_name')
        .order('full_name', { ascending: true });
      
      if (error) {
        throw new Error(error.message);
      }
      
      setInstructors(data || []);
    } catch (err) {
      console.error('Error fetching instructors:', err);
    } finally {
      setLoadingInstructors(false);
    }
  };

  const uploadThumbnail = async (file: File): Promise<string> => {
    const fileExt = file.name.split('.').pop();
    const fileName = `${Math.random()}.${fileExt}`;
    const filePath = `course-thumbnails/${fileName}`;

    const { error: uploadError } = await supabase.storage
      .from('course-assets')
      .upload(filePath, file);

    if (uploadError) {
      throw uploadError;
    }

    const { data } = supabase.storage
      .from('course-assets')
      .getPublicUrl(filePath);

    return data.publicUrl;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!title.trim()) {
      toast.error('El título es requerido');
      return;
    }
    
    setSaving(true);
    
    try {
      let thumbnailUrl = currentThumbnailUrl;
      
      // Upload new thumbnail if provided
      if (thumbnail) {
        thumbnailUrl = await uploadThumbnail(thumbnail);
      }
      
      // Update course
      const { error } = await supabase
        .from('courses')
        .update({
          title: title.trim(),
          description: description.trim(),
          instructor_id: instructor || null,
          thumbnail_url: thumbnailUrl
        })
        .eq('id', courseId as string);
        
      if (error) {
        throw error;
      }
      
      toast.success('Curso actualizado exitosamente');
      router.push(`/admin/course-builder/${courseId}`);
      
    } catch (error: any) {
      console.error('Error updating course:', error);
      toast.error('Error al actualizar el curso: ' + error.message);
    } finally {
      setSaving(false);
    }
  };

  const handleThumbnailChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      setThumbnail(e.target.files[0]);
    }
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    localStorage.removeItem('rememberMe');
    sessionStorage.removeItem('sessionOnly');
    router.push('/login');
  };

  if (loading || !user) {
    return (
      <div className="min-h-screen bg-brand_beige flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-brand_blue mx-auto"></div>
          <p className="mt-4 text-brand_blue font-medium">Cargando...</p>
        </div>
      </div>
    );
  }

  if (!course) {
    return (
      <MainLayout 
        user={user} 
        currentPage="courses"
        pageTitle="Curso no encontrado"
        isAdmin={isAdmin}
        onLogout={handleLogout}
        avatarUrl={avatarUrl}
      >
        <div className="flex flex-col items-center justify-center min-h-[50vh]">
          <p className="text-xl text-red-600 font-mont">Curso no encontrado</p>
          <Link href="/admin/course-builder" legacyBehavior>
            <a className="mt-4 px-4 py-2 bg-brand_blue text-white font-mont rounded hover:bg-brand_yellow hover:text-brand_blue transition">
              Volver a Cursos
            </a>
          </Link>
        </div>
      </MainLayout>
    );
  }

  return (
    <MainLayout 
      user={user} 
      currentPage="courses"
      pageTitle={`Editar: ${course.title}`}
      breadcrumbs={[
        { label: 'Cursos', href: '/admin/course-builder' },
        { label: course.title, href: `/admin/course-builder/${courseId}` },
        { label: 'Editar' }
      ]}
      isAdmin={isAdmin}
      onLogout={handleLogout}
      avatarUrl={avatarUrl}
    >
      <div className="container mx-auto px-4 py-8">
        <div className="max-w-2xl mx-auto">
            
            {/* Header */}
            <div className="mb-8">
              <Link href={`/admin/course-builder/${courseId}`} legacyBehavior>
                <a className="text-brand_blue hover:text-brand_yellow font-mont hover:underline mb-4 inline-block">
                  ← Volver al Curso
                </a>
              </Link>
              <h1 className="text-3xl font-bold text-brand_blue font-mont">Editar Curso</h1>
              <p className="text-gray-600 mt-2">Modifica la información general del curso</p>
            </div>

            {/* Form */}
            <div className="bg-white rounded-lg shadow-lg p-6">
              <form onSubmit={handleSubmit} className="space-y-6">
                
                {/* Title */}
                <div>
                  <label htmlFor="title" className="block text-sm font-medium text-brand_blue mb-2">
                    Título del Curso <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    id="title"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    className="w-full px-4 py-3 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-brand_blue focus:border-transparent"
                    placeholder="Ej: Introducción a la Inteligencia Artificial"
                    required
                  />
                </div>

                {/* Description */}
                <div>
                  <label htmlFor="description" className="block text-sm font-medium text-brand_blue mb-2">
                    Descripción
                  </label>
                  <textarea
                    id="description"
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    rows={4}
                    className="w-full px-4 py-3 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-brand_blue focus:border-transparent"
                    placeholder="Describe el contenido y objetivos del curso..."
                  />
                </div>

                {/* Instructor */}
                <div>
                  <label htmlFor="instructor" className="block text-sm font-medium text-brand_blue mb-2">
                    Instructor
                  </label>
                  <select
                    id="instructor"
                    value={instructor}
                    onChange={(e) => setInstructor(e.target.value)}
                    className="w-full px-4 py-3 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-brand_blue focus:border-transparent"
                    disabled={loadingInstructors}
                  >
                    <option value="">Selecciona un instructor</option>
                    {instructors.map((inst) => (
                      <option key={inst.id} value={inst.id}>
                        {inst.full_name}
                      </option>
                    ))}
                  </select>
                  {loadingInstructors && (
                    <p className="text-sm text-gray-500 mt-1">Cargando instructores...</p>
                  )}
                </div>

                {/* Current Thumbnail */}
                {currentThumbnailUrl && (
                  <div>
                    <label className="block text-sm font-medium text-brand_blue mb-2">
                      Imagen Actual
                    </label>
                    <div className="w-48 h-32 border-2 border-gray-200 rounded-lg overflow-hidden">
                      <img 
                        src={currentThumbnailUrl} 
                        alt="Thumbnail actual" 
                        className="w-full h-full object-cover"
                      />
                    </div>
                  </div>
                )}

                {/* New Thumbnail */}
                <div>
                  <label htmlFor="thumbnail" className="block text-sm font-medium text-brand_blue mb-2">
                    {currentThumbnailUrl ? 'Nueva Imagen (opcional)' : 'Imagen del Curso'}
                  </label>
                  <input
                    type="file"
                    id="thumbnail"
                    accept="image/*"
                    onChange={handleThumbnailChange}
                    className="w-full px-4 py-3 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-brand_blue focus:border-transparent"
                  />
                  <p className="text-sm text-gray-500 mt-1">
                    Formatos soportados: JPG, PNG, GIF (max 5MB)
                  </p>
                </div>

                {/* Preview new thumbnail */}
                {thumbnail && (
                  <div>
                    <label className="block text-sm font-medium text-brand_blue mb-2">
                      Vista Previa Nueva Imagen
                    </label>
                    <div className="w-48 h-32 border-2 border-gray-200 rounded-lg overflow-hidden">
                      <img 
                        src={URL.createObjectURL(thumbnail)} 
                        alt="Vista previa" 
                        className="w-full h-full object-cover"
                      />
                    </div>
                  </div>
                )}

                {/* Submit Buttons */}
                <div className="flex items-center justify-end space-x-4 pt-6 border-t border-gray-200">
                  <Link href={`/admin/course-builder/${courseId}`} legacyBehavior>
                    <a className="px-6 py-3 border border-gray-300 text-gray-700 rounded-md hover:bg-gray-50 transition font-medium">
                      Cancelar
                    </a>
                  </Link>
                  <button
                    type="submit"
                    disabled={saving || !title.trim()}
                    className="px-6 py-3 bg-brand_blue text-white rounded-md hover:bg-brand_yellow hover:text-brand_blue transition font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {saving ? 'Guardando...' : 'Guardar Cambios'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
    </MainLayout>
  );
}