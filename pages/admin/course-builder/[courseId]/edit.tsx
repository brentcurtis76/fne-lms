import { useSupabaseClient } from '@supabase/auth-helpers-react';
import { supabase } from '../../../../lib/supabase';
import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import Head from 'next/head';
import Link from 'next/link';

import MainLayout from '../../../../components/layout/MainLayout';
import { toast } from 'react-hot-toast';
import { ConfirmModal } from '../../../../components/common/ConfirmModal';
import ConvertStructureModal from '../../../../components/ConvertStructureModal';

import { getUserPrimaryRole } from '../../../../utils/roleUtils';
interface Course {
  id: string;
  title: string;
  description: string;
  thumbnail_url: string | null;
  instructor_id: string | null;
  structure_type?: 'simple' | 'structured';
}

export default function EditCourse() {
  const supabase = useSupabaseClient();
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
  const [structureType, setStructureType] = useState<'simple' | 'structured'>('structured');
  const [hasExistingModules, setHasExistingModules] = useState(false);
  
  // Instructors data
  const [instructors, setInstructors] = useState<any[]>([]);
  const [loadingInstructors, setLoadingInstructors] = useState(false);
  
  // Confirmation modal state
  const [showInstructorChangeModal, setShowInstructorChangeModal] = useState(false);
  
  // Structure conversion modal state
  const [showConversionModal, setShowConversionModal] = useState(false);
  const [isConverting, setIsConverting] = useState(false);
  const [moduleCount, setModuleCount] = useState(0);
  const [lessonCount, setLessonCount] = useState(0);
  const [pendingInstructorChange, setPendingInstructorChange] = useState<{
    oldName: string;
    newName: string;
  } | null>(null);

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
          .select('avatar_url')
          .eq('id', session.user.id)
          .single();
          
        const adminFromMetadata = session.user.user_metadata?.role === 'admin';
        const userRole = await getUserPrimaryRole(session.user.id);
        const adminFromProfile = userRole === 'admin';
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
          setStructureType(courseData.structure_type || 'structured');
          
          // Check if course has existing modules and count them
          const { data: modules, error: modulesError } = await supabase
            .from('modules')
            .select('id')
            .eq('course_id', courseId as string);
          
          if (!modulesError && modules) {
            setModuleCount(modules.length);
            if (modules.length > 0) {
              setHasExistingModules(true);
            }
          }
          
          // Count lessons
          const { data: lessons, error: lessonsError } = await supabase
            .from('lessons')
            .select('id')
            .eq('course_id', courseId as string);
          
          if (!lessonsError && lessons) {
            setLessonCount(lessons.length);
          }
          
          // Log for debugging instructor changes
          console.log('[EditCourse] Loaded course:', {
            id: courseData.id,
            title: courseData.title,
            instructor_id: courseData.instructor_id,
            structure_type: courseData.structure_type,
            has_modules: modules?.length > 0
          });
          
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

  const performSave = async () => {
    try {
      let thumbnailUrl = currentThumbnailUrl;
      
      // Upload new thumbnail if provided
      if (thumbnail) {
        thumbnailUrl = await uploadThumbnail(thumbnail);
      }
      
      console.log('[EditCourse] Saving course with instructor:', instructor);
      
      // Update course
      const { error } = await supabase
        .from('courses')
        .update({
          title: title.trim(),
          description: description.trim(),
          instructor_id: instructor || null,
          thumbnail_url: thumbnailUrl,
          structure_type: structureType
        })
        .eq('id', courseId as string);
        
      if (error) {
        throw error;
      }
      
      toast.success('Curso actualizado exitosamente');
      router.push(`/admin/course-builder/${courseId}`);
    } catch (error: any) {
      throw error;
    }
  };

  const handleStructureConversion = async () => {
    if (!course || !courseId) return;
    
    setIsConverting(true);
    const targetStructure = structureType === 'simple' ? 'structured' : 'simple';
    
    try {
      // Perform the conversion
      if (targetStructure === 'simple') {
        // Converting to simple - flatten all module lessons
        const { data: moduleLessons } = await supabase
          .from('lessons')
          .select('*')
          .eq('course_id', courseId as string)
          .not('module_id', 'is', null);
        
        if (moduleLessons && moduleLessons.length > 0) {
          // Update all lessons to remove module_id
          for (const lesson of moduleLessons) {
            await supabase
              .from('lessons')
              .update({ module_id: null })
              .eq('id', lesson.id);
          }
        }
        
        // Delete all modules
        await supabase
          .from('modules')
          .delete()
          .eq('course_id', courseId as string);
          
      } else {
        // Converting to structured - create a default module
        const { data: newModule } = await supabase
          .from('modules')
          .insert({
            course_id: courseId as string,
            title: 'Módulo Principal',
            description: 'Módulo creado durante conversión de estructura',
            order_number: 1
          })
          .select()
          .single();
        
        if (newModule) {
          // Move all direct lessons to the new module
          const { data: directLessons } = await supabase
            .from('lessons')
            .select('*')
            .eq('course_id', courseId as string)
            .is('module_id', null);
          
          if (directLessons && directLessons.length > 0) {
            for (const lesson of directLessons) {
              await supabase
                .from('lessons')
                .update({ module_id: newModule.id })
                .eq('id', lesson.id);
            }
          }
        }
      }
      
      // Update course structure type
      await supabase
        .from('courses')
        .update({ structure_type: targetStructure })
        .eq('id', courseId as string);
      
      toast.success(`Curso convertido a estructura ${targetStructure === 'simple' ? 'simple' : 'modular'} exitosamente`);
      
      // Reload the page to reflect changes
      router.reload();
      
    } catch (error: any) {
      console.error('Error converting structure:', error);
      toast.error('Error al convertir la estructura del curso');
    } finally {
      setIsConverting(false);
      setShowConversionModal(false);
    }
  };

  const handleInstructorChangeConfirm = async () => {
    setShowInstructorChangeModal(false);
    setPendingInstructorChange(null);
    setSaving(true);
    
    try {
      console.warn('[EditCourse] INSTRUCTOR CHANGE CONFIRMED:', {
        courseId,
        title: course?.title,
        old_instructor_id: course?.instructor_id,
        new_instructor_id: instructor || null
      });
      
      await performSave();
    } catch (error: any) {
      console.error('Error updating course:', error);
      toast.error('Error al actualizar el curso: ' + error.message);
    } finally {
      setSaving(false);
    }
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
      
      // Check if instructor is being changed
      if (course && course.instructor_id !== instructor) {
        const oldInstructorName = instructors.find(i => i.id === course.instructor_id)?.full_name || 'Sin instructor';
        const newInstructorName = instructors.find(i => i.id === instructor)?.full_name || 'Sin instructor';
        
        // Show confirmation modal
        setPendingInstructorChange({
          oldName: oldInstructorName,
          newName: newInstructorName
        });
        setShowInstructorChangeModal(true);
        setSaving(false);
        return;
      }
      
      // Proceed with save if no instructor change
      await performSave();
      
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
          <p className="text-xl text-red-600 font-sans">Curso no encontrado</p>
          <Link href="/admin/course-builder" legacyBehavior>
            <a className="mt-4 px-4 py-2 bg-brand_blue text-white font-sans rounded hover:bg-brand_yellow hover:text-brand_blue transition">
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
                <a className="text-brand_blue hover:text-brand_yellow font-sans hover:underline mb-4 inline-block">
                  ← Volver al Curso
                </a>
              </Link>
              <h1 className="text-3xl font-bold text-brand_blue font-sans">Editar Curso</h1>
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

                {/* Structure Type */}
                <div>
                  <label className="block text-sm font-medium text-brand_blue mb-2">
                    Estructura del Curso
                  </label>
                  <div className="space-y-2">
                    <div className="flex items-start space-x-3">
                      <input
                        type="radio"
                        id="structure-simple"
                        name="structure"
                        value="simple"
                        checked={structureType === 'simple'}
                        onChange={() => setStructureType('simple')}
                        disabled={hasExistingModules}
                        className="mt-1"
                      />
                      <label htmlFor="structure-simple" className="cursor-pointer">
                        <div className="font-medium text-gray-900">Simple</div>
                        <div className="text-sm text-gray-500">
                          Las lecciones se organizan directamente en el curso sin módulos.
                          Ideal para cursos cortos con pocas lecciones.
                        </div>
                      </label>
                    </div>
                    <div className="flex items-start space-x-3">
                      <input
                        type="radio"
                        id="structure-structured"
                        name="structure"
                        value="structured"
                        checked={structureType === 'structured'}
                        onChange={() => setStructureType('structured')}
                        className="mt-1"
                      />
                      <label htmlFor="structure-structured" className="cursor-pointer">
                        <div className="font-medium text-gray-900">Estructurado</div>
                        <div className="text-sm text-gray-500">
                          Las lecciones se organizan en módulos. 
                          Ideal para cursos completos con múltiples temas.
                        </div>
                      </label>
                    </div>
                    {hasExistingModules && (
                      <div className="mt-2 p-3 bg-yellow-50 border border-yellow-200 rounded-md">
                        <p className="text-sm text-yellow-800">
                          <strong>Nota:</strong> Este curso ya tiene módulos creados. 
                          Para cambiar a estructura simple, primero debe eliminar todos los módulos.
                        </p>
                      </div>
                    )}
                    
                    {/* Conversion button - shown when structure differs from current */}
                    {course.structure_type && course.structure_type !== structureType && (
                      <div className="mt-4">
                        <button
                          type="button"
                          onClick={() => setShowConversionModal(true)}
                          className="inline-flex items-center px-4 py-2 border border-brand_blue text-brand_blue rounded-md hover:bg-brand_blue hover:text-white transition-colors"
                        >
                          <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                          </svg>
                          Convertir a estructura {structureType === 'simple' ? 'simple' : 'modular'}
                        </button>
                        <p className="text-xs text-gray-500 mt-2">
                          Esta acción reorganizará las lecciones del curso según la nueva estructura seleccionada.
                        </p>
                      </div>
                    )}
                  </div>
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
        
        {/* Instructor Change Confirmation Modal */}
        <ConfirmModal
          isOpen={showInstructorChangeModal}
          onClose={() => {
            setShowInstructorChangeModal(false);
            setPendingInstructorChange(null);
          }}
          onConfirm={handleInstructorChangeConfirm}
          title="Cambiar Instructor"
          message={
            pendingInstructorChange
              ? `¿Estás seguro de que quieres cambiar el instructor de "${pendingInstructorChange.oldName}" a "${pendingInstructorChange.newName}"? Este cambio afectará cómo se muestra el curso.`
              : ''
          }
          confirmText="Sí, cambiar"
          cancelText="Cancelar"
          isDangerous={false}
        />
        
        {/* Structure Conversion Modal */}
        <ConvertStructureModal
          isOpen={showConversionModal}
          onClose={() => setShowConversionModal(false)}
          onConfirm={handleStructureConversion}
          courseTitle={course.title}
          currentStructure={course.structure_type || 'structured'}
          targetStructure={structureType}
          moduleCount={moduleCount}
          lessonCount={lessonCount}
          isConverting={isConverting}
        />
    </MainLayout>
  );
}