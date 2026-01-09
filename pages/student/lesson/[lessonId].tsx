import { useSupabaseClient } from '@supabase/auth-helpers-react';
import { supabase } from '../../../lib/supabase';
import { useEffect, useState, useRef } from 'react';
import { useRouter } from 'next/router';

import Head from 'next/head';
import { ArrowLeft, ArrowRight, CheckCircle, Clock, ThumbsUp, Star, BookOpen, Menu, X, List } from 'lucide-react';
import { toast } from 'react-hot-toast';
import StudentBlockRenderer from '../../../components/student/StudentBlockRenderer';
import MainLayout from '../../../components/layout/MainLayout';
import { ResponsiveFunctionalPageHeader } from '../../../components/layout/FunctionalPageHeader';
import { FileText, ChevronLeft, ChevronRight } from 'lucide-react';
import { getUserPrimaryRole } from '../../../utils/roleUtils';
import LessonSidebar from '../../../components/student/LessonSidebar';

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
  order_number: number;
  module_id?: string;
  course_id?: string;
  module?: {
    id: string;
    course_id: string;
    order_number: number;
  };
}

interface CourseModule {
  id: string;
  title: string;
  order_number: number;
  lessons: { id: string; title: string; order_number: number; module_id?: string }[];
}

interface LessonProgressForSidebar {
  lessonId: string;
  completedBlocks: number;
  totalBlocks: number;
  isCompleted: boolean;
}

interface Progress {
  blockId: string;
  completed: boolean;
  completedAt?: string;
  timeSpent: number;
  completionData: any;
}

