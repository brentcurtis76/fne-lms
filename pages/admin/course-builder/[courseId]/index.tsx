import React, { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/router';
import Link from 'next/link';
import { supabase } from '../../../../lib/supabase';
import { toast } from 'react-hot-toast';
import Header from '../../../../components/layout/Header';
import DeleteModuleModal from '../../../../components/DeleteModuleModal';
import EditModuleModal from '../../../../components/EditModuleModal';

interface Course {
  id: string;
  title: string;
  description: string;
  // Add other course fields if needed
}

interface Module {
  id: string;
  title: string;
  description: string | null;
  order_number: number;
  course_id: string;
  // Add other module fields if needed
}

const CourseDetailPage = () => {
  const router = useRouter();
  const { courseId } = router.query;

  const [user, setUser] = useState<any>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [course, setCourse] = useState<Course | null>(null);
  const [modules, setModules] = useState<Module[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [avatarUrl, setAvatarUrl] = useState<string>('');

  const [showCreateModuleForm, setShowCreateModuleForm] = useState<boolean>(false);
  const [newModuleTitle, setNewModuleTitle] = useState<string>('');
  const [newModuleDescription, setNewModuleDescription] = useState<string>('');
  const [isSubmittingModule, setIsSubmittingModule] = useState<boolean>(false);

  // State for delete confirmation modal
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [selectedModuleForDeletion, setSelectedModuleForDeletion] = useState<Module | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // State for edit module modal
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [selectedModuleForEdit, setSelectedModuleForEdit] = useState<Module | null>(null);
  const [isUpdating, setIsUpdating] = useState(false);

  // Check authentication and admin status
  useEffect(() => {
    const checkSession = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session?.user) {
          router.push('/login');
          return;
        }
        
        setUser(session.user);
        
        // Check if user is admin and get avatar
        const { data: profileData } = await supabase
          .from('profiles')
          .select('role, avatar_url')
          .eq('id', session.user.id)
          .single();
          
        const adminFromMetadata = session.user.user_metadata?.role === 'admin';
        const adminFromProfile = profileData?.role === 'admin';
        setIsAdmin(adminFromMetadata || adminFromProfile);
        
        // Set avatar URL if available
        if (profileData?.avatar_url) {
          setAvatarUrl(profileData.avatar_url);
        }
        
      } catch (error) {
        console.error('Error checking session:', error);
        router.push('/login');
      }
    };
    
    checkSession();
  }, [router]);

  const fetchCourseAndModules = useCallback(async () => {
    if (!courseId) return;
    setLoading(true);
    setError(null);

    try {
      const { data: courseData, error: courseError } = await supabase
        .from('courses')
        .select('*')
        .eq('id', courseId as string)
        .single();

      if (courseError) throw courseError;
      if (!courseData) throw new Error('Curso no encontrado.');
      setCourse(courseData as Course);

      const { data: modulesData, error: modulesError } = await supabase
        .from('modules')
        .select('*')
        .eq('course_id', courseId as string)
        .order('order_number', { ascending: true });

      console.log('Fetched Modules Data for courseId:', courseId, modulesData);
      if (modulesError) {
        console.error('Error fetching modules:', modulesError);
      }

      if (modulesError) throw modulesError;
      setModules(modulesData as Module[]);

    } catch (err: any) {
      console.error('Error fetching course details or modules:', err);
      setError(err.message || 'Ocurrió un error al cargar los datos del curso.');
    }
    setLoading(false);
  }, [courseId, supabase]);

  const handleModuleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newModuleTitle.trim()) {
      toast.error('El título del módulo es obligatorio.');
      return;
    }
    if (!courseId) {
      toast.error('ID del curso no encontrado. No se puede crear el módulo.');
      return;
    }

    setIsSubmittingModule(true);
    try {
      const nextOrderNumber = modules.length + 1;
      const { error: insertError } = await supabase.from('modules').insert([
        {
          title: newModuleTitle,
          description: newModuleDescription,
          course_id: courseId as string,
          order_number: nextOrderNumber,
        },
      ]);

      if (insertError) {
        throw insertError;
      }

      toast.success('Módulo creado exitosamente!');
      setNewModuleTitle('');
      setNewModuleDescription('');
      setShowCreateModuleForm(false);
      await fetchCourseAndModules();
    } catch (err: any) {
      console.error('Error creating module:', err);
      toast.error(err.message || 'No se pudo crear el módulo.');
    } finally {
      setIsSubmittingModule(false);
    }
  };

  // Handler to open the delete confirmation modal
  const handleOpenDeleteModal = (module: Module) => {
    setSelectedModuleForDeletion(module);
    setIsDeleteModalOpen(true);
  };

  // Handler to close the delete confirmation modal
  const handleCloseDeleteModal = () => {
    setSelectedModuleForDeletion(null);
    setIsDeleteModalOpen(false);
  };

  // Handler for actual deletion
  const handleConfirmDelete = async () => {
    if (!selectedModuleForDeletion) {
      toast.error('No se ha seleccionado ningún módulo para eliminar.');
      return;
    }

    const moduleIdToDelete = selectedModuleForDeletion.id;
    console.log('[DeleteModule] Starting deletion for module:', selectedModuleForDeletion.title);
    setIsDeleting(true);
    const loadingToastId = toast.loading('Eliminando módulo y lecciones...');

    try {
      // Step 1: Get all lessons for this module
      console.log('[DeleteModule] Getting lessons for module:', moduleIdToDelete);
      const { data: lessons, error: lessonsError } = await supabase
        .from('lessons')
        .select('id')
        .eq('module_id', moduleIdToDelete);

      if (lessonsError) {
        console.log('[DeleteModule] Error getting lessons:', lessonsError);
        // Continue anyway - we'll still try to delete the module
      }

      const lessonIds = lessons?.map(lesson => lesson.id) || [];
      console.log('[DeleteModule] Found lesson IDs:', lessonIds);

      // Step 2: Delete all blocks for all lessons in this module
      if (lessonIds.length > 0) {
        console.log('[DeleteModule] Deleting blocks for lessons:', lessonIds);
        const { error: deleteBlocksError } = await supabase
          .from('blocks')
          .delete()
          .in('lesson_id', lessonIds);
        
        if (deleteBlocksError) {
          console.log('[DeleteModule] Block deletion failed, continuing anyway:', deleteBlocksError);
        }
      }

      // Step 3: Delete all lessons for this module
      console.log('[DeleteModule] Deleting lessons for module:', moduleIdToDelete);
      const { error: deleteLessonsError } = await supabase
        .from('lessons')
        .delete()
        .eq('module_id', moduleIdToDelete);
      
      if (deleteLessonsError) {
        console.log('[DeleteModule] Lesson deletion failed, continuing anyway:', deleteLessonsError);
      }

      // Step 4: Delete the module itself
      console.log('[DeleteModule] Deleting module:', moduleIdToDelete);
      const { error: deleteModuleError } = await supabase
        .from('modules')
        .delete()
        .eq('id', moduleIdToDelete);
      
      if (deleteModuleError) {
        throw new Error(deleteModuleError.message || 'Error al eliminar el módulo.');
      }

      console.log('[DeleteModule] Module deleted successfully from DB.');
      toast.success('Módulo y todas sus lecciones eliminados exitosamente');
      
      // Update the modules list by removing the deleted module
      setModules(prevModules => prevModules.filter(module => module.id !== moduleIdToDelete));
      handleCloseDeleteModal();

    } catch (error: any) {
      console.error('[DeleteModule] Failed to delete module:', error.message);
      toast.error(`Error al eliminar: ${error.message}`);
    } finally {
      toast.dismiss(loadingToastId);
      setIsDeleting(false);
    }
  };

  // Handler to open the edit module modal
  const handleOpenEditModal = (module: Module) => {
    setSelectedModuleForEdit(module);
    setIsEditModalOpen(true);
  };

  // Handler to close the edit module modal
  const handleCloseEditModal = () => {
    setSelectedModuleForEdit(null);
    setIsEditModalOpen(false);
  };

  // Handler for updating module
  const handleConfirmEdit = async (newTitle: string, newDescription: string) => {
    if (!selectedModuleForEdit) {
      toast.error('No se ha seleccionado ningún módulo para editar.');
      return;
    }

    const moduleIdToUpdate = selectedModuleForEdit.id;
    console.log('[EditModule] Starting update for module:', selectedModuleForEdit.title);
    setIsUpdating(true);
    const loadingToastId = toast.loading('Actualizando módulo...');

    try {
      // Update the module in the database
      const { error: updateError } = await supabase
        .from('modules')
        .update({ 
          title: newTitle,
          description: newDescription || null
        })
        .eq('id', moduleIdToUpdate);
      
      if (updateError) {
        throw new Error(updateError.message || 'Error al actualizar el módulo.');
      }

      console.log('[EditModule] Module updated successfully.');
      toast.success('Módulo actualizado exitosamente');
      
      // Update the modules list with the new data
      setModules(prevModules => 
        prevModules.map(module => 
          module.id === moduleIdToUpdate 
            ? { ...module, title: newTitle, description: newDescription || null }
            : module
        )
      );
      handleCloseEditModal();

    } catch (error: any) {
      console.error('[EditModule] Failed to update module:', error.message);
      toast.error(`Error al actualizar: ${error.message}`);
    } finally {
      toast.dismiss(loadingToastId);
      setIsUpdating(false);
    }
  };

  useEffect(() => {
    if (courseId) {
      fetchCourseAndModules();
    }
  }, [courseId, fetchCourseAndModules]);

  if (loading || !user) {
    return (
      <div className="min-h-screen bg-brand_beige flex justify-center items-center">
        <p className="text-xl text-brand_blue font-mont">Cargando...</p>
      </div>
    );
  }

  if (error) {
    return (
      <>
        <Header user={user} isAdmin={isAdmin} avatarUrl={avatarUrl} />
        <div className="min-h-screen bg-brand_beige flex flex-col items-center justify-center h-screen p-4" style={{paddingTop: '120px'}}>
          <p className="text-xl text-red-600 font-mont">Error: {error}</p>
          <Link href="/admin/course-builder" legacyBehavior>
            <a className="mt-4 px-4 py-2 bg-brand_blue text-white font-mont rounded hover:bg-brand_yellow hover:text-brand_blue transition">
              Volver a Cursos
            </a>
          </Link>
        </div>
      </>
    );
  }

  if (!course) {
    return (
      <>
        <Header user={user} isAdmin={isAdmin} avatarUrl={avatarUrl} />
        <div className="min-h-screen bg-brand_beige flex justify-center items-center" style={{paddingTop: '120px'}}>
          <p className="text-xl text-brand_blue font-mont">Curso no encontrado.</p>
        </div>
      </>
    );
  }

  return (
    <>
      <Header user={user} isAdmin={isAdmin} avatarUrl={avatarUrl} />
      <div className="min-h-screen bg-brand_beige px-4 sm:px-6 lg:px-8 py-4 sm:py-6 lg:py-8" style={{marginTop: '120px'}}>
      <div className="max-w-4xl mx-auto bg-white shadow-lg rounded-lg p-6 mt-8">
        <div className="mb-6 flex justify-between items-center">
          <Link href="/admin/course-builder" legacyBehavior>
            <a className="text-brand_blue hover:text-brand_yellow font-mont hover:underline">
              &larr; Volver a Cursos
            </a>
          </Link>
          <div className="flex gap-3">
            <Link href={`/admin/course-builder/${courseId}/edit`} legacyBehavior>
              <a className="px-4 py-2 bg-gray-600 text-white font-mont rounded-md hover:bg-gray-700 transition duration-150">
                Editar Información
              </a>
            </Link>
            <button 
              onClick={() => setShowCreateModuleForm(true)} 
              className="px-4 py-2 bg-brand_blue text-white font-mont rounded-md hover:bg-brand_yellow hover:text-brand_blue transition duration-150"
            >
              Crear Módulo
            </button>
          </div>
        </div>

        <div className="mb-8 border-b border-brand_blue/20 pb-4">
          <h1 className="text-3xl font-bold text-brand_blue font-mont mb-2">{course.title}</h1>
          <p className="text-brand_blue text-md">{course.description}</p>
        </div>

        <h2 className="text-2xl font-semibold text-brand_blue font-mont mb-4">Módulos del Curso</h2>
        
        {/* Form to create a new module (inline) */}
        {showCreateModuleForm && (
          <div className="bg-white p-6 rounded-lg shadow-md mb-6 border border-brand_blue/30">
            <h3 className="text-xl font-semibold text-brand_blue font-mont mb-4">Crear Nuevo Módulo</h3>
            <form onSubmit={handleModuleSubmit} className="space-y-4">
              <div>
                <label htmlFor="newModuleTitle" className="block text-sm font-medium text-brand_blue mb-1">
                  Título del Módulo <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  id="newModuleTitle"
                  value={newModuleTitle}
                  onChange={(e) => setNewModuleTitle(e.target.value)}
                  className="w-full px-4 py-2 border border-brand_blue/50 rounded-md focus:outline-none focus:ring-2 focus:ring-brand_blue"
                  placeholder="Ej: Fundamentos de la IA"
                  required
                />
              </div>
              <div>
                <label htmlFor="newModuleDescription" className="block text-sm font-medium text-brand_blue mb-1">
                  Descripción (Opcional)
                </label>
                <textarea
                  id="newModuleDescription"
                  value={newModuleDescription}
                  onChange={(e) => setNewModuleDescription(e.target.value)}
                  rows={3}
                  className="w-full px-4 py-2 border border-brand_blue/50 rounded-md focus:outline-none focus:ring-2 focus:ring-brand_blue"
                  placeholder="Describe brevemente el contenido del módulo..."
                ></textarea>
              </div>
              <div className="flex items-center justify-end space-x-3 pt-2">
                <button
                  type="button"
                  onClick={() => {
                    setShowCreateModuleForm(false);
                    setNewModuleTitle('');
                    setNewModuleDescription('');
                  }}
                  className="px-4 py-2 text-sm font-medium text-brand_blue hover:text-brand_yellow transition rounded-md border border-brand_blue/50 hover:border-brand_yellow"
                  disabled={isSubmittingModule}
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 text-sm font-medium text-white bg-brand_blue rounded-md hover:bg-brand_yellow hover:text-brand_blue transition"
                  disabled={isSubmittingModule}
                >
                  {isSubmittingModule ? 'Guardando...' : 'Guardar Módulo'}
                </button>
              </div>
            </form>
          </div>
        )}

        {modules.length > 0 ? (
          <ul className="space-y-4">
            {modules.map((moduleItem) => (
              <li key={moduleItem.id} className="bg-white p-4 rounded-md shadow-sm border border-brand_blue/20">
                <div className="flex justify-between items-start">
                  <div>
                    <h3 className="text-xl font-semibold text-brand_blue font-mont">{moduleItem.order_number}. {moduleItem.title}</h3>
                    {moduleItem.description && (
                      <p className="text-brand_blue/80 mt-1 text-sm">{moduleItem.description}</p>
                    )}
                  </div>
                  <div className="flex flex-wrap space-x-2 gap-y-2 ml-4">
                    <Link href={`/admin/course-builder/${courseId}/${moduleItem.id}`} legacyBehavior>
                      <a className="px-3 py-2 bg-brand_yellow text-brand_blue font-mont text-xs md:text-sm rounded-md hover:bg-brand_blue hover:text-brand_yellow transition duration-150 whitespace-nowrap">
                        Ver Lecciones
                      </a>
                    </Link>
                    <button
                      onClick={() => handleOpenEditModal(moduleItem)}
                      className="px-3 py-2 bg-brand_blue text-white font-mont text-xs md:text-sm rounded-md hover:bg-brand_blue/90 transition duration-150 whitespace-nowrap"
                    >
                      Editar
                    </button>
                    <button
                      onClick={() => handleOpenDeleteModal(moduleItem)}
                      className="px-3 py-2 bg-red-600 text-white font-mont text-xs md:text-sm rounded-md hover:bg-red-700 transition duration-150 whitespace-nowrap"
                    >
                      Eliminar
                    </button>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-brand_blue/80 font-mont">Este curso aún no tiene módulos.</p>
        )}
      </div>
      
      {/* Delete Module Modal */}
      {isDeleteModalOpen && selectedModuleForDeletion && (
        <DeleteModuleModal
          moduleTitle={selectedModuleForDeletion.title}
          isOpen={isDeleteModalOpen}
          onClose={handleCloseDeleteModal}
          onConfirm={handleConfirmDelete}
          isDeleting={isDeleting}
        />
      )}

      {/* Edit Module Modal */}
      {isEditModalOpen && selectedModuleForEdit && (
        <EditModuleModal
          moduleId={selectedModuleForEdit.id}
          moduleTitle={selectedModuleForEdit.title}
          moduleDescription={selectedModuleForEdit.description}
          isOpen={isEditModalOpen}
          onClose={handleCloseEditModal}
          onConfirm={handleConfirmEdit}
          isUpdating={isUpdating}
        />
      )}
    </div>
    </>
  );
};

export default CourseDetailPage;
