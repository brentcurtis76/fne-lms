import { useRouter } from 'next/router';
import { useEffect, useState } from 'react';
import { supabase } from '../../../../../lib/supabase';
import Link from 'next/link';
import Head from 'next/head';
import { ArrowLeftIcon, PlusCircleIcon } from '@heroicons/react/24/solid';
import { toast } from 'react-hot-toast';
import Header from '../../../../../components/layout/Header';
import DeleteLessonModal from '../../../../../components/DeleteLessonModal';
import MoveLessonModal from '../../../../../components/MoveLessonModal';

interface Module {
  id: string;
  title: string;
  description: string;
  course_id: string;
  order_number: number;
}

interface Lesson {
  id: string;
  title: string;
  module_id: string;
  order_number: number;
}

// Basic UUID validation
const isValidUUID = (uuid: string | undefined): uuid is string => {
  if (!uuid) return false;
  const regex = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;
  return regex.test(uuid);
};

const ModuleDetailPage = () => {
  const router = useRouter();
  const courseIdQuery = router.query.courseId;
  const moduleIdQuery = router.query.moduleId;

  const [user, setUser] = useState<any>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [avatarUrl, setAvatarUrl] = useState<string>('');
  const [module, setModule] = useState<Module | null>(null);
  const [lessons, setLessons] = useState<Lesson[]>([]); 
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [isCreatingLesson, setIsCreatingLesson] = useState<boolean>(false);
  
  // State for delete confirmation modal
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [selectedLessonForDeletion, setSelectedLessonForDeletion] = useState<Lesson | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // State for move lesson modal
  const [isMoveModalOpen, setIsMoveModalOpen] = useState(false);
  const [selectedLessonForMove, setSelectedLessonForMove] = useState<Lesson | null>(null);
  const [isMoving, setIsMoving] = useState(false);

  useEffect(() => {
    const fetchModuleAndLessons = async () => {
      setLoading(true);
      setError(null);
      setLessons([]); 
      
      // Check authentication first
      try {
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
        setIsAdmin(adminFromMetadata || adminFromProfile);
        
        // Set avatar URL
        if (profileData?.avatar_url) {
          setAvatarUrl(profileData.avatar_url);
        }
        
        if (!adminFromMetadata && !adminFromProfile) {
          router.push('/dashboard');
          return;
        }
      } catch (authError) {
        console.error('Authentication error:', authError);
        router.push('/login');
        return;
      }
      
      console.log('[ModuleDetail] Starting fetchModuleAndLessons...');
      console.log('[ModuleDetail] Raw router.query:', router.query);
      console.log('[ModuleDetail] Extracted courseIdQuery:', courseIdQuery, 'Type:', typeof courseIdQuery);
      console.log('[ModuleDetail] Extracted moduleIdQuery:', moduleIdQuery, 'Type:', typeof moduleIdQuery);

      const courseIdStr = Array.isArray(courseIdQuery) ? courseIdQuery[0] : courseIdQuery;
      const moduleIdStr = Array.isArray(moduleIdQuery) ? moduleIdQuery[0] : moduleIdQuery;

      console.log('[ModuleDetail] Processed courseIdStr:', courseIdStr);
      console.log('[ModuleDetail] Processed moduleIdStr:', moduleIdStr);

      if (!courseIdStr || !moduleIdStr) {
        console.error('[ModuleDetail] courseId or moduleId is missing from URL query after processing.');
        setError('Error: ID del curso o del módulo no encontrado en la URL.');
        setLoading(false);
        return;
      }

      if (!isValidUUID(courseIdStr)) {
        console.error('[ModuleDetail] Invalid courseId UUID:', courseIdStr);
        setError(`Error: El ID del curso ('${courseIdStr}') no es válido.`);
        setLoading(false);
        return;
      }

      if (!isValidUUID(moduleIdStr)) {
        console.error('[ModuleDetail] Invalid moduleId UUID:', moduleIdStr);
        setError(`Error: El ID del módulo ('${moduleIdStr}') no es válido.`);
        setLoading(false);
        return;
      }

      try {
        console.log(`[ModuleDetail] Attempting to fetch module with ID: ${moduleIdStr} for course ID: ${courseIdStr}`);
        const { data: moduleData, error: moduleError } = await supabase
          .from('modules')
          .select('*') // Fetch all columns to match the Module type
          .eq('id', moduleIdStr)
          .eq('course_id', courseIdStr)
          .single();

        if (moduleError) {
          console.error('[ModuleDetail] Supabase error fetching module:', JSON.stringify(moduleError, null, 2));
          setError(`Error al cargar el módulo: ${moduleError.message} (Code: ${moduleError.code})`);
          setModule(null);
        } else if (!moduleData) {
          console.warn('[ModuleDetail] Module not found with ID:', moduleIdStr, 'for course ID:', courseIdStr);
          setError('Módulo no encontrado o no pertenece a este curso.');
          setModule(null);
        } else {
          console.log('[ModuleDetail] Successfully fetched module:', moduleData);
          setModule(moduleData); // moduleData is now the full Module type
        }

        // Fetch Lessons for the Module
        console.log(`[ModuleDetail] Fetching lessons for module ID: ${moduleIdStr}`);
        const { data: lessonsData, error: lessonsError } = await supabase
          .from('lessons')
          .select('*')
          .eq('module_id', moduleIdStr)
          .order('order_number', { ascending: true });

        if (lessonsError) {
          console.error('[ModuleDetail] Supabase error fetching lessons:', JSON.stringify(lessonsError, null, 2));
          setError(`Error al cargar lecciones: ${lessonsError.message} (Code: ${lessonsError.code})`);
          setLessons([]);
        } else {
          console.log('[ModuleDetail] Successfully fetched lessons:', lessonsData);
          setLessons(lessonsData || []);
        }

      } catch (e: any) {
        console.error('[ModuleDetail] Unexpected error in fetchModuleAndLessons:', e);
        setError(`Error inesperado: ${e.message || String(e)}`);
        setModule(null);
        setLessons([]);
      } finally {
        setLoading(false);
        console.log('[ModuleDetail] fetchModuleAndLessons finished.');
      }
    };

    if (router.isReady) {
      console.log('[ModuleDetail] Router is ready, calling fetchModuleAndLessons.');
      fetchModuleAndLessons();
    } else {
      console.log('[ModuleDetail] Router not ready yet, waiting for query parameters...');
    }
  }, [courseIdQuery, moduleIdQuery, supabase, router.isReady]);

  const handleCreateFirstLesson = async () => {
    const courseIdStr = Array.isArray(courseIdQuery) ? courseIdQuery[0] : courseIdQuery;
    const moduleIdStr = Array.isArray(moduleIdQuery) ? moduleIdQuery[0] : moduleIdQuery;

    if (!isValidUUID(courseIdStr) || !isValidUUID(moduleIdStr)) {
      toast.error('IDs de curso o módulo no válidos.');
      return;
    }

    setIsCreatingLesson(true);
    const toastId = toast.loading('Creando primera lección...');

    try {
      console.log(`[ModuleDetail] Creating first lesson for module ID: ${moduleIdStr}`);
      const { data: newLesson, error: insertError } = await supabase
        .from('lessons')
        .insert({
          title: 'Lección 1', // Default title
          module_id: moduleIdStr,
          course_id: courseIdStr,
          order_number: 1, // First lesson
          // content: {}, // Default empty content, or specific structure if needed
        })
        .select()
        .single();

      if (insertError) throw insertError;
      if (!newLesson) throw new Error('No se pudo obtener la lección creada.');

      console.log('[ModuleDetail] Successfully created lesson:', newLesson);
      toast.success('Lección creada! Redirigiendo al editor...', { id: toastId });
      router.push(`/admin/course-builder/${courseIdStr}/${moduleIdStr}/${newLesson.id}`);

    } catch (e: any) {
      console.error('[ModuleDetail] Error creating first lesson:', e);
      toast.error(`Error al crear lección: ${e.message || 'Error desconocido'}`, { id: toastId });
    } finally {
      setIsCreatingLesson(false);
    }
  };

  const handleCreateNewLesson = async () => {
    const courseIdStr = Array.isArray(courseIdQuery) ? courseIdQuery[0] : courseIdQuery;
    const moduleIdStr = Array.isArray(moduleIdQuery) ? moduleIdQuery[0] : moduleIdQuery;

    if (!isValidUUID(courseIdStr) || !isValidUUID(moduleIdStr)) {
      toast.error('IDs de curso o módulo no válidos.');
      return;
    }

    setIsCreatingLesson(true);
    const toastId = toast.loading('Creando nueva lección...');

    try {
      // Calculate the next order number
      const nextOrderNumber = lessons.length + 1;
      
      console.log(`[ModuleDetail] Creating new lesson for module ID: ${moduleIdStr}, order: ${nextOrderNumber}`);
      const { data: newLesson, error: insertError } = await supabase
        .from('lessons')
        .insert({
          title: `Lección ${nextOrderNumber}`, // Default title with order number
          module_id: moduleIdStr,
          course_id: courseIdStr,
          order_number: nextOrderNumber,
        })
        .select()
        .single();

      if (insertError) throw insertError;
      if (!newLesson) throw new Error('No se pudo obtener la lección creada.');

      console.log('[ModuleDetail] Successfully created lesson:', newLesson);
      toast.success('Lección creada! Redirigiendo al editor...', { id: toastId });
      router.push(`/admin/course-builder/${courseIdStr}/${moduleIdStr}/${newLesson.id}`);

    } catch (e: any) {
      console.error('[ModuleDetail] Error creating new lesson:', e);
      toast.error(`Error al crear lección: ${e.message || 'Error desconocido'}`, { id: toastId });
    } finally {
      setIsCreatingLesson(false);
    }
  };

  // Handler to open the delete confirmation modal
  const handleOpenDeleteModal = (lesson: Lesson) => {
    setSelectedLessonForDeletion(lesson);
    setIsDeleteModalOpen(true);
  };

  // Handler to close the delete confirmation modal
  const handleCloseDeleteModal = () => {
    setSelectedLessonForDeletion(null);
    setIsDeleteModalOpen(false);
  };

  // Handler for actual deletion
  const handleConfirmDelete = async () => {
    if (!selectedLessonForDeletion) {
      toast.error('No se ha seleccionado ninguna lección para eliminar.');
      return;
    }

    const lessonIdToDelete = selectedLessonForDeletion.id;
    console.log('[DeleteLesson] Starting deletion for lesson:', selectedLessonForDeletion.title);
    setIsDeleting(true);
    const loadingToastId = toast.loading('Eliminando lección...');

    try {
      // Delete blocks first (if any)
      console.log('[DeleteLesson] Deleting blocks for lesson:', lessonIdToDelete);
      const { error: deleteBlocksError } = await supabase
        .from('blocks')
        .delete()
        .eq('lesson_id', lessonIdToDelete);
      
      if (deleteBlocksError) {
        console.log('[DeleteLesson] Block deletion failed, continuing anyway:', deleteBlocksError);
        // Continue with lesson deletion even if blocks fail
      }

      // Delete the lesson
      console.log('[DeleteLesson] Deleting lesson:', lessonIdToDelete);
      const { error: deleteLessonError } = await supabase
        .from('lessons')
        .delete()
        .eq('id', lessonIdToDelete);
      
      if (deleteLessonError) {
        throw new Error(deleteLessonError.message || 'Error al eliminar la lección.');
      }

      console.log('[DeleteLesson] Lesson deleted successfully from DB.');
      toast.success('Lección eliminada exitosamente');
      
      // Update the lessons list by removing the deleted lesson
      setLessons(prevLessons => prevLessons.filter(lesson => lesson.id !== lessonIdToDelete));
      handleCloseDeleteModal();

    } catch (error: any) {
      console.error('[DeleteLesson] Failed to delete lesson:', error.message);
      toast.error(`Error al eliminar: ${error.message}`);
    } finally {
      toast.dismiss(loadingToastId);
      setIsDeleting(false);
    }
  };

  // Handler to open the move lesson modal
  const handleOpenMoveModal = (lesson: Lesson) => {
    setSelectedLessonForMove(lesson);
    setIsMoveModalOpen(true);
  };

  // Handler to close the move lesson modal
  const handleCloseMoveModal = () => {
    setSelectedLessonForMove(null);
    setIsMoveModalOpen(false);
  };

  // Handler for moving lesson to another module
  const handleConfirmMove = async (targetModuleId: string) => {
    if (!selectedLessonForMove) {
      toast.error('No se ha seleccionado ninguna lección para mover.');
      return;
    }

    const lessonIdToMove = selectedLessonForMove.id;
    console.log('[MoveLesson] Starting move for lesson:', selectedLessonForMove.title, 'to module:', targetModuleId);
    setIsMoving(true);
    const loadingToastId = toast.loading('Moviendo lección...');

    try {
      // Get the target module's current lesson count to set the new order number
      const { data: targetModuleLessons, error: countError } = await supabase
        .from('lessons')
        .select('order_number')
        .eq('module_id', targetModuleId)
        .order('order_number', { ascending: false })
        .limit(1);

      if (countError) {
        console.error('[MoveLesson] Error getting target module lesson count:', countError);
      }

      const newOrderNumber = targetModuleLessons && targetModuleLessons.length > 0 
        ? targetModuleLessons[0].order_number + 1 
        : 1;

      // Update the lesson's module_id and order_number
      const { error: updateError } = await supabase
        .from('lessons')
        .update({ 
          module_id: targetModuleId,
          order_number: newOrderNumber 
        })
        .eq('id', lessonIdToMove);
      
      if (updateError) {
        throw new Error(updateError.message || 'Error al mover la lección.');
      }

      console.log('[MoveLesson] Lesson moved successfully.');
      toast.success('Lección movida exitosamente al nuevo módulo');
      
      // Update the lessons list by removing the moved lesson
      setLessons(prevLessons => prevLessons.filter(lesson => lesson.id !== lessonIdToMove));
      handleCloseMoveModal();

    } catch (error: any) {
      console.error('[MoveLesson] Failed to move lesson:', error.message);
      toast.error(`Error al mover la lección: ${error.message}`);
    } finally {
      toast.dismiss(loadingToastId);
      setIsMoving(false);
    }
  };

  // Loading state
  if (loading || !user) {
    return (
      <div className="flex justify-center items-center h-screen bg-gray-100">
        <Head>
          <title>Cargando Módulo...</title>
        </Head>
        <div className="text-center">
          <div className="loader ease-linear rounded-full border-8 border-t-8 border-gray-200 h-32 w-32 mb-4 mx-auto" style={{borderColor: '#e5e7eb', borderTopColor: '#3b82f6'}}></div>
          <h2 className="text-xl font-semibold text-gray-700">Cargando...</h2>
        </div>
      </div>
    );
  }

  // Error state
  if (error) {
    const courseIdForLink = Array.isArray(courseIdQuery) ? courseIdQuery[0] : courseIdQuery;
    return (
      <>
        <Header user={user} isAdmin={isAdmin} avatarUrl={avatarUrl} />
        <div className="flex flex-col justify-center items-center h-screen bg-red-50 p-4 pt-40">
        <Head>
          <title>Error</title>
        </Head>
        <div className="text-center max-w-md">
          <h2 className="text-2xl font-bold text-red-700 mb-4">Oops! Algo salió mal.</h2>
          <p className="text-red-600 bg-red-100 p-3 rounded-md mb-6 whitespace-pre-wrap">{error}</p>
          {isValidUUID(courseIdForLink) && (
            <Link href={`/admin/course-builder/${courseIdForLink}`} legacyBehavior>
              <a className="inline-flex items-center px-6 py-3 border border-transparent text-base font-medium rounded-md shadow-sm text-white bg-brand_blue hover:bg-brand_blue/90 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-brand_blue">
                <ArrowLeftIcon className="h-5 w-5 mr-2" />
                Volver a los detalles del curso
              </a>
            </Link>
          )}
        </div>
      </div>
      </>
    );
  }

  // Module not found state (after loading and no error, but module is null)
  if (!module) {
    const courseIdForLink = Array.isArray(courseIdQuery) ? courseIdQuery[0] : courseIdQuery;
    return (
      <>
        <Header user={user} isAdmin={isAdmin} avatarUrl={avatarUrl} />
        <div className="flex flex-col justify-center items-center h-screen bg-gray-100 p-4 pt-40">
        <Head>
          <title>Módulo no encontrado</title>
        </Head>
        <div className="text-center">
          <h2 className="text-2xl font-bold text-gray-700 mb-4">Módulo no disponible</h2>
          <p className="text-gray-500 mb-6">No se pudo cargar la información del módulo. Es posible que no exista o haya sido eliminado.</p>
          {isValidUUID(courseIdForLink) && (
            <Link href={`/admin/course-builder/${courseIdForLink}`} legacyBehavior>
              <a className="inline-flex items-center px-6 py-3 border border-transparent text-base font-medium rounded-md shadow-sm text-white bg-brand_blue hover:bg-brand_blue/90 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-brand_blue">
                <ArrowLeftIcon className="h-5 w-5 mr-2" />
                Volver a los detalles del curso
              </a>
            </Link>
          )}
        </div>
      </div>
      </>
    );
  }

  // Simplified success rendering: module title and description
  return (
    <>
      <Header user={user} isAdmin={isAdmin} avatarUrl={avatarUrl} />
      <div className="min-h-screen bg-gray-100 px-4 md:px-8 py-4 md:py-8 pt-16">
      <Head>
        <title>Módulo: {module.title || 'Detalle'}</title>
      </Head>
      <div className="max-w-4xl mx-auto bg-white p-6 rounded-lg shadow-lg mt-48">
        <div className="mb-6">
          <Link href={`/admin/course-builder/${module.course_id}`} legacyBehavior>
            <a className="inline-flex items-center text-brand_blue hover:text-brand_yellow font-mont text-sm">
              <ArrowLeftIcon className="h-5 w-5 mr-1" />
              Volver a los detalles del curso
            </a>
          </Link>
        </div>
        <h1 className="text-3xl font-bold text-brand_blue mb-2 font-mont">
          Módulo: {module.title}
        </h1>
        {module.description && (
          <p className="text-gray-700 mb-6 text-md">{module.description}</p>
        )}
        <div className="mt-8 border-t pt-6">
          <h2 className="text-2xl font-semibold text-brand_blue mb-4 font-mont">Lecciones</h2>
          {lessons.length === 0 ? (
            <div className="text-center py-10 px-6 bg-gray-50 rounded-lg border-2 border-dashed border-gray-300">
              <svg className="mx-auto h-12 w-12 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                <path vectorEffect="non-scaling-stroke" strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 13h6m-3-3v6m-9 1V7a2 2 0 012-2h6l2 2h6a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2z" />
              </svg>
              <h3 className="mt-2 text-lg font-medium text-gray-800 font-mont">Este módulo aún no tiene lecciones</h3>
              <p className="mt-1 text-sm text-gray-600">Comienza por agregar la primera.</p>
              <div className="mt-6">
                <button
                  type="button"
                  onClick={handleCreateFirstLesson}
                  disabled={isCreatingLesson}
                  className="inline-flex items-center px-6 py-3 border border-transparent shadow-sm text-base font-medium rounded-md text-white bg-brand_blue hover:bg-brand_blue/90 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-brand_blue disabled:opacity-50 transition-colors duration-150"
                >
                  <PlusCircleIcon className="-ml-1 mr-3 h-6 w-6" aria-hidden="true" />
                  {isCreatingLesson ? 'Creando lección...' : 'Crear Primera Lección'}
                </button>
              </div>
            </div>
          ) : (
            <>
              <ul className="space-y-4">
                {lessons.map((lesson) => (
                  <li key={lesson.id} className="bg-white p-4 rounded-lg shadow-sm border border-gray-200 flex justify-between items-center">
                    <div>
                      <h3 className="text-lg font-semibold font-mont text-gray-800">{lesson.order_number}. {lesson.title}</h3>
                    </div>
                    <div className="flex flex-wrap space-x-2 gap-y-2">
                      <Link 
                        href={`/admin/course-builder/${module.course_id}/${module.id}/${lesson.id}`} 
                        legacyBehavior
                      >
                        <a 
                          className="px-3 py-2 bg-brand_yellow text-brand_blue font-mont rounded-md hover:bg-brand_blue hover:text-white transition text-xs md:text-sm"
                          onClick={(e) => {
                            // e.preventDefault(); // Uncomment this if you want to prevent navigation for testing the click log only
                            const href = `/admin/course-builder/${module.course_id}/${module.id}/${lesson.id}`;
                            console.log(`[ModuleDetailPage] 'Editar Lección' clicked for lesson ID: ${lesson.id}. Navigating to: ${href}`);
                          }}
                        >
                          Editar
                        </a>
                      </Link>
                      <button
                        onClick={() => handleOpenMoveModal(lesson)}
                        className="px-3 py-2 bg-brand_blue text-white font-mont rounded-md hover:bg-brand_blue/90 transition text-xs md:text-sm"
                      >
                        Mover
                      </button>
                      <button
                        onClick={() => handleOpenDeleteModal(lesson)}
                        className="px-3 py-2 bg-red-600 text-white font-mont rounded-md hover:bg-red-700 transition text-xs md:text-sm"
                      >
                        Eliminar
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
              
              {/* Add New Lesson Button */}
              <div className="mt-6 text-center">
                <button
                  type="button"
                  onClick={handleCreateNewLesson}
                  disabled={isCreatingLesson}
                  className="inline-flex items-center px-6 py-3 border border-transparent shadow-sm text-base font-medium rounded-md text-white bg-brand_blue hover:bg-brand_yellow hover:text-brand_blue focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-brand_blue disabled:opacity-50 transition-colors duration-150"
                >
                  <PlusCircleIcon className="-ml-1 mr-3 h-6 w-6" aria-hidden="true" />
                  {isCreatingLesson ? 'Creando lección...' : 'Crear Una Nueva Lección'}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
      
      {/* Delete Lesson Modal */}
      {isDeleteModalOpen && selectedLessonForDeletion && (
        <DeleteLessonModal
          lessonTitle={selectedLessonForDeletion.title}
          isOpen={isDeleteModalOpen}
          onClose={handleCloseDeleteModal}
          onConfirm={handleConfirmDelete}
          isDeleting={isDeleting}
        />
      )}

      {/* Move Lesson Modal */}
      {isMoveModalOpen && selectedLessonForMove && module && (
        <MoveLessonModal
          lessonTitle={selectedLessonForMove.title}
          lessonId={selectedLessonForMove.id}
          currentModuleId={module.id}
          courseId={module.course_id}
          isOpen={isMoveModalOpen}
          onClose={handleCloseMoveModal}
          onConfirm={handleConfirmMove}
          isMoving={isMoving}
        />
      )}
    </div>
    </>
  );
};

export default ModuleDetailPage;