export default function StudentLessonViewer() {
  const supabase = useSupabaseClient();
  const router = useRouter();
  const { lessonId } = router.query;

  const [lesson, setLesson] = useState<Lesson | null>(null);
  const [blocks, setBlocks] = useState<Block[]>([]);
  const [currentBlockIndex, setCurrentBlockIndex] = useState(0);
  const [progress, setProgress] = useState<Record<string, Progress>>({});
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState<any>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [avatarUrl, setAvatarUrl] = useState('');
  const [profileName, setProfileName] = useState('');
  const [startTime, setStartTime] = useState<Date>(new Date());
  const [showCompletionPage, setShowCompletionPage] = useState(false);
  const [nextLesson, setNextLesson] = useState<any>(null);
  const [previousLesson, setPreviousLesson] = useState<any>(null);
  const [courseCompleted, setCourseCompleted] = useState(false);

  // Sidebar state
  const [showSidebar, setShowSidebar] = useState(false);
  const [courseTitle, setCourseTitle] = useState('');
  const [courseStructureType, setCourseStructureType] = useState<'simple' | 'structured'>('simple');
  const [courseModules, setCourseModules] = useState<CourseModule[]>([]);
  const [courseDirectLessons, setCourseDirectLessons] = useState<{ id: string; title: string; order_number: number }[]>([]);
  const [allLessonsProgress, setAllLessonsProgress] = useState<Record<string, LessonProgressForSidebar>>({});

  // Ref for scrolling to top on lesson change
  const contentRef = useRef<HTMLDivElement>(null);

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

        // Check if user is admin and get profile data
        try {
          const { data: profileData } = await supabase
            .from('profiles')
            .select('first_name, last_name, avatar_url')
            .eq('id', session.user.id)
            .single();
          
          if (profileData) {
            const userRole = await getUserPrimaryRole(session.user.id);
            setIsAdmin(userRole === 'admin');
            
            if (profileData.first_name && profileData.last_name) {
              setProfileName(`${profileData.first_name} ${profileData.last_name}`);
            }
            
            if (profileData.avatar_url) {
              setAvatarUrl(profileData.avatar_url);
            }
          }
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
              course_id,
              order_number
            )
          `)
          .eq('id', lessonId)
          .single();

        if (lessonError) throw lessonError;
        setLesson(lessonData);

        // Fetch next lesson in the course for navigation
        // Handle both structured (with modules) and simple courses
        const courseId = lessonData?.module?.course_id || lessonData?.course_id;
        
        if (courseId) {
          try {
            // Check if this is a simple course (no modules)
            if (!lessonData.module_id && lessonData.course_id) {
              // Simple course: find next lesson directly by course_id
              const { data: nextLessonData, error: nextLessonError } = await supabase
                .from('lessons')
                .select('id, title, order_number')
                .eq('course_id', lessonData.course_id)
                .is('module_id', null)
                .gt('order_number', lessonData.order_number)
                .order('order_number', { ascending: true })
                .limit(1)
                .single();

              if (!nextLessonError && nextLessonData) {
                setNextLesson(nextLessonData);
              } else {
                // No more lessons in simple course
                setCourseCompleted(true);
              }
            } else if (lessonData?.module?.course_id) {
              // Structured course: existing logic for modules
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
            }
          // Also fetch previous lesson for navigation
              if (!lessonData.module_id && lessonData.course_id) {
                // Simple course: find previous lesson
                const { data: prevLessonData } = await supabase
                  .from('lessons')
                  .select('id, title, order_number')
                  .eq('course_id', lessonData.course_id)
                  .is('module_id', null)
                  .lt('order_number', lessonData.order_number)
                  .order('order_number', { ascending: false })
                  .limit(1)
                  .single();

                if (prevLessonData) {
                  setPreviousLesson(prevLessonData);
                }
              } else if (lessonData?.module_id) {
                // Structured course: find previous lesson in same module first
                const { data: prevLessonData } = await supabase
                  .from('lessons')
                  .select('id, title, order_number')
                  .eq('module_id', lessonData.module_id)
                  .lt('order_number', lessonData.order_number)
                  .order('order_number', { ascending: false })
                  .limit(1)
                  .single();

                if (prevLessonData) {
                  setPreviousLesson(prevLessonData);
                } else if (lessonData.module?.order_number > 1) {
                  // Check previous module
                  const { data: prevModuleData } = await supabase
                    .from('modules')
                    .select('id, title, lessons(id, title, order_number)')
                    .eq('course_id', lessonData.module.course_id)
                    .lt('order_number', lessonData.module.order_number)
                    .order('order_number', { ascending: false })
                    .limit(1)
                    .single();

                  if (prevModuleData?.lessons?.length > 0) {
                    const lastLessonInPrevModule = prevModuleData.lessons
                      .sort((a: any, b: any) => b.order_number - a.order_number)[0];
                    setPreviousLesson(lastLessonInPrevModule);
                  }
                }
              }
            } catch (error) {
            console.error('Error fetching next/previous lesson:', error);
          }

          // Fetch course data for sidebar
          try {
            const { data: courseData, error: courseError } = await supabase
              .from('courses')
              .select('id, title, structure_type')
              .eq('id', courseId)
              .single();

            if (!courseError && courseData) {
              setCourseTitle(courseData.title);
              setCourseStructureType(courseData.structure_type || 'simple');

              // Fetch all lessons for the sidebar
              if (courseData.structure_type === 'simple') {
                const { data: allLessons } = await supabase
                  .from('lessons')
                  .select('id, title, order_number')
                  .eq('course_id', courseId)
                  .is('module_id', null)
                  .order('order_number', { ascending: true });

                setCourseDirectLessons(allLessons || []);

                // Fetch progress for all lessons
                if (allLessons && allLessons.length > 0) {
                  const lessonIds = allLessons.map(l => l.id);
                  const progressLookup: Record<string, LessonProgressForSidebar> = {};

                  for (const lessonItem of allLessons) {
                    // Get block count
                    const { count: blockCount } = await supabase
                      .from('blocks')
                      .select('*', { count: 'exact', head: true })
                      .eq('lesson_id', lessonItem.id);

                    // Get completed blocks
                    const { data: completedBlocksData } = await supabase
                      .from('lesson_progress')
                      .select('block_id')
                      .eq('lesson_id', lessonItem.id)
                      .eq('user_id', session.user.id)
                      .not('completed_at', 'is', null);

                    const totalBlocks = blockCount || 0;
                    const completedBlocks = completedBlocksData?.length || 0;

                    progressLookup[lessonItem.id] = {
                      lessonId: lessonItem.id,
                      completedBlocks,
                      totalBlocks,
                      isCompleted: totalBlocks > 0 && completedBlocks >= totalBlocks
                    };
                  }

                  setAllLessonsProgress(progressLookup);
                }
              } else {
                // Structured course with modules
                const { data: modulesData } = await supabase
                  .from('modules')
                  .select('id, title, order_number')
                  .eq('course_id', courseId)
                  .order('order_number', { ascending: true });

                if (modulesData) {
                  const modulesWithLessons: CourseModule[] = [];
                  const progressLookup: Record<string, LessonProgressForSidebar> = {};

                  for (const module of modulesData) {
                    const { data: moduleLessons } = await supabase
                      .from('lessons')
                      .select('id, title, order_number, module_id')
                      .eq('module_id', module.id)
                      .order('order_number', { ascending: true });

                    modulesWithLessons.push({
                      ...module,
                      lessons: moduleLessons || []
                    });

                    // Fetch progress for each lesson
                    for (const lessonItem of moduleLessons || []) {
                      const { count: blockCount } = await supabase
                        .from('blocks')
                        .select('*', { count: 'exact', head: true })
                        .eq('lesson_id', lessonItem.id);

                      const { data: completedBlocksData } = await supabase
                        .from('lesson_progress')
                        .select('block_id')
                        .eq('lesson_id', lessonItem.id)
                        .eq('user_id', session.user.id)
                        .not('completed_at', 'is', null);

                      const totalBlocks = blockCount || 0;
                      const completedBlocks = completedBlocksData?.length || 0;

                      progressLookup[lessonItem.id] = {
                        lessonId: lessonItem.id,
                        completedBlocks,
                        totalBlocks,
                        isCompleted: totalBlocks > 0 && completedBlocks >= totalBlocks
                      };
                    }
                  }

                  setCourseModules(modulesWithLessons);
                  setAllLessonsProgress(progressLookup);
                }
              }
            }
          } catch (error) {
            console.error('Error fetching course data for sidebar:', error);
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

  // Scroll to top when lesson changes and reset completion page state
  useEffect(() => {
    if (lessonId) {
      setShowCompletionPage(false);
      setCurrentBlockIndex(0);
      if (contentRef.current) {
        contentRef.current.scrollTop = 0;
      }
      window.scrollTo(0, 0);
    }
  }, [lessonId]);

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
      // Use onConflict to update existing block records instead of creating duplicates
      const { error } = await supabase
        .from('lesson_progress')
        .upsert({
          user_id: user.id,
          lesson_id: lessonId,
          block_id: blockId,
          completed_at: data.completed ? new Date().toISOString() : null,
          time_spent: updatedProgress.timeSpent || 0,
          completion_data: updatedProgress.completionData || {}
        }, {
          onConflict: 'user_id,lesson_id,block_id'
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

  const handleLogout = async () => {
    await supabase.auth.signOut();
    localStorage.removeItem('rememberMe');
    sessionStorage.removeItem('sessionOnly');
    router.push('/login');
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-100 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-[#0a0a0a] mx-auto mb-4"></div>
          <p className="text-[#0a0a0a] font-medium">Cargando lección...</p>
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
            className="px-4 py-2 bg-[#0a0a0a] text-white rounded-md hover:bg-[#fbbf24] hover:text-[#0a0a0a] transition"
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
            className="px-4 py-2 bg-[#0a0a0a] text-white rounded-md hover:bg-[#fbbf24] hover:text-[#0a0a0a] transition"
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
          <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-[#0a0a0a] mx-auto mb-4"></div>
          <p className="text-[#0a0a0a] font-medium">Cargando lección...</p>
        </div>
      </div>
    );
  }

  return (
    <MainLayout 
      user={user} 
      currentPage="courses"
      pageTitle=""
      breadcrumbs={[]}
      isAdmin={isAdmin}
      onLogout={handleLogout}
      avatarUrl={avatarUrl}
    >
      <ResponsiveFunctionalPageHeader
        icon={<FileText />}
        title={lesson.title}
        subtitle={showCompletionPage ? "Lección completada" : `Bloque ${currentBlockIndex + 1} de ${blocks.length}`}
      >
        {/* Sidebar toggle button */}
        <button
          onClick={() => setShowSidebar(!showSidebar)}
          className="px-3 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-[#0a0a0a]"
          title="Ver lista de lecciones"
        >
          <List className="w-4 h-4" />
        </button>

        <button
          onClick={() => {
            if (isAdmin && lesson?.module?.course_id && lesson?.module?.id) {
              router.push(`/admin/course-builder/${lesson.module.course_id}/${lesson.module.id}/${lessonId}`);
            } else if (isAdmin && lesson?.module_id && lesson?.module?.course_id) {
              router.push(`/admin/course-builder/${lesson.module.course_id}/${lesson.module_id}/${lessonId}`);
            } else {
              router.back();
            }
          }}
          className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-[#0a0a0a]"
        >
          <ChevronLeft className="w-4 h-4 inline mr-1" />
          {isAdmin ? "Volver al Editor" : "Volver"}
        </button>
        
        <div className="flex items-center gap-3">
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
          
          <div className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md">
            <span>Progreso:</span>
            <div className="flex items-center gap-2">
              <div className="w-24 bg-gray-200 rounded-full h-2">
                <div 
                  className="bg-[#fbbf24] h-2 rounded-full transition-all duration-300"
                  style={{ width: `${showCompletionPage ? 100 : getProgressPercentage()}%` }}
                ></div>
              </div>
              <span className="font-bold text-[#10B981]">
                {showCompletionPage ? 100 : getProgressPercentage()}%
              </span>
            </div>
          </div>
          
          {!showCompletionPage && (
            <div className="flex gap-2">
              <button
                onClick={goToPreviousBlock}
                disabled={currentBlockIndex === 0}
                className="px-3 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                title="Bloque anterior"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <button
                onClick={goToNextBlock}
                disabled={!canProceedToNext()}
                className="px-3 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                title="Siguiente bloque"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          )}
        </div>
        
        {isAdmin && (
          <span className="px-2 py-1 bg-blue-100 text-blue-800 text-xs rounded-full">ADMIN</span>
        )}
      </ResponsiveFunctionalPageHeader>

      <div className="min-h-screen bg-gray-100 flex">
        {/* Sidebar */}
        {showSidebar && (
          <div className="fixed inset-0 z-40 lg:relative lg:inset-auto">
            {/* Overlay for mobile */}
            <div
              className="fixed inset-0 bg-black/50 lg:hidden"
              onClick={() => setShowSidebar(false)}
            />

            {/* Sidebar panel */}
            <div className="fixed left-0 top-0 h-full w-72 bg-white shadow-lg z-50 lg:relative lg:shadow-none">
              {/* Close button for mobile */}
              <button
                onClick={() => setShowSidebar(false)}
                className="absolute top-4 right-4 p-1 text-gray-500 hover:text-gray-700 lg:hidden"
              >
                <X className="w-5 h-5" />
              </button>

              <LessonSidebar
                courseId={lesson?.module?.course_id || lesson?.course_id || ''}
                courseTitle={courseTitle}
                structureType={courseStructureType}
                modules={courseModules}
                directLessons={courseDirectLessons}
                currentLessonId={lessonId as string}
                progress={allLessonsProgress}
                onClose={() => setShowSidebar(false)}
              />
            </div>
          </div>
        )}

        {/* Main Content */}
        <div className="flex-1" ref={contentRef}>
        {showCompletionPage ? (
          /* Completion Page */
          <div className="max-w-4xl mx-auto p-6 pt-8">
            <div className="bg-gradient-to-br from-[#0a0a0a] to-[#004a7c] rounded-2xl p-8 text-white text-center relative overflow-hidden min-h-[500px] flex items-center justify-center">
              {/* Background decorations */}
              <div className="absolute inset-0 opacity-10">
                <div className="absolute top-4 left-4">
                  <Star className="w-6 h-6 text-[#fbbf24]" />
                </div>
                <div className="absolute top-8 right-8">
                  <Star className="w-4 h-4 text-[#fbbf24]" />
                </div>
                <div className="absolute bottom-6 left-8">
                  <Star className="w-5 h-5 text-[#fbbf24]" />
                </div>
                <div className="absolute bottom-4 right-4">
                  <Star className="w-3 h-3 text-[#fbbf24]" />
                </div>
              </div>
              
              {/* Main content */}
              <div className="relative z-10">
                <div className="flex justify-center mb-6">
                  <div className="bg-[#fbbf24] rounded-full p-4">
                    <ThumbsUp className="w-12 h-12 text-[#0a0a0a]" />
                  </div>
                </div>
                
                <h2 className="text-3xl font-bold mb-4">
                  ¡Felicidades!
                </h2>
                
                <h3 className="text-xl font-semibold mb-3 text-[#fbbf24]">
                  Has completado la lección
                </h3>
                
                <p className="text-lg mb-6 opacity-90">
                  {lesson?.title}
                </p>
                
                <div className="bg-white/10 backdrop-blur-sm rounded-lg p-4 mb-6">
                  <div className="flex justify-center items-center gap-6 text-sm">
                    <div className="flex items-center gap-2">
                      <BookOpen className="w-5 h-5 text-[#fbbf24]" />
                      <span>{blocks.length} bloques completados</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Clock className="w-5 h-5 text-[#fbbf24]" />
                      <span>
                        {Math.floor(
                          Object.values(progress).reduce((total, p) => total + (p.timeSpent || 0), 0) / 60
                        )} min total
                      </span>
                    </div>
                  </div>
                </div>
                
                <div className="flex justify-center gap-4 flex-wrap">
                  {/* Previous Lesson button */}
                  {previousLesson ? (
                    <button
                      onClick={() => router.push(`/student/lesson/${previousLesson.id}`)}
                      className="px-6 py-3 bg-white/20 text-white rounded-lg font-medium hover:bg-white/30 transition flex items-center gap-2 border border-white/30"
                    >
                      <ArrowLeft className="w-4 h-4" />
                      Lección Anterior
                    </button>
                  ) : (
                    <button
                      onClick={() => router.push('/dashboard')}
                      className="px-6 py-3 bg-white text-[#0a0a0a] rounded-lg font-medium hover:bg-gray-100 transition flex items-center gap-2"
                    >
                      <ArrowLeft className="w-4 h-4" />
                      Volver a mi Panel
                    </button>
                  )}

                  {/* Next Lesson button */}
                  {nextLesson ? (
                    <button
                      onClick={() => router.push(`/student/lesson/${nextLesson.id}`)}
                      className="px-6 py-3 bg-[#fbbf24] text-[#0a0a0a] rounded-lg font-medium hover:bg-yellow-400 transition flex items-center gap-2"
                    >
                      Siguiente Lección
                      <ArrowRight className="w-4 h-4" />
                    </button>
                  ) : courseCompleted ? (
                    <button
                      onClick={() => {
                        const courseId = lesson?.module?.course_id || lesson?.course_id;
                        if (courseId) {
                          router.push(`/student/course/${courseId}`);
                        } else {
                          router.push('/dashboard');
                        }
                      }}
                      className="px-6 py-3 bg-[#fbbf24] text-[#0a0a0a] rounded-lg font-medium hover:bg-yellow-400 transition flex items-center gap-2"
                    >
                      <CheckCircle className="w-4 h-4" />
                      Ver Curso Completado
                    </button>
                  ) : (
                    <button
                      onClick={() => router.push('/dashboard')}
                      className="px-6 py-3 bg-[#fbbf24] text-[#0a0a0a] rounded-lg font-medium hover:bg-yellow-400 transition flex items-center gap-2"
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
                  lessonId={lessonId as string}
                  courseId={lesson?.module?.course_id}
                  studentId={user?.id}
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
                    : 'bg-[#0a0a0a] text-white hover:bg-[#fbbf24] hover:text-[#0a0a0a]'
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
        </div> {/* End of flex-1 content wrapper */}
      </div>
    </MainLayout>
  );
}