import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import { useSupabaseClient } from '@supabase/auth-helpers-react';
import Head from 'next/head';
import { ArrowLeft, ArrowRight, CheckCircle, Clock, Trophy, Star, BookOpen } from 'lucide-react';
import { toast } from 'react-hot-toast';
import StudentBlockRenderer from '../../../components/student/StudentBlockRenderer';
import Header from '../../../components/layout/Header';

// Types
interface Block {
  id: string;
  type: string;
  payload: any;
  position: number;
}

interface Lesson {
  id: string;
  title: string;
  content: any;
  module_id?: string;
  module?: {
    id: string;
    course_id: string;
  };
}

interface Progress {
  blockId: string;
  completed: boolean;
  completedAt?: string;
  timeSpent: number;
  completionData: any;
}

export default function StudentLessonViewer() {
  const router = useRouter();
  const { lessonId } = router.query;
  const supabase = useSupabaseClient();

  const [lesson, setLesson] = useState<Lesson | null>(null);
  const [blocks, setBlocks] = useState<Block[]>([]);
  const [currentBlockIndex, setCurrentBlockIndex] = useState(0);
  const [progress, setProgress] = useState<Record<string, Progress>>({});
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState<any>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [startTime, setStartTime] = useState<Date>(new Date());
  const [showCompletionPage, setShowCompletionPage] = useState(false);
  const [nextLesson, setNextLesson] = useState<any>(null);
  const [courseCompleted, setCourseCompleted] = useState(false);

  useEffect(() => {
    const initializeViewer = async () => {
      if (!router.isReady || !lessonId) return;
      
      console.log('=== LESSON VIEWER INITIALIZATION ===');
      console.log('Router query:', router.query);
      console.log('lessonId from router:', lessonId);
      console.log('typeof lessonId:', typeof lessonId);
      console.log('Router pathname:', router.pathname);
      console.log('Router asPath:', router.asPath);

      try {
        // Get current user
        const { data: { session } } = await supabase.auth.getSession();
        if (!session?.user) {
          router.push('/auth/login');
          return;
        }
        setUser(session.user);

        // Check if user is admin
        try {
          const { data: profileData } = await supabase
            .from('profiles')
            .select('role')
            .eq('id', session.user.id)
            .single();
          setIsAdmin(profileData?.role === 'admin');
        } catch (error) {
          console.error('Error checking admin status:', error);
          setIsAdmin(false);
        }

        // Fetch lesson data with module info for proper navigation
        const { data: lessonData, error: lessonError } = await supabase
          .from('lessons')
          .select(`
            *,
            module:modules(
              id,
              course_id
            )
          `)
          .eq('id', lessonId)
          .single();

        if (lessonError) throw lessonError;
        setLesson(lessonData);

        // Fetch next lesson in the course for navigation
        if (lessonData?.module?.course_id) {
          try {
            const { data: nextLessonData, error: nextLessonError } = await supabase
              .from('lessons')
              .select(`
                id,
                title,
                order_number,
                module:modules(
                  id,
                  title,
                  order_number
                )
              `)
              .eq('module_id', lessonData.module_id)
              .gt('order_number', lessonData.order_number)
              .order('order_number', { ascending: true })
              .limit(1)
              .single();

            if (!nextLessonError && nextLessonData) {
              setNextLesson(nextLessonData);
            } else {
              // Check if there's a next module with lessons
              const { data: nextModuleData, error: nextModuleError } = await supabase
                .from('modules')
                .select(`
                  id,
                  title,
                  lessons(id, title, order_number)
                `)
                .eq('course_id', lessonData.module.course_id)
                .gt('order_number', lessonData.module.order_number)
                .order('order_number', { ascending: true })
                .limit(1)
                .single();

              if (!nextModuleError && nextModuleData?.lessons?.length > 0) {
                const firstLessonInNextModule = nextModuleData.lessons
                  .sort((a: any, b: any) => a.order_number - b.order_number)[0];
                setNextLesson({
                  ...firstLessonInNextModule,
                  module: { id: nextModuleData.id, title: nextModuleData.title }
                });
              } else {
                setCourseCompleted(true);
              }
            }
          } catch (error) {
            console.error('Error fetching next lesson:', error);
          }
        }

        // Debug: log the lesson data structure
        console.log('Lesson data:', lessonData);
        console.log('Lesson content:', lessonData?.content);

        // FIXED: Fetch blocks from the blocks table (they're not stored in lesson content)
        console.log('Fetching blocks from blocks table for lesson:', lessonId);
        const { data: blocksData, error: blocksError } = await supabase
          .from('blocks')
          .select('*')
          .eq('lesson_id', lessonId)
          .order('position', { ascending: true });

        if (blocksError) {
          console.error('Error fetching blocks:', blocksError);
          throw blocksError;
        }
        
        console.log('Blocks data from table:', blocksData);
        setBlocks(blocksData || []);

        // Fetch user progress for this lesson
        const { data: progressData, error: progressError } = await supabase
          .from('lesson_progress')
          .select('*')
          .eq('user_id', session.user.id)
          .eq('lesson_id', lessonId);

        if (progressError) throw progressError;

        // Convert progress array to lookup object
        const progressLookup: Record<string, Progress> = {};
        progressData?.forEach(p => {
          progressLookup[p.block_id] = {
            blockId: p.block_id,
            completed: !!p.completed_at,
            completedAt: p.completed_at,
            timeSpent: p.time_spent || 0,
            completionData: p.completion_data || {}
          };
        });
        setProgress(progressLookup);

        // Find the furthest incomplete block to resume from
        let resumeIndex = 0;
        for (let i = 0; i < (blocksData?.length || 0); i++) {
          const block = blocksData?.[i];
          if (block && !progressLookup[block.id]?.completed) {
            resumeIndex = i;
            break;
          }
          if (i === (blocksData?.length || 1) - 1) resumeIndex = i; // If all complete, show last
        }
        setCurrentBlockIndex(resumeIndex);

      } catch (error: any) {
        console.error('Error initializing viewer:', error);
        console.error('Error details:', error.message);
        toast.error(`Error cargando la lección: ${error.message}`);
      } finally {
        setLoading(false);
      }
    };

    initializeViewer();
  }, [router.isReady, lessonId]);

  const updateProgress = async (blockId: string, data: Partial<Progress>) => {
    if (!user || !lessonId) return;

    try {
      const existingProgress = progress[blockId];
      const updatedProgress = {
        ...existingProgress,
        ...data,
        blockId
      };

      setProgress(prev => ({ ...prev, [blockId]: updatedProgress }));

      // Save to database
      const { error } = await supabase
        .from('lesson_progress')
        .upsert({
          user_id: user.id,
          lesson_id: lessonId,
          block_id: blockId,
          completed_at: data.completed ? new Date().toISOString() : null,
          time_spent: updatedProgress.timeSpent || 0,
          completion_data: updatedProgress.completionData || {}
        });

      if (error) throw error;

    } catch (error: any) {
      console.error('Error updating progress:', error);
      toast.error('Error guardando progreso');
    }
  };

  const markBlockCompleted = async (blockId: string, completionData: any = {}) => {
    await updateProgress(blockId, {
      completed: true,
      completedAt: new Date().toISOString(),
      timeSpent: Math.floor((Date.now() - startTime.getTime()) / 1000),
      completionData
    });

    // Reset start time for next block
    setStartTime(new Date());
  };

  const canProceedToNext = () => {
    const currentBlock = blocks[currentBlockIndex];
    if (!currentBlock) return false;
    // Admins can always proceed
    return isAdmin || progress[currentBlock.id]?.completed || false;
  };

  const goToNextBlock = () => {
    if (currentBlockIndex < blocks.length - 1 && (isAdmin || canProceedToNext())) {
      setCurrentBlockIndex(currentBlockIndex + 1);
      setStartTime(new Date());
    } else if (currentBlockIndex === blocks.length - 1 && (isAdmin || canProceedToNext())) {
      // Show completion page when clicking "Siguiente" from the last block
      setShowCompletionPage(true);
    }
  };

  const goToPreviousBlock = () => {
    if (showCompletionPage) {
      // Go back from completion page to last block
      setShowCompletionPage(false);
    } else if (currentBlockIndex > 0) {
      setCurrentBlockIndex(currentBlockIndex - 1);
      setStartTime(new Date());
    }
  };

  const getCompletedBlocksCount = () => {
    return Object.values(progress).filter(p => p.completed).length;
  };

  const getProgressPercentage = () => {
    if (blocks.length === 0) return 0;
    // For admins, consider all blocks up to current index as "viewed"
    if (isAdmin) {
      return Math.round(((currentBlockIndex + 1) / blocks.length) * 100);
    }
    // For students, use actual completion count
    return Math.round((getCompletedBlocksCount() / blocks.length) * 100);
  };

  const getEffectiveCompletedCount = () => {
    if (blocks.length === 0) return 0;
    // For admins, count all blocks up to current index
    if (isAdmin) {
      return currentBlockIndex + 1;
    }
    // For students, use actual completion count
    return getCompletedBlocksCount();
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-100 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-[#00365b] mx-auto mb-4"></div>
          <p className="text-[#00365b] font-medium">Cargando lección...</p>
        </div>
      </div>
    );
  }

  if (!lesson) {
    return (
      <div className="min-h-screen bg-gray-100 flex items-center justify-center">
        <div className="text-center">
          <p className="text-red-600 mb-4">No se pudo cargar la lección</p>
          <button
            onClick={() => router.back()}
            className="px-4 py-2 bg-[#00365b] text-white rounded-md hover:bg-[#fdb933] hover:text-[#00365b] transition"
          >
            Volver
          </button>
        </div>
      </div>
    );
  }

  if (blocks.length === 0) {
    return (
      <div className="min-h-screen bg-gray-100 flex items-center justify-center">
        <div className="text-center">
          <p className="text-gray-600 mb-4">Esta lección no tiene contenido aún</p>
          <p className="text-sm text-gray-500 mb-4">La lección está en construcción</p>
          <button
            onClick={() => router.back()}
            className="px-4 py-2 bg-[#00365b] text-white rounded-md hover:bg-[#fdb933] hover:text-[#00365b] transition"
          >
            Volver al Curso
          </button>
        </div>
      </div>
    );
  }

  const currentBlock = blocks[currentBlockIndex];

  // Don't render until we have blocks or are showing completion page
  if (!showCompletionPage && (!blocks.length || !currentBlock)) {
    return (
      <div className="min-h-screen bg-gray-100 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-[#00365b] mx-auto mb-4"></div>
          <p className="text-[#00365b] font-medium">Cargando lección...</p>
        </div>
      </div>
    );
  }

  return (
    <>
      <Head>
        <title>{lesson.title} | FNE LMS</title>
      </Head>
      
      <div className="min-h-screen bg-gray-100">
        <Header user={user} isAdmin={isAdmin} />
        
        {/* Lesson Sub-Header */}
        <div className="bg-white shadow-sm border-b px-4 py-3 mt-24">
          <div className="max-w-4xl mx-auto flex items-center justify-between">
            <div className="flex items-center gap-4">
              <button
                onClick={() => {
                  // If admin and we have complete lesson module info, go back to editor
                  if (isAdmin && lesson?.module?.course_id && lesson?.module?.id) {
                    router.push(`/admin/course-builder/${lesson.module.course_id}/${lesson.module.id}/${lessonId}`);
                  } else if (isAdmin && lesson?.module_id && lesson?.module?.course_id) {
                    // Fallback using module_id directly
                    router.push(`/admin/course-builder/${lesson.module.course_id}/${lesson.module_id}/${lessonId}`);
                  } else {
                    // Fallback to browser back
                    router.back();
                  }
                }}
                className="text-[#00365b] hover:text-[#fdb933] transition"
                title={isAdmin ? "Volver al Editor de Lección" : "Volver"}
              >
                <ArrowLeft size={24} />
              </button>
              <div>
                <h1 className="text-xl font-bold text-[#00365b]">{lesson.title}</h1>
                <p className="text-sm text-gray-600">
                  {showCompletionPage ? (
                    <>
                      Lección completada
                      {isAdmin && <span className="ml-2 px-2 py-1 bg-blue-100 text-blue-800 text-xs rounded-full">ADMIN</span>}
                    </>
                  ) : (
                    <>
                      Bloque {currentBlockIndex + 1} de {blocks.length}
                      {isAdmin && <span className="ml-2 px-2 py-1 bg-blue-100 text-blue-800 text-xs rounded-full">ADMIN</span>}
                    </>
                  )}
                </p>
              </div>
            </div>
            
            <div className="flex items-center gap-4">
              {!showCompletionPage && isAdmin && (
                <select
                  value={currentBlockIndex}
                  onChange={(e) => setCurrentBlockIndex(parseInt(e.target.value))}
                  className="text-sm border border-gray-300 rounded-md px-2 py-1 bg-white"
                >
                  {blocks.map((block, index) => (
                    <option key={block.id} value={index}>
                      Bloque {index + 1}: {block.type}
                    </option>
                  ))}
                </select>
              )}
              <div className="text-sm text-gray-600">
                Progreso: {showCompletionPage ? blocks.length : getEffectiveCompletedCount()}/{blocks.length} ({showCompletionPage ? 100 : getProgressPercentage()}%)
              </div>
              <div className="w-32 bg-gray-200 rounded-full h-2">
                <div 
                  className="bg-[#fdb933] h-2 rounded-full transition-all duration-300"
                  style={{ width: `${showCompletionPage ? 100 : getProgressPercentage()}%` }}
                ></div>
              </div>
            </div>
          </div>
        </div>

        {/* Main Content */}
        {showCompletionPage ? (
          /* Completion Page */
          <div className="max-w-4xl mx-auto p-6 pt-8">
            <div className="bg-gradient-to-br from-[#00365b] to-[#004a7c] rounded-2xl p-8 text-white text-center relative overflow-hidden min-h-[500px] flex items-center justify-center">
              {/* Background decorations */}
              <div className="absolute inset-0 opacity-10">
                <div className="absolute top-4 left-4">
                  <Star className="w-6 h-6 text-[#fdb933]" />
                </div>
                <div className="absolute top-8 right-8">
                  <Star className="w-4 h-4 text-[#fdb933]" />
                </div>
                <div className="absolute bottom-6 left-8">
                  <Star className="w-5 h-5 text-[#fdb933]" />
                </div>
                <div className="absolute bottom-4 right-4">
                  <Star className="w-3 h-3 text-[#fdb933]" />
                </div>
              </div>
              
              {/* Main content */}
              <div className="relative z-10">
                <div className="flex justify-center mb-6">
                  <div className="bg-[#fdb933] rounded-full p-4">
                    <Trophy className="w-12 h-12 text-[#00365b]" />
                  </div>
                </div>
                
                <h2 className="text-3xl font-bold mb-4">
                  ¡Felicidades!
                </h2>
                
                <h3 className="text-xl font-semibold mb-3 text-[#fdb933]">
                  Has completado la lección
                </h3>
                
                <p className="text-lg mb-6 opacity-90">
                  {lesson?.title}
                </p>
                
                <div className="bg-white/10 backdrop-blur-sm rounded-lg p-4 mb-6">
                  <div className="flex justify-center items-center gap-6 text-sm">
                    <div className="flex items-center gap-2">
                      <BookOpen className="w-5 h-5 text-[#fdb933]" />
                      <span>{blocks.length} bloques completados</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Clock className="w-5 h-5 text-[#fdb933]" />
                      <span>
                        {Math.floor(
                          Object.values(progress).reduce((total, p) => total + (p.timeSpent || 0), 0) / 60
                        )} min total
                      </span>
                    </div>
                  </div>
                </div>
                
                <div className="flex justify-center gap-4">
                  <button
                    onClick={() => router.push('/student/dashboard')}
                    className="px-6 py-3 bg-white text-[#00365b] rounded-lg font-medium hover:bg-gray-100 transition flex items-center gap-2"
                  >
                    <ArrowLeft className="w-4 h-4" />
                    Volver al Dashboard
                  </button>
                  
                  {nextLesson ? (
                    <button
                      onClick={() => router.push(`/student/lesson/${nextLesson.id}`)}
                      className="px-6 py-3 bg-[#fdb933] text-[#00365b] rounded-lg font-medium hover:bg-yellow-400 transition flex items-center gap-2"
                    >
                      Siguiente Lección
                      <ArrowRight className="w-4 h-4" />
                    </button>
                  ) : courseCompleted ? (
                    <div className="px-6 py-3 bg-[#fdb933] text-[#00365b] rounded-lg font-medium flex items-center gap-2">
                      <Trophy className="w-4 h-4" />
                      Curso Completado
                    </div>
                  ) : (
                    <button
                      onClick={() => router.push('/student/dashboard')}
                      className="px-6 py-3 bg-[#fdb933] text-[#00365b] rounded-lg font-medium hover:bg-yellow-400 transition flex items-center gap-2"
                    >
                      Ir al Dashboard
                      <ArrowRight className="w-4 h-4" />
                    </button>
                  )}
                </div>
                
                <p className="text-sm opacity-75 mt-4">
                  {nextLesson 
                    ? `¡Sigue así! Próxima lección: "${nextLesson.title}"`
                    : courseCompleted 
                      ? '¡Felicidades! Has completado todo el curso.'
                      : '¡Sigue así! Tu progreso ha sido guardado automáticamente.'
                  }
                </p>
              </div>
            </div>

            {/* Navigation for completion page */}
            <div className="flex justify-between items-center mt-6">
              <button
                onClick={goToPreviousBlock}
                className="flex items-center gap-2 px-4 py-2 rounded-md transition bg-gray-600 text-white hover:bg-gray-700"
              >
                <ArrowLeft size={16} />
                Anterior
              </button>
              <div></div>
            </div>
          </div>
        ) : (
          /* Normal Lesson Content */
          <div className="max-w-4xl mx-auto p-6 pt-8">
            {currentBlock ? (
              <div className="bg-white rounded-lg shadow-lg p-8 min-h-[500px]">
                {/* Block content rendered by StudentBlockRenderer */}
                <StudentBlockRenderer
                  block={currentBlock}
                  isCompleted={progress[currentBlock.id]?.completed || false}
                  onComplete={(completionData) => markBlockCompleted(currentBlock.id, completionData)}
                  onProgressUpdate={(data) => {
                    // Update progress tracking in real-time if needed
                  }}
                  isAdmin={isAdmin}
                />
              </div>
            ) : (
              <div className="bg-white rounded-lg shadow-lg p-8 min-h-[500px] flex items-center justify-center">
                <p className="text-gray-500">Cargando bloque...</p>
              </div>
            )}

            {/* Navigation */}
            <div className="flex justify-between items-center mt-6">
              <button
                onClick={goToPreviousBlock}
                disabled={currentBlockIndex === 0}
                className={`flex items-center gap-2 px-4 py-2 rounded-md transition ${
                  currentBlockIndex === 0
                    ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                    : 'bg-gray-600 text-white hover:bg-gray-700'
                }`}
              >
                <ArrowLeft size={16} />
                Anterior
              </button>

              <div className="flex items-center gap-4">
                {/* Completion is now handled by StudentBlockRenderer */}
              </div>

              <button
                onClick={goToNextBlock}
                disabled={!isAdmin && !canProceedToNext()}
                className={`flex items-center gap-2 px-4 py-2 rounded-md transition ${
                  !isAdmin && !canProceedToNext()
                    ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                    : 'bg-[#00365b] text-white hover:bg-[#fdb933] hover:text-[#00365b]'
                }`}
              >
                {currentBlockIndex === blocks.length - 1 
                  ? (isAdmin ? 'Finalizar (Admin)' : 'Finalizar') 
                  : (isAdmin ? 'Siguiente (Admin)' : 'Siguiente')
                }
                <ArrowRight size={16} />
              </button>
            </div>
          </div>
        )}
      </div>
    </>
  );
}